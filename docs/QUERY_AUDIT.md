# Candidate Retrieval Query Audit

## Scope

This audit is intentionally limited to database retrieval quality for the trip candidate pipeline.

It does not alter:

- scoring logic
- optimizer behavior
- route planning
- AI generation
- frontend behavior
- trip creation flow outside the retrieval layer

## Current retrieval model

The app pulls cities, POIs, hotels and restaurants through the MongoDB access layer in [server/src/services/recommendation/candidate.service.js](../server/src/services/recommendation/candidate.service.js). The retrieval contract is intentionally small and bounded:

- city matching is done before ranking
- POI/hotel/restaurant candidate pools are capped
- extra metadata is attached without modifying the caller interface
- the v2 retrieval path is feature-flagged and remains off by default

## Q0: Baseline + coverage audit

Baseline observations from the code path:

- city lookup relied on raw city strings and regex matching
- canonical aliasing was incomplete for common Indian city variants such as Mysuru/Mysore and Bengaluru/Bangalore
- the retrieval layer did not export a consistent helper for canonical variant evaluation
- the public API shape used by trip generation was stable, but the actual city matching logic was brittle

## Q1: Additive migration

The retrieval layer supports an additive migration strategy:

- canonical city alias map remains compatible with existing strings
- city variant patterns are computed without replacing the higher-level selection flow
- the v2 branch simply switches to a variant-based city query when enabled
- legacy behavior remains as fallback until verification passes

## Q2: Index and query design

The underlying models already provide the important filters:

- POI: city + category; city + googleRating; tier + city + category
- Hotel: city + pricePerNightInr; city + googleRating
- Restaurant: city + rating; city + cuisine; isPureVeg + city

This means the retrieval work should stay in the filtering layer instead of introducing broader search rewrites.

## Q3: Retrieval rewrite under flag

The retrieval rewrite is behind the flag CANDIDATE_QUERY_V2. It is intentionally off by default until shadow-mode comparisons pass.

Behavior when enabled:

- normalize and canonicalize the destination city
- generate a variant set like Mysore, Mysuru, mysore, mysuru
- use a city-in union query instead of a single brittle city text check
- preserve the existing budget and preference filters
- keep the public function signatures unchanged

## Q4: Caching decision

Caching is not necessary for the initial fix because:

- each trip request already narrows to a single destination and small preference set
- the primary cost is dataset filtering rather than repeated heavy compute
- the optimization target is correctness and recall, not micro-optimizations

If benchmark data shows repeated duplicate lookups, a cache can be added later behind a separate change.

## Q5: Shadow mode and verification

The implementation remains safe because the default flag is false. The path to production is:

1. run baseline recall checks
2. compare v2 and legacy queries in shadow mode
3. verify city-variant coverage for canonical aliases
4. only then flip the production flag

## Audit summary

The fix in [server/src/services/recommendation/candidate.service.js](../server/src/services/recommendation/candidate.service.js) preserves the retrieval contract and adds the canonical variant helper needed for the database query improvement without changing pricing, scoring, or itinerary assembly.
