# Current State Audit

## Overview

This project is a Node.js + Express + MongoDB travel planner that generates trip itineraries from a curated destination dataset plus Geoapify-backed enrichment. The app currently uses Overture-sourced POIs in Mongo as the preferred dataset, while older curated records remain as a compatibility fallback.

## Provider usage

- Geocoding: Geoapify first, LocationIQ second, static city fallback last.
- Road routes: Geoapify Routing API.
- POI enrichment: Geoapify Places / Place Details when available.
- Weather: Open-Meteo.
- AI narration: Gemini text generation only.
- No live Google Maps integration remains in the active service path.

## Core flow

1. Trip draft is created and persisted.
2. Destination geocodes via geocoding service.
3. Candidate POIs, hotels, and restaurants are retrieved from Mongo with capped queries.
4. Trips rank candidates and ask Gemini for the itinerary structure.
5. The deterministic fallback path builds a day-by-day plan if validation fails.
6. Route planner adds travel legs, then the trip is saved.

## Key files

- server/src/services/trip/tripGeneration.service.js — main trip orchestration.
- server/src/services/recommendation/candidate.service.js — bounded candidate retrieval.
- server/src/services/recommendation/poiRecommendation.service.js — ranking and shortlist generation.
- server/src/services/itinerary/itineraryOptimizer.service.js — deterministic fallback itinerary.
- server/src/services/itinerary/routePlanner.service.js — route/time reconstruction for itinerary days.
- server/src/services/maps/geocoding.service.js — provider chain for geocoding.
- server/src/services/maps/geoapify.service.js — Geoapify HTTP wrappers.
- server/src/models/POI.js — Overture-backed POI schema.
- server/src/models/Trip.js — trip/activity schema and route metadata.

## Data sources

- Overture POIs are imported from the rebuilt CSV dataset and stored as source `overture`.
- Legacy curated records remain in the same `POI` collection but are no longer the preferred source in candidate selection.
- Restaurant and hotel collections are still dataset-backed, with route metadata left as estimates unless Geoapify is available.

## Google references found during audit

Historic Google Maps usage was removed from the active runtime path, but the repository still contains documentation and legacy code comments. The runtime code now avoids the Google Maps dependency and uses Geoapify-first routing and geocoding instead.

## Risks and notes

- A v2-style optimizer is now injected behind `ITINERARY_ENGINE`, with `legacy`, `v2`, and `shadow` modes supported.
- The full Python OR-Tools planner and evaluation harness described in the design prompt are still future work, but the runtime path now includes the working optimizer layer and the Geoapify-first provider chain.
