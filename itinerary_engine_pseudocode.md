# Itinerary Engine v2: Algorithmic Pseudocode (Geoapify-only)

Companion to `itinerary_engine_agent_prompt.md`. This is a specification of logic, not final code. Constants in `UPPER_CASE` come from config files. Times are minutes since midnight unless stated. Geoapify parameter names are assumptions to verify against current docs.

---

## 0. Top-level pipeline

```
function generateTripV2(request):
    ctx      = buildContext(request)              # dates, days, budget, pace, mode, travellers, prefs
    geo      = geocode(request.destination)       # LocationIQ -> Geoapify Geocoding -> static fallback
    weather  = fetchWeatherPerDay(geo, ctx.dates) # Open-Meteo
    hotels   = pickHotelBases(geo, ctx)
    prefVec  = buildPreferenceEmbedding(ctx.prefs, ctx.freeText)

    pool     = retrieveCandidates(geo, ctx, radiusKm)             # section 1
    pre      = [ (p, scorePoi(p, prefVec, ctx, weather, null)) for p in pool ]
    top      = selectTopN(pre, N = 100, diversityCap = true)      # section 3.6

    top      = ensureEnriched(top, budget = TRIP_ENRICH_BUDGET)   # section 2 (Geoapify Place Details)
    scored   = [ (p, scorePoi(p, prefVec, ctx, weather, null)) for p in top ]   # rescore with real hours

    trans    = buildTransitionProvider(scored)                    # section 4
    plan     = callPlanner(scored, hotels, ctx, trans)            # section 5

    if plan is null OR not validate(plan, ctx):
        log("engine_fallback", reason)
        return legacyItinerary(request)

    plan     = allocateDwell(plan)                                # section 6
    plan     = insertMeals(plan, pool, prefVec, ctx)              # section 7
    if not validate(plan, ctx): return legacyItinerary(request)

    plan     = attachExactRoutes(plan)                            # section 9 (Geoapify Routing, cached)
    plan     = addOriginLegDay1(plan, request)                    # Geoapify Routing for car/bike
    plan     = attachExplanations(plan)
    trip     = assembleTrip(plan, weather, budgetSummary, preTrip, transport, narration)
    persist(trip)
    return trip
```

---

## 1. Candidate retrieval

```
function retrieveCandidates(geo, ctx, radiusKm):
    cells = h3.coverage(geo.center, radiusKm)
    query = {
        isTouristCandidate: true,
        isSubFeature: false,
        tier: { $in: ctx.allowLocalSpots ? ["A","B","C"] : ["A","B"] },
        h3_8: { $in: cells },
        travelCategory: { $nin: ctx.excludedCategories }
    }
    pool = POI.find(query).limit(MAX_POOL)            # never load full collection
    if len(pool) < MIN_POOL:
        pool += backfillGeoapifyPlaces(geo)           # Geoapify Places API; persist as source="geoapify"
        radiusKm = min(radiusKm * 1.5, MAX_RADIUS); retry once
    return pool
```

---

## 2. Data preparation and enrichment (offline job + on demand)

### 2.1 Dedupe and merge

```
function dedupeCity(pois):
    groups = clusterBy(pois, key = normalisedName(p.name),
                       maxDistM = (p.travelCategory in AREA_CATS ? 1500 : 300))
    for g in groups:
        keep = argmax(g, richness)                     # most fields filled, highest overture confidence
        keep.mergedSourceIds = ids(g) - keep.id
        delete others (or mark merged=true)

    for p in pois:
        if matches(p.name, /\b(entry|entrance|gate|parking|counter|point)\b/i):
            parent = nearestSameFamily(p, pois, maxDistM = 500)
            if parent: mergeInto(parent, p)
            else:      p.isSubFeature = true
```

### 2.2 Tiering

```
function tierOf(p):
    s = 0
    if p.hasWikidata or p.hasWikipedia:            s += 3
    if p.osmTags has tourism|heritage|historic:    s += 2
    if len(p.overtureSources) >= 2:                s += 1
    if p.websites not empty:                       s += 1
    if p.overtureConfidence >= 0.85:               s += 1
    if isGenericName(p.name):                      s -= 2      # e.g. bare "Shiv Mandir", "Ram Mandir"
    return "A" if s >= 4 else "B" if s >= 2 else "C"
```

Tiering runs before Geoapify enrichment using Overture-side signals, and again after enrichment once Wikidata and OSM tags are known.

### 2.3 Enrichment of one POI

```
function enrichPoi(p, budget):
    if p.tier == "C":
        return applyCategoryPriors(p)

    # -- step 1: Geoapify Places -> Place Details --------------------------------
    if p.geoapifyPlaceId is null:
        if not budget.allow("places"): return applyCategoryPriors(p)
        hits = geoapify.searchPlaces(
                   categories = GEOAPIFY_CATS[p.travelCategory],
                   filter     = circle(p.lon, p.lat, 150),
                   name       = p.name,                      # verify parameter in docs
                   limit      = 5)
        best = argmax(hits, nameSimilarity(p.name, h.name) - 0.002 * distM(p, h))
        if best and nameSimilarity >= 0.8:  p.geoapifyPlaceId = best.place_id

    if p.geoapifyPlaceId and budget.allow("details"):
        d   = geoapify.getPlaceDetails(placeId = p.geoapifyPlaceId, features = "details")
        raw = d.properties.datasource.raw or {}              # underlying OSM tags
        record(p, "opening_hours_raw", raw.opening_hours, "osm_via_geoapify", 0.8)
        record(p, "entry_fee_raw",     raw.fee or raw.charge, "osm_via_geoapify", 0.7)
        record(p, "website",           d.properties.website or raw.website, "osm_via_geoapify", 0.8)
        record(p, "wikidata_id",       raw.wikidata, "osm_via_geoapify", 0.9)
        record(p, "wikipedia_title",   raw.wikipedia, "osm_via_geoapify", 0.9)
        record(p, "establishment_year", year(raw.start_date), "osm_via_geoapify", 0.7)
        record(p, "wheelchair",        raw.wheelchair, "osm_via_geoapify", 0.7)

    # -- step 2: parse opening hours ----------------------------------------------
    if p.opening_hours_raw:
        parsed = parseOsmOpeningHours(p.opening_hours_raw)   # use a proper parser library
        if parsed.ok:
            p.hoursByWeekday  = parsed.windows               # list of [open, close] per weekday
            p.weekly_off      = [d for d in 0..6 if parsed.windows[d] is empty]
            p.opening_time    = earliestOpen(parsed); p.closing_time = latestClose(parsed)
            markSource(p, "hours", "osm_via_geoapify", 0.8)

    # -- step 3: Wikidata / Wikipedia (free structured APIs) -----------------------
    if p.wikidata_id:
        wd = wikidata.entity(p.wikidata_id)
        record(p, "establishment_year", wd.inception,          "wikidata", 0.9)
        record(p, "significance",       wd.heritageDesignation, "wikidata", 0.9)
        record(p, "sitelinks",          wd.sitelinkCount,       "wikidata", 0.9)
    if p.wikipedia_title:
        wp = wikipedia.summary(p.wikipedia_title)
        record(p, "wiki_extract", wp.extract, "wikipedia", 0.9)
        record(p, "pageviews",    wikipedia.pageviews(p.wikipedia_title, last12m), "wikipedia", 0.9)

    # -- step 4: deterministic fields ------------------------------------------------
    p.zone               = nearestLocalityName(p) or h3ClusterName(p)
    p.has_airport_nearby = minDistanceKm(p, AIRPORTS) <= AIRPORT_NEAR_KM
    p.indoor_outdoor     = INDOOR_OUTDOOR[p.travelCategory]

    # -- step 5: category priors for whatever is still missing -----------------------
    p = applyCategoryPriors(p)

    # -- step 6: grounded LLM pass (Tier A/B only) -----------------------------------
    if p.wiki_extract or p.osm_description:
        out = gemini.json(prompt = GROUNDED_PROMPT, source_text = p.wiki_extract + p.osm_description)
        # schema: {description, significance, characteristics[], tags[]}, null when unsupported
        for field in out: record(p, field, out[field], "llm_grounded", 0.6) if out[field] is not null

    p.popularityProxy = popularityProxy(p)
    p.dataQuality     = completeness(p)
    p.enrichedAt      = now
    save(p)
```

```
function applyCategoryPriors(p):
    fillIfMissing(p, "visit_duration_hrs", DWELL_PRIORS[p.travelCategory].typical / 60, "category_prior", 0.4)
    fillIfMissing(p, "best_time_to_visit", BEST_TIME[p.travelCategory],                 "category_prior", 0.4)
    fillIfMissing(p, "opening window",     DEFAULT_WINDOW[p.travelCategory],            "category_prior", 0.3)
    if p.travelCategory in FREE_ENTRY_CATS:  fillIfMissing(p, "entry_fee_inr", 0, "category_prior", 0.5)
    # museums, forts etc: leave fee null
    return p
```

### 2.4 Popularity proxy (no ratings exist)

```
function popularityProxy(p):
    parts = []
    if p.pageviews is not null:            parts.append( (0.35, pctRank(p.pageviews, city)) )
    if p.sitelinks is not null:            parts.append( (0.20, pctRank(p.sitelinks, city)) )
    parts.append( (0.15, p.overtureConfidence or 0.5) )
    parts.append( (0.10, min(len(p.overtureSources) / 3, 1)) )
    parts.append( (0.10, 1 if p.websites or p.socials else 0) )
    parts.append( (0.10, p.dataQuality) )
    renormalise weights over the parts that exist, return weighted sum in 0..1
```

### 2.5 Lazy enrichment for a trip

```
function ensureEnriched(top, budget):
    for (p, s) in top ordered by s desc:
        if p.tier in ["A","B"] and (p.enrichedAt is null or now - p.enrichedAt > ENRICH_TTL):
            if not budget.allow("details"): break
            enrichPoi(p, budget)
    return top
```

---

## 3. POI scoring

### 3.1 Combined score

```
function scorePoi(p, prefVec, ctx, weather, lastPoi, slotTime = null):
    pref    = preferenceMatch(p, prefVec, ctx)
    quality = 0.7 * p.popularityProxy + 0.3 * p.dataQuality
    tfit    = timeFit(p, slotTime, ctx)
    social  = socialScore(p, lastPoi, ctx.city)
    pen     = penalty(p, ctx, weather)

    S = W_PREF*pref + W_QUAL*quality + W_TIME*tfit + W_SOC*social - W_PEN*pen
    return { score: clamp(S, 0, 1), breakdown: {pref, quality, tfit, social, pen} }
```

### 3.2 Preference match

```
function preferenceMatch(p, prefVec, ctx):
    if violatesHardConstraint(p, ctx): return 0        # dislikes, diet, accessibility
    if p.nameEmbedding and prefVec:
        return (cosine(p.nameEmbedding, prefVec) + 1) / 2
    return categoryOverlap(p.travelCategory, ctx.preferredCategories)
```

### 3.3 Time fit

```
function timeFit(p, t, ctx):
    if t is null:
        return max over slots s in openSlots(p, ctx.dates) of profile(p.travelCategory, s)
    if hoursKnown(p) and not isOpen(p, t): return 0
    base = profile(p.travelCategory, slotOf(t))
    if not hoursKnown(p): base *= 0.6 + 0.4 * confidenceOfPriorWindow(p)   # neutral, mild discount
    return base
```

Weather penalty (used inside `penalty`):

```
function weatherPenalty(p, dayWeather):
    if not p.isOutdoor: return 0
    pen  = 0.5 * dayWeather.rainProb
    pen += 0.3 * clamp((dayWeather.uvIndex - 7) / 4, 0, 1)
    pen += 0.2 * clamp((dayWeather.tempC - 36) / 8, 0, 1)
    return min(pen, 1)
```

### 3.4 Social score (pheromone)

```
function socialScore(p, lastPoi, city):
    if lastPoi is null or tauMax(city) == 0: return p.popularityProxy
    tau = pheromoneEff(lastPoi.id, p.id)
    return DELTA * p.popularityProxy + PHI * (tau / tauMax(city))      # DELTA + PHI = 1
```

### 3.5 Penalty

```
function penalty(p, ctx, weather):
    pen  = budgetMismatch(p.entry_fee_inr, ctx.budgetPerDay)        # unknown fee => 0
    pen += paceMismatch(p.dwellMinutes, ctx.pace)
    pen += kidsAccessibilityMismatch(p, ctx)
    pen += clamp((dist(p, hotel) - ctx.dailyTolerance) / ctx.dailyTolerance, 0, 1)
    pen += weatherPenalty(p, weather)
    return clamp(pen / K_PEN_NORM, 0, 1)
```

### 3.6 Top-N with diversity cap

```
function selectTopN(scored, N, diversityCap):
    sort scored by score desc; picked = []; catCount = {}
    for (p, s) in scored:
        if diversityCap and catCount[p.travelCategory] >= MAX_PER_CATEGORY(N): continue
        picked.append((p, s)); catCount[p.travelCategory] += 1
        if len(picked) == N: break
    if len(picked) < N: fill remaining ignoring the cap
    return picked
```

---

## 4. Transition model

### 4.1 Factorised probability (cold-start safe)

```
function pFactorised(pi, pj, slot):
    if pi.id == pj.id: return 0
    a = catTransition(pi.travelCategory, pj.travelCategory)        # prior JSON, eps-smoothed
    b = nbhdTransition(pi.zone, pj.zone)                           # or distance decay if unknown
    c = slotBias(pj.travelCategory, slot)
    return (a * b * c) / groupSize(pj.featureSignature)
```

```
function rowNormalised(i, candidates, slot):
    raws = [ pFactorised(i, j, slot) for j in candidates ]
    Z = sum(raws)
    return [ r / Z for r in raws ] if Z > 0 else uniform(len(candidates))
```

### 4.2 Blend with pheromone

```
function pTransition(i, j, slot, candidates):
    pf = rowNormalised(i, candidates, slot)[j]
    mu = MU_MAX * (1 - exp(-edgeCountCity / MU_SCALE))
    if mu == 0: return pf
    tauRow = [ pheromoneEff(i, k) + EPS for k in candidates ]
    pp = (pheromoneEff(i, j) + EPS) / sum(tauRow)
    return (1 - mu) * pf + mu * pp
```

### 4.3 Pheromone update with lazy evaporation

```
function pheromoneEff(i, j):
    e = PoiEdge.get(i, j)
    if e is null: return 0
    periods = (now - e.updatedAt) / PERIOD_DAYS
    return e.tau * (1 - RHO) ** periods              # RHO = 0.1

function onTripSaved(trip):
    for day in trip.days:
        for k in 0 .. len(day.stops) - 2:
            i, j = day.stops[k].poiId, day.stops[k+1].poiId
            e = PoiEdge.get(i, j) or new PoiEdge(i, j, tau = 0)
            e.tau = pheromoneEff(i, j) + Q            # decay first, then reinforce
            e.updatedAt = now; save(e)
    updateTauMax(city)
```

### 4.4 Solver cost

```
function arcTransitionCost(i, j, slot):
    return -log(max(pTransition(i, j, slot, candidates), P_FLOOR))
```

---

## 5. Planner (Python service, OR-Tools)

### 5.1 Travel time inside the solver: no API calls

```
function travelMinutes(a, b, mode, city):
    cal = calibration[city][mode] or DEFAULT[mode]         # {circuity, speedKmh, overheadMin}
    d = haversineKm(a, b) * cal.circuity
    return round(d / cal.speedKmh * 60) + cal.overheadMin
```

### 5.2 Per-city calibration against Geoapify (offline job)

```
function calibrateCity(city, mode, samples = 50):
    pairs = randomPairs(touristPois(city), samples, distanceRangeKm = [0.5, 15])
    real  = geoapify.routeMatrix(sources = pairs.from, targets = pairs.to, mode = mode)   # chunk to element limits
    # fit: real_minutes ~ (haversine * circuity) / speed * 60 + overhead
    fit = leastSquares(features = [haversine * 60], target = real_minutes - 0)   # or 2-param fit
    save calibration[city][mode] = { circuity, speedKmh, overheadMin, rmse, fittedAt }
    if rmse > CAL_RMSE_WARN: log warning
```

### 5.3 Model construction

```
function buildAndSolve(req):
    nodes    = [DEPOT_per_hotel..., POI_1..POI_n]
    nDays    = req.numDays
    manager  = RoutingIndexManager(len(nodes), nDays, depots = [hotelIdx] * nDays)
    routing  = RoutingModel(manager)

    # ---- time dimension (time-of-day minutes) ----
    transit(i, j) = travelMinutes(i, j, req.mode, req.city) + dwellTypical(i)   # 0 for depots
    routing.AddDimension(transitCb, MAX_SLACK, 24*60, fixStartToZero = false, "Time")
    for d in days:
        Time.CumulVar(routing.Start(d)).SetRange(day[d].start, day[d].start)
        Time.CumulVar(routing.End(d)).SetRange(day[d].start, day[d].end)
        Time.SetSpanUpperBoundForVehicle(day[d].maxActiveMinutes, d)

    # ---- opening windows and closed days ----
    for each POI node k:
        w = largestOpenWindow(k)                          # unknown => [0, 1440]
        Time.CumulVar(k).SetRange(w.open, w.close - dwellTypical(k))
        for d where k is closed on date[d]:
            routing.SetAllowedVehiclesForIndex(allVehiclesExcept(d), k)

    # ---- optional visits ----
    for each POI node k:
        routing.AddDisjunction([k], round(K_DROP * score_k))

    # ---- stops cap by pace ----
    routing.AddDimension(unitCounter, 0, MAX_STOPS[pace], true, "Stops")

    # ---- arc cost ----
    cost(i, j) = round(100 * (W_TIME * travelMinutes(i, j, ...)
                              + LAMBDA * arcTransitionCost(i, j, slotOf(midTime))))
    routing.SetArcCostEvaluatorOfAllVehicles(costCb)

    params.first_solution_strategy    = PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = GUIDED_LOCAL_SEARCH
    params.time_limit                 = SOLVER_SECONDS
    solution = routing.SolveWithParameters(params)
    return extract(solution)
```

### 5.4 Extraction

```
function extract(solution):
    if solution is null: return { status: "NO_SOLUTION" }
    days = []
    for d in range(nDays):
        stops = []; idx = routing.Start(d)
        while not routing.IsEnd(idx):
            node = manager.IndexToNode(idx)
            if node is a POI:
                stops.append({ poiId, arrive: solution.Min(Time.CumulVar(idx)), dwell: dwellTypical(node) })
            idx = solution.Value(routing.NextVar(idx))
        days.append(stops)
    dropped = [ poi for poi in POIs if solution.Value(NextVar(poi)) == poi ]
    return { status: "OK", days, dropped, objective }
```

---

## 6. Dwell allocation (variable-dwell reward, Yu et al.)

Reward per stop is `r_i * (1 - exp(-lambda_i * t_i))`. Marginal reward `r_i * lambda_i * exp(-lambda_i * t_i)`. At the optimum all unclamped stops share the same marginal `nu`, so `t_i = clamp((1/lambda_i) * ln(r_i * lambda_i / nu), min_i, max_i)`.

```
function allocateDwell(plan):
    for day in plan.days:
        available = day.endTime - day.startTime - sum(travelMinutes(day))
        target    = min(available, sum(dwellMax))                # never exceed the day

        function totalAt(nu):
            return sum( clamp((1/lam_i) * ln(r_i * lam_i / nu), min_i, max_i) for i in day.stops )

        lo, hi = 1e-6, max_i(r_i * lam_i)
        repeat 40 times:                                         # totalAt is decreasing in nu
            nu = (lo + hi) / 2
            if totalAt(nu) > target: lo = nu else: hi = nu

        for stop in day.stops:
            stop.dwell = round5(clamp((1/lam) * ln(r * lam / nu), min, max))

        recomputeArrivalTimes(day)
        if anyWindowViolated(day):
            shrinkOffendingDwellsTowardMin(day); recomputeArrivalTimes(day)
        if day still over budget with all dwell at min:
            drop lowest-marginal-value stop; repeat
    return plan
```

`lam_i = categoryLambda(cat_i) * interestScale(pref_i)`, `r_i = score_i`.

---

## 7. Meal insertion

```
function insertMeals(plan, pool, prefVec, ctx):
    for day in plan.days:
        for meal in [LUNCH(720..900), DINNER(1140..1320)]:
            if dayAlreadyHasMealStop(day, meal): continue
            pos   = stopActiveAt(day, meal.target) or nearestStop(day, meal.target)
            cands = restaurantsNear(pos, MEAL_RADIUS_KM)          # dataset + Geoapify Places (catering.*) backfill
                    filtered by open at meal.target and food preferences
            best  = argmax over cands of
                       scorePoi(r, prefVec, ctx, weather, pos, meal.target).score
                       - W_DIST * travelMinutes(pos, r) / 30
            insertAfter(pos, best, dwell = 45..60)
            shiftLaterStopsBy(addedTime)
            if any later stop violates its window or the day end:
                drop lowest-scoring later stop; if still infeasible, undo insertion
    return plan
```

---

## 8. Validation

```
function validate(plan, ctx):
    seen = set()
    for day in plan.days:
        t = day.startTime
        for stop in day.stops:
            if stop.poiId in seen: return false
            seen.add(stop.poiId)
            if stop.arrive < t: return false
            if hoursKnown(stop.poi) and not isOpen(stop.poi, date(day), stop.arrive, stop.arrive + stop.dwell):
                return false
            t = stop.arrive + stop.dwell + travelMinutes(stop, next(stop))
        if t > day.endTime: return false
        if totalTravelMinutes(day) > ctx.dailyTravelCap: return false
    return all poiIds exist in database
```

---

## 9. Exact route legs (Geoapify Routing, cached)

```
function attachExactRoutes(plan):
    for day in plan.days:
        waypoints = [hotel] + day.stops + [hotel]
        for each consecutive pair (a, b):
            key = cacheKey(round(a, 4), round(b, 4), mode)
            leg = cache.get(key)
            if leg is null:
                if budget.allow("routing"):
                    leg = geoapify.route(waypoints = [a, b], mode = mode)
                    cache.set(key, leg, TTL_ROUTE)
                else:
                    leg = { distanceKm: estimate, minutes: travelMinutes(a, b, ...), estimated: true }
            attach leg (distance, duration, geometry) to the stop pair
        if realLegMinutes deviate from the plan by > TOLERANCE:
            recomputeArrivalTimes(day); if validate fails: shiftOrDropLastStop(day)
    return plan
```

Optional efficiency: one `routeMatrix` call for hotel → all chosen stops when the docs' element limits allow it.

---

## 10. Chat: single-day re-plan after remove or replace

```
function replanDay(trip, dayIndex, removedPoiId, mode):
    day    = trip.days[dayIndex]
    banned = trip.allPoiIds ∪ {removedPoiId}
    pinned = day.stops except removedPoiId

    if mode == "remove":          candidates = pinned + retrieveNearby(day, R, exclude = banned)
    if mode == "replace_nearby":  candidates = pinned + topScored(retrieveNear(removedPoi, R_SMALL), exclude = banned)
    if mode == "replace_far":     candidates = pinned + topScored(retrieveNear(dayCentroid, R_LARGE), exclude = banned)

    candidates = ensureEnriched(candidates, budget = SMALL_BUDGET)
    plan = callPlanner(candidates, hotel, oneDay(day), pinnedOrder = pinned.ids, solverSeconds = 3)
    if plan is null: plan = simpleInsertionRepair(day, removedPoiId)
    log EngineEvent("removed" | "replaced_with", removedPoiId, newPoiId)
    return updateTrip(trip, dayIndex, plan)
```

Pinned stops are mandatory (no disjunction) with precedence constraints preserving their relative order.

---

## 11. Evaluation metrics

```
function pairsF1(truth T, recommended R):
    inBoth = set(T) ∩ set(R)
    Nc = 0
    for each unordered pair (a, b) in inBoth, a != b:
        if (indexIn(T, a) < indexIn(T, b)) == (indexIn(R, a) < indexIn(R, b)): Nc += 1
    if Nc == 0: return 0
    P  = Nc / (len(R) * (len(R) - 1) / 2)
    Rc = Nc / (len(T) * (len(T) - 1) / 2)
    return 2 * P * Rc / (P + Rc)

function pointF1(T, R):
    inter = |set(T) ∩ set(R)|
    if inter == 0: return 0
    P = inter / |R|; Rc = inter / |T|
    return 2 * P * Rc / (P + Rc)

travelShare(plan)        = totalTravelMinutes / totalActiveMinutes
categoryDiversity(day)   = entropy(distribution of travelCategory)
interestCoverage(plan)   = mean(breakdown.pref of scheduled stops)
droppedHighScore(plan)   = count(dropped POIs with score > 0.8)
enrichmentCoverage(plan) = share of scheduled stops with known opening hours
constraintViolations(p)  = closedAtVisit + overBudget + repeatedPoi      # must be 0
geoapifyCreditsPerTrip   = credits consumed during generation
```

---

## 12. Weight learning (scaffold only)

```
function exportTrainingTable():
    for each trip with EngineEvents:
        for each POI shown to the user:
            label = 1 if kept_at_trip_completion else 0 if removed or replaced
            row = [breakdown.pref, .quality, .tfit, .social, .pen, contextFeatures...]
            write(row, label, tripId)

function learnWeights(table):
    build pairs (kept_i, removed_j) within the same trip/day
    fit logistic regression (or linear rankSVM) on x_i - x_j -> 1
    normalise: positive weights sum to 1, penalty coefficient separate
    write config/engine.weights.candidate.json               # never overwrite live weights
    report offline metric change on held-out trips
```

---

## 13. Default constants (starting points; tune with the eval harness)

| Constant | Start value | Notes |
|---|---|---|
| `W_PREF, W_QUAL, W_TIME, W_SOC, W_PEN` | 0.35, 0.20, 0.20, 0.10, 0.15 | positives sum to 0.85, penalty separate; adjust to taste |
| `DELTA, PHI` | 0.6, 0.4 | popularity vs pheromone |
| `RHO` | 0.1 per 7 days | evaporation |
| `Q` | 1 | pheromone deposit |
| `MU_MAX, MU_SCALE` | 0.6, 200 | pheromone blend growth |
| `EPS` | 1 | transition smoothing |
| `P_FLOOR` | 1e-4 | caps `-log P` |
| `N` (candidates to planner) | 100 | 60 if multi-day is slow |
| `SOLVER_SECONDS` | 8 (3 for single-day re-plan) | anytime |
| default circuity walk / two-wheeler / car | 1.3 / 1.35 / 1.4 | replaced by per-city calibration |
| `LAMBDA` | ~6 | tune so an unlikely transition costs ~15 min |
| `MAX_STOPS` relaxed / moderate / packed | 3 / 5 / 7 | attractions per day, excluding meals |
| `ENRICH_TTL` | 180 days | re-fetch Place Details rarely |
| `TTL_ROUTE` | 30 days | verify against Geoapify terms |
| name similarity threshold for Places match | 0.8 | plus max 150 m distance |
| `TRIP_ENRICH_BUDGET` | set from Geoapify plan credits | hard cap per trip |

Score weights are a starting point only; record the effect of any change in `docs/EVAL_REPORT.md`.
