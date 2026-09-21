# TASK: Upgrade the trip-generation engine to a scored, transition-aware, optimisation-based itinerary planner (Geoapify-only, no Google Maps)

You are working in an existing Node.js + MongoDB travel-planner codebase. Read this whole prompt before writing code. Work in the phases below, in order. After each phase: run tests, summarise what changed, and report anything that blocked you or contradicted my assumptions. Do not start a phase until the previous phase's acceptance criteria pass.

Companion file: `itinerary_engine_pseudocode.md` is the logic specification. Follow it unless the codebase forces a change, and document any deviation in `docs/ENGINE_DESIGN.md`.

---

## 0. Ground rules

1. **Inspect first.** Before changing anything, read the repo: models (User, Trip, POI, Hotel, Restaurant, ChatConversation, Expense), the trip-generation pipeline, scoring/retrieval code, the deterministic fallback itinerary, route planning, the chat replace/remove flow, and every place that calls an external API. Write a short `docs/CURRENT_STATE.md` describing what exists. Do not assume; verify.
2. **No Google Maps Platform anywhere.** No Google Geocoding, Places, Directions, Distance Matrix, or Maps JS. Remove every existing use (see Phase 0). **Geoapify is the single provider** for geocoding, places search, place details, routing and route matrix. Open-Meteo stays for weather. Gemini (text generation only) stays for narration, pre-trip content and intent parsing; it is not a maps service and must never be used to look up coordinates or routes.
3. **Never delete or break the existing pipeline.** The current deterministic itinerary stays as the fallback (after its Google dependency is replaced). The new engine sits behind a feature flag (`ITINERARY_ENGINE=legacy|v2|shadow`). In `shadow` mode, run both, return legacy, and log v2's output and metrics.
4. **API contract is stable.** The trip JSON returned to the frontend may only change additively. Every recommendation keeps its `source` field (`dataset|gemini|geoapify|overpass`); add `overture` as a new source value.
5. **Do not invent data.** No ratings exist in the dataset. Do not fabricate ratings, fees, hours or years. Unknown stays `null` with a provenance record.
6. **Gemini never selects POIs.** POI selection and sequencing are done by code. Keep the existing ID validation.
7. **Everything tunable lives in config files**: `config/engine.weights.json`, `config/categories.json`, `config/category_time_profiles.json`, `config/category_transition_prior.json`, `config/dwell_priors.json`, `config/geoapify.json` (category mappings, rate limits, credit budgets).
8. Unit tests for every new module. No secrets in code (`GEOAPIFY_API_KEY` via env). Use the existing logger.
9. **Verify Geoapify's current API docs before coding against them** (parameter names, limits, response shapes, pricing and credit costs, rate limits, storage/caching and attribution terms). Where this prompt names a parameter, treat it as a starting assumption to confirm, not gospel. Record findings in `docs/GEOAPIFY_NOTES.md`.

---

## 1. Background

The current system retrieves candidates, scores them with a simple weighted score, and sequences them with nearest-neighbour ordering. We are replacing the ranking and sequencing core with a design synthesised from research:

- **Scoring** = preference match + quality/popularity + time-of-day fit + social/pheromone signal − penalties (Rajaonarivo et al. weighted scoring; GETNext time-aware category patterns; Zhou et al. text-based interest matching).
- **Transitions** = factorised Markov transition model over POI features (category, neighbourhood, time slot) that works for never-visited POIs, updated from real trips via evaporating "pheromone" counts (Chen et al.; Rajaonarivo et al.).
- **Planning** = orienteering-style optimisation with optional stops, time windows, multiple days from a hotel base, and saturating dwell time (Yu et al. Optimal Tourist Problem; Chen et al. sub-tour elimination).
- **Learning loop** = log user edits and finished trips as implicit feedback so weights can later be learned and a neural model can replace hand-set parts once there is enough data.

We do NOT implement: Crow Search hybrids, DeepWalk/GCN/transformer/LSTM models (future work), commercial solvers (no Gurobi), or any Google Maps service.

---

## 2. The new dataset (important)

We are moving from the old curated `master_pois.csv` to an Overture-Maps-derived POI table (~65,000 rows). Sample rows:

```
poi_id,name,city,state,zone,latitude,longitude,category,poi_type,entry_fee_inr,visit_duration_hrs,google_rating,review_count_lakhs,weekly_off,has_airport_nearby,dslr_allowed,best_time_to_visit,significance,establishment_year,characteristics,description,opening_time,closing_time,indoor_outdoor,address,country,tags,source_id,last_updated
OV-1001,Versova Beach,Mumbai,MH,,19.12596865,72.81615017,Natural Landscapes & Wildlife,,,,,,,,,,,,,,,,,"Mumbai, MH",India,overture_maps|beach,e561e73f-...,2026-09-19
OV-1002,Versova Beach,Mumbai,MH,,19.12,72.82,Natural Landscapes & Wildlife,,,,,,,,,,,,,,,,,"Mumbai, MH",India,overture_maps|beach,ba6dba20-...,2026-09-19
OV-1004,Silver Beach Entry,Mumbai,MH,,19.11227798,72.822957,Natural Landscapes & Wildlife,,,,,,,,,,,,,,,,,"7C, Gandhigram Rd, Mumbai, MH",India,overture_maps|beach,e4f75efb-...,2026-09-19
OV-1005,Shiv Mandir,Mumbai,MH,,19.11261,72.82456,Religious & Spiritual Pilgrimages,,,,,,,,,,,,,,,,,"Gandhigram Road, Mumbai, MH",India,overture_maps|hindu_temple,dac09d80-...,2026-09-19
```

Observations that drive the design:

- Almost every enrichment column is empty: fee, duration, rating, hours, weekly off, year, description, significance, zone.
- The coarse `category` column exists, and the fine-grained Overture subcategory sits in the pipe-separated `tags` column (e.g. `beach`, `hindu_temple`). Map from the fine-grained tag to our ~15 travel categories; keep the coarse `category` as-is.
- **Duplicates** (OV-1001 / OV-1002 are the same beach), **sub-features** ("Silver Beach Entry" is an entrance, not an attraction), and **local noise** (neighbourhood temples that would compete with real landmarks) are all present.
- The CSV appears to have dropped useful Overture fields (`confidence`, `websites`, `socials`, `phones`, `brand`, source list, category hierarchy). **If the Overture Parquet files are available, re-extract them and add those as raw fields** (`overtureConfidence`, `overtureSources[]`, `websites[]`, `socials[]`, `phones[]`, `brand`, `categoryPrimary`, `categoryAlternates[]`). If not, note it in the audit and continue without them.
- `google_rating` and `review_count_lakhs` columns are legacy and stay `null`. Do not populate them from any Google source. Rename usage in code to a source-neutral `rating`/`reviewCount` (nullable), and never make the engine depend on them.
- `dslr_allowed` is rarely obtainable; keep the column but treat as optional and never used by scoring.

---

## 3. Architecture

```
Node API (existing)                         Planner service (new, Python)
─────────────────────                       ─────────────────────────────
geocode (Geoapify) → weather (Open-Meteo)   POST /plan
   │                                           - receives scored candidates,
   ▼                                             transition costs, constraints
Layer A: candidate retrieval (H3+2dsphere)      - OR-Tools routing model
Layer B: on-demand enrichment (Geoapify Place Details) + POI scoring
Layer C: transition model                       - time-limited, returns best so far
   │
   ├── call planner service ──────────────►
   │◄─────────────── plan ────────────────
   ▼
Layer E: dwell allocation, meal insertion, exact route legs (Geoapify Routing, cached),
         hotel anchoring, budget summary, Gemini narration (existing) → persist
Fallback: planner fails/times out/infeasible → existing deterministic itinerary
```

**Decision (default; change only if the repo makes it unreasonable):** planner = **Python FastAPI service using Google OR-Tools** (`pywrapcp`), because OR-Tools has no first-class Node bindings (OR-Tools is an open-source library, unrelated to Google Maps). Node remains orchestrator. Provide a `Dockerfile`, a `docker-compose` entry, `/health`, request/response JSON schemas (`planner/schemas.py`), and a Node client with a timeout (default 12 s) and no retries before fallback.

Suggested layout (adapt to repo conventions):

```
backend/src/
  services/geoapify/          # client.js geocode.js places.js placeDetails.js routing.js matrix.js
                              # rateLimiter.js cache.js creditBudget.js
  engine/
    index.js                  # orchestrates v2; feature-flag switch
    dataPrep/                 # dedupe, tiering, enrichment scripts
    scoring/                  # scorePoi.js, preferenceEmbedding.js, timeFit.js, popularity.js
    transitions/              # transitionModel.js, pheromone.js
    planner/client.js         # HTTP client to planner service
    postprocess/              # dwellAllocation.js, mealInsertion.js
    eval/                     # metrics.js (pairsF1 etc.), harness.js, scenarios/
planner/                      # Python service
  app.py  schemas.py  model.py  travel.py  tests/
config/                       # json config files listed in rule 7
docs/                         # CURRENT_STATE.md, DATA_AUDIT.md, GEOAPIFY_NOTES.md,
                              # ENGINE_DESIGN.md, EVAL_REPORT.md
```

---

## 4. Phases

### Phase 0: Remove Google Maps, build the Geoapify service layer

1. **Audit** the repo for every Google Maps dependency (`googleapis`, `@googlemaps/*`, `maps.googleapis.com`, `GOOGLE_MAPS_API_KEY`, Places/Directions/Geocoding/Distance Matrix calls). List them in `docs/CURRENT_STATE.md`.
2. **Replace each use:**
   - Geocoding chain becomes `LocationIQ → Geoapify Geocoding → static city fallback` (keep the 60+ city fallback and the geocoding cache).
   - Road distance and duration for car/bike intercity transport, and all intracity route legs → **Geoapify Routing API**.
   - Any Google Places usage → **Geoapify Places API / Place Details API**.
   - Remove the Google dependency, env vars and docs. Add a CI check (a simple grep test) that fails if any Google Maps domain or package reappears.
3. **Build `services/geoapify/`** with one shared HTTP client offering:
   - `geocode(text)`, `reverseGeocode(lat, lon)`
   - `searchPlaces({categories, filter, bias, name?, limit})` (Places API)
   - `getPlaceDetails({placeId | lat,lon, features})` (Place Details API)
   - `route({waypoints, mode})` (Routing API) and `routeMatrix({sources, targets, mode})` (Route Matrix API), respecting documented element limits by chunking
   - **Rate limiter** honouring the documented per-second limit, **retry with exponential backoff** on 429/5xx, **timeouts**, and a **credit budget counter** (`creditBudget.js`) with per-request and per-day ceilings from `config/geoapify.json`. When a ceiling is hit, calls return a typed `BudgetExceeded` error and callers degrade gracefully.
   - **Response cache** in Mongo (`ApiCache {key, value, expiresAt}`, TTL index). Route legs keyed by rounded from/to + mode; place details keyed by place id or rounded coordinates; TTLs from config. **Check Geoapify's terms on storing and caching results and write the conclusion in `docs/GEOAPIFY_NOTES.md`.** Add the required attribution to the frontend where Geoapify or OSM-derived data is shown.
   - Full mock/stub mode for tests and the eval harness (no live calls).

**Acceptance:** zero Google Maps references remain; legacy itinerary generation still works end-to-end using Geoapify only; client unit tests cover rate limiting, backoff, budget exhaustion and cache hits; `GEOAPIFY_NOTES.md` exists.

### Phase 1: Audit, cleaning, tiering and enrichment of the Overture dataset

**1a. Audit.** Produce `docs/DATA_AUDIT.md`: field coverage and null rates, category and tag distributions per city, duplicate clusters, missing coordinates, name quality, and which Overture raw fields are available.

**1b. Category mapping.** Map fine-grained tags to ~15 travel categories (`heritage`, `temple_religious`, `museum`, `nature_viewpoint`, `park`, `beach`, `market_shopping`, `entertainment`, `adventure`, `cafe`, `restaurant`, `nightlife`, `wellness`, `transport_hub`, `other`) in `config/categories.json`. Set `isTouristCandidate=false` for irrelevant categories (ATMs, offices, clinics, etc.) without deleting the raw records.

**1c. Dedupe and merge.**
- Merge same-normalised-name POIs within ~300 m (~1.5 km for beaches, parks, lakes, ghats).
- Fold sub-features (names containing entry, entrance, gate, parking, counter, point) into their parent when a parent exists within ~500 m; otherwise keep but mark `isSubFeature=true` and exclude from the candidate pool.
- Keep the richest record, retain `mergedSourceIds[]`.

**1d. Tiering** (`tier: "A"|"B"|"C"`). Compute a tier score from verifiable signals only:
- Wikidata or Wikipedia link (strong), OSM `tourism`/`heritage`/`historic` tags (strong), multiple Overture sources, has website, high Overture confidence, name is not a generic pattern (e.g. bare "Shiv Mandir").
- **Tier A** landmarks, **Tier B** notable, **Tier C** local. Tier C stays in the database but is excluded from the default candidate pool (usable as optional on-the-way filler or a "local spots" mode).
- Publish tier counts per city in the audit.

**1e. Enrichment, in this order, Tier A and B only (Tier C gets category priors only):**

1. **Geoapify Places + Place Details.** For each Tier A/B POI: find the matching Geoapify place near the coordinates (Places API with a small circle filter, and a name filter if supported), accept only if name similarity and distance pass thresholds, then call **Place Details** to obtain whatever is available: opening hours, contact/website, wiki references (Wikidata/Wikipedia ids), building/details, and the underlying OSM tags. Store `geoapifyPlaceId`. Treat OSM tags as the source of truth for `opening_hours`, `fee`, `start_date`, `wheelchair`, `website`.
2. **Opening-hours parsing.** Parse OSM-format `opening_hours` with a proper parser library into per-weekday windows and derive `weekly_off`, `opening_time`, `closing_time`. Unparseable strings are stored raw and treated as unknown.
3. **Wikidata and Wikipedia APIs** (free, structured), using ids found in step 1: inception year, heritage designation, description text, **sitelink count** and **pageviews** (popularity proxy).
4. **Deterministic fields:** `zone` from the nearest OSM suburb or locality (or an H3 cluster name), `has_airport_nearby` from a static airport list, `indoor_outdoor` from category.
5. **Category priors** for anything still missing: `visit_duration_hrs`, `best_time_to_visit`, default opening window, free-entry defaults for beaches, parks and temples. Mark all as `category_prior` with low confidence. Leave `entry_fee_inr` null for museums, forts and similar rather than guessing.
6. **Grounded Gemini pass** for `description`, `significance`, `characteristics`, `tags` on Tier A/B only. Input must be the fetched Wikipedia/OSM text; output must be strict JSON; fields not supported by the input stay null. Never allow it to produce ratings, fees, hours or years unless present in the input.

**1f. Provenance.** Every enriched field is stored with `{value, source, confidence, fetchedAt}` in an `enrichment` object. Sources: `osm_via_geoapify`, `wikidata`, `wikipedia`, `category_prior`, `computed`, `llm_grounded`. The scoring and planner treat unknown or low-confidence hours as neutral and never present guesses to the user as facts.

**1g. On-demand enrichment at trip time.** Batch enrichment covers Tier A/B ahead of time. In addition, before scoring the top candidates for a trip, `ensureEnriched()` fetches Place Details for any Tier A/B candidate not enriched or stale (TTL from config), within the credit budget. If the budget is exhausted, continue with priors.

**1h. Popularity proxy** (no ratings exist): blend, per city, normalised to 0–1: Wikipedia pageviews or sitelink count, Wikidata presence, Overture confidence, number of Overture sources, website/social presence, and Geoapify details richness. Document the formula and weights in `config/engine.weights.json`.

**1i. Other tasks.** `dwell_priors.json` (min/typical/max minutes per category), `category_time_profiles.json` (48 half-hour slots per category; temples morning-heavy, nightlife after 20:00, cafes mid-morning/afternoon, viewpoints and beaches sunrise/sunset, outdoor midday-heat penalty). H3 indexes at resolutions 8 and 9. Indexes: 2dsphere, `{city, isTouristCandidate, tier, travelCategory}`, `h3`.

**Acceptance:** audit docs exist; `npm run data:enrich -- --city "<name>" [--tier A,B]` is idempotent, resumable, budget-aware and logs per-field fill rates before and after; ≥95% of tourist-candidate POIs have `travelCategory`, coordinates, `h3`, `dwellMinutes`; duplicates in the sample (e.g. Versova Beach) are merged and "Silver Beach Entry" is folded into Silver Beach; retrieval for a test city is bounded and never loads whole collections.

### Phase 2: POI scoring

Implement `scorePoi(poi, userProfile, tripContext, slotTime, lastPoi?)` returning a 0–1 score plus a **breakdown object** (for explanations and future learning):

```
S = w1·Pref + w2·Quality + w3·TimeFit + w4·Social − w5·Penalty     (weights in engine.weights.json)
```

- **Pref**: cosine similarity between a POI text embedding (name + category + tags + description if enriched) and a user-preference embedding from form fields plus optional free text. Use an embedding approach already available in the repo's environment; cache POI embeddings; fall back to category-overlap if unavailable. Hard filters for explicit dislikes, dietary and accessibility constraints.
- **Quality**: `popularityProxy` blended with `dataQuality` (completeness of enrichment).
- **TimeFit**: `category_time_profiles[travelCategory][slot]` × opening-hours check (hard 0 if closed at that time or on its weekly off; unknown hours = neutral 0.6).
- **Social**: `δ·popularity + φ·pheromone(lastPoi → poi)`; pheromone term is 0 with no data.
- **Penalty**: budget, pace, accessibility/children mismatch, distance from hotel beyond the user's daily tolerance, category over-repetition, weather (rain, UV, heat for outdoor categories).

**Acceptance:** unit tests prove each component moves the score in the expected direction; deterministic; breakdown returned; 500 candidates score in < 300 ms excluding embedding calls.

### Phase 3: Transition model and pheromone

1. **Prior** `config/category_transition_prior.json`: category → category matrix (hand-authored; museum→cafe high, temple→temple moderate, restaurant→restaurant very low, nightlife→ late-only).
2. **Factorised model** (Chen et al.): `P(pj|pi) ∝ P_cat · P_nbhd · P_slot`, computed on demand for candidate pairs, never a 65k×65k matrix. No self-loops, add-ε smoothing (ε=1), uniform split among POIs with identical feature signatures.
3. **Pheromone graph**: `PoiEdge {fromId, toId, tau, updatedAt}`. On trip save/complete, add `Q` per consecutive pair. Evaporation is applied **lazily on read**: `tau_eff = tau·(1−ρ)^(Δperiods)`, ρ=0.1 per period (default 7 days). Track per-city `tauMax`.
4. **Blend**: `P = (1−μ)·P_factorised + μ·P_pheromone`, μ grows with real data volume (0 at cold start).
5. Expose `−log(P)` (floored) for the planner.

**Acceptance:** tests for smoothing, no self-loops, uniform splitting, lazy evaporation, pheromone update on trip save; cold-start city works with μ=0.

### Phase 4: Planner service (core)

Python service. Input: candidates (id, lat, lon, score, dwell min/typical/max, opening windows, closed days, category, isMeal), hotel base(s), number of days, per-day start/end, pace, travel mode, and transition costs for the top-N candidates (N ≤ 120).

**Model (OR-Tools routing):**
- One **vehicle per day**, all starting and ending at the hotel (multiple hotel bases optional).
- Every candidate is an **optional node** (disjunction with drop penalty = `K_DROP · score`).
- **Time dimension** (time-of-day minutes): transit = travel minutes + typical dwell at the from-node. Opening windows per node; days on which a POI is closed are handled by excluding that vehicle for the node.
- **Arc cost** = `W_TIME·travelMinutes + λ·(−log P(j|i))`.
- **Travel-time estimate inside the solver: no API calls.** Use Haversine × a per-city, per-mode **circuity factor and speed**, plus a fixed per-leg overhead. Factors are **calibrated per city** by `npm run travel:calibrate -- --city X`, which samples ~50 POI pairs, fetches real durations from **Geoapify Routing/Route Matrix**, and writes fitted values to `config/geoapify.json` (or a `TravelCalibration` collection). Use defaults until calibrated.
- Enforce: no repeated POI; max stops per day from pace; daily travel cap; meals per Phase 5.
- Solver: `PATH_CHEAPEST_ARC` + `GUIDED_LOCAL_SEARCH`, hard time limit (default 8 s), return best-so-far (anytime). Return status, objective and dropped list.

**Dwell allocation (post-solve):** solve at typical dwell, then distribute leftover slack by water-filling on the saturating reward `f(t)=1−exp(−λt)` (see pseudocode), respecting min/max dwell and opening windows.

**Validation and fallback:** validate the plan (no overlaps, windows respected, IDs exist, day length within limit). If the planner is down, times out without a solution, or validation fails → legacy itinerary, log `engine_fallback` with the reason.

**Acceptance:** fixtures (20, 60, 100 candidates; 1, 3, 5 days) return feasible plans within the time limit; a POI closed on a day is never scheduled that day; v2 beats legacy nearest-neighbour on Phase 6 metrics in ≥70% of fixture scenarios (report the true number; do not tune tests to pass).

### Phase 5: Integration

1. Wire `engine/index.js` into the trip-generation controller behind `ITINERARY_ENGINE`.
2. After planning: meal insertion; prepend origin→destination Day 1 leg (intercity via **Geoapify Routing** for car/bike; flight/train/bus stay estimated and clearly non-live, as today); hotel-anchoring legs; **exact leg geometry and duration for the chosen stops via Geoapify Routing** (cached; if it fails or the budget is exhausted, keep the estimate and flag `estimated:true`); budget summary; pre-trip section; Gemini narration.
3. Add an explanation string per activity from the score breakdown as a new optional field.
4. **Chat remove/replace:** re-run only the affected day through the planner with the removed POI banned and other stops pinned. Keep the confirmation step.
5. **Feedback logging:** collection `EngineEvent {tripId, userId, type, poiId, dayIndex, payload, createdAt}` for `removed`, `replaced_with`, `kept_at_trip_completion`, `trip_saved`, `trip_made_public`. On save/completion, update the pheromone graph.
6. Leaflet + OpenStreetMap map stays as is. Ensure the required Geoapify and OSM attributions appear.

**Acceptance:** with `ITINERARY_ENGINE=v2`, end-to-end trip creation for two cities returns a valid trip identical in shape to legacy; `shadow` mode logs comparison without affecting the response; chat remove/replace re-plans one day; no Google calls anywhere.

### Phase 6: Evaluation harness

`engine/eval/metrics.js` and CLI `npm run eval -- --engine legacy|v2 --scenarios eval/scenarios`.

Scenarios: ≥30 synthetic queries across ≥3 cities (varying days, budget, interests, pace, travellers, with/without children). Offline: stub Geoapify and Gemini.

Metrics: `constraintViolations` (must be 0 for v2), `travelShare`, `interestCoverage`, `categoryDiversity`, `meanScore`, `droppedHighScoreCount`, `routeCompactness`, `plannerLatencyMs`, `fallbackRate`, `enrichmentCoverage` (share of scheduled stops with known opening hours), `geoapifyCreditsPerTrip`, and **pairs-F1** (Chen et al.) plus point F1 for when ground-truth tours exist (definition in the pseudocode; include tests).

Output `docs/EVAL_REPORT.md` comparing legacy vs v2. Report failures as plainly as successes.

### Phase 7: Weight-learning scaffold only

No neural training. Provide: an export of `EngineEvent` + score breakdowns to a training table; a pairwise-ranking learner (logistic regression or linear rankSVM) that writes `engine.weights.candidate.json` and never overwrites live weights; and a documented future path to a GETNext-style trajectory-flow model once there are several thousand real trips. Mark it as future work in `docs/ENGINE_DESIGN.md`.

---

## 5. Non-functional requirements

- Latency target for v2 generation (excluding Gemini): < 15 s p95 for a 5-day trip.
- **Geoapify credit control:** per-trip credit budget and daily ceiling; log credits per request and per trip; all bulk jobs are resumable and rate-limited.
- Memory: never load full POI collections; retrieval bounded (H3/radius + tier + category + limit, then top-N by pre-score).
- Determinism: same input + same config → same plan (seed the solver and any randomness).
- Observability: log engine version, candidate count, solver status, objective, dropped count, fallback reason, per-stage timings, Geoapify calls and cache hit rate.
- Robustness: validate planner responses, cap payload sizes, keep existing auth and rate limiting.
- Every new config value has a documented default and range.

## 6. Deliverables checklist

- [ ] Google Maps fully removed; grep-based CI guard
- [ ] `services/geoapify/` client with rate limiting, cache, budget, mocks
- [ ] `docs/CURRENT_STATE.md`, `DATA_AUDIT.md`, `GEOAPIFY_NOTES.md`, `ENGINE_DESIGN.md`, `EVAL_REPORT.md`
- [ ] Dedupe, tiering, enrichment pipeline with provenance, plus on-demand enrichment
- [ ] Scoring, transition and pheromone modules with tests
- [ ] Python planner service with Dockerfile, schemas, tests, per-city travel calibration
- [ ] Integration behind feature flag with shadow mode and fallback
- [ ] Chat single-day re-plan
- [ ] Event logging and pheromone updates
- [ ] Evaluation harness with pairs-F1
- [ ] Weight-learning export scaffold

## 7. When to stop and ask me

Ask only if: the repo structure makes the Python service impossible to deploy; Geoapify's terms or limits make a required feature impossible; the Overture Parquet fields you need are missing and no substitute exists; or a change would break the frontend API contract. Otherwise make a reasonable decision, record it in `docs/ENGINE_DESIGN.md` under "Decisions", and continue.
