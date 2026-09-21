# Geoapify notes

## Verified usage

This project now treats Geoapify as the canonical provider for geocoding and road routing. The app prefers Geoapify over Google Maps for live route and place lookups, with LocationIQ retained as a secondary geocoding source and a static city fallback as the final safety net.

## Terms and caching

Geoapify usage is subject to its current API terms and credit limits. The current app code does not persist raw provider response bodies long term beyond the runtime request cache. For production use, keep attribution and license requirements in the UI and docs when displaying route or map data derived from Geoapify/OSM content.

## Credit and rate-limit handling

The application should enforce request throttling, retry with backoff on 429/5xx, and surface budget exhaustion cleanly. The runtime path here uses best-effort wrappers and should be extended with a full budget-aware cache layer if the v2 engine is enabled.

## Attributions

When route geometry or place metadata derived from Geoapify or OSM is shown in the app, ensure attribution is present in the relevant map or metadata UI.
