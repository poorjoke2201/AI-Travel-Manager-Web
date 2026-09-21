# Map implementation current state

## Overview

The app already has a working Leaflet map stack for both the itinerary screen and the Explore screen. The main issue was that the actual map data and marker logic were not consistently aligned with the intended destination/itinerary-only behavior described in the product spec.

## Existing state

### 1. Explore map

- Implemented in [client/src/components/explore/ExploreMap.jsx](../client/src/components/explore/ExploreMap.jsx)
- Uses `react-leaflet` with `MapContainer`, `Marker`, `Popup`, and a helper recenter effect.
- It renders only the currently active type: POIs, hotels, or restaurants.
- It calls `createMarkerIcon()` from [client/src/utils/mapUtils.js](../client/src/utils/mapUtils.js) for the destination marker and place markers.
- Popups are rendered via [client/src/components/explore/LocationPopup.jsx](../client/src/components/explore/LocationPopup.jsx)

### 2. Itinerary map

- Implemented in [client/src/components/itinerary/ItineraryMap.jsx](../client/src/components/itinerary/ItineraryMap.jsx)
- Renders the selected day itinerary and an optional street route by calling `/maps/route`.
- The map is driven from itinerary activity objects and currently uses their coordinates for display.
- It includes day tabs and a route polyline layer.

### 3. Marker/icon system

- Shared icon resolution lives in [client/src/mapIcons/resolveIcon.js](../client/src/mapIcons/resolveIcon.js)
- The base map utilities live in [client/src/utils/mapUtils.js](../client/src/utils/mapUtils.js)
- Category metadata and subtype mappings are in [client/src/config/iconMap/category.json](../client/src/config/iconMap/category.json) and [client/src/config/iconMap/subtype.json](../client/src/config/iconMap/subtype.json)

## What was wrong before the fix

1. The itinerary map was not strictly tied to the saved itinerary payload; it could include places that were not clearly sourced from the exact selected itinerary objects.
2. Marker generation used generic circular markers without a proper category-aware pin system and without a clean badge system for stop order.
3. Popup text on the map was not fully normalized to human-readable type labels.
4. The route logic was in place, but the pin/icon system was not using the category alias maps and readable labels as intended.
5. The app had feature flags for split view and category pins but not the explicit `FEATURE_PLACE_PINS` flag required by the implementation plan.

## Decisions taken

- Kept the existing Leaflet + react-leaflet stack; no major migration was needed.
- Reused the already-present icon config maps instead of creating a parallel system.
- Added a feature flag `FEATURE_PLACE_PINS` while preserving the older behavior behind the same map utilities.
- Kept Geoapify/OpenStreetMap attribution visible in the map tiles already used by the app.
- Maintained the API response contract by keeping additivity only; no breaking response-shape changes were introduced.

## Result

The app now has a category-aware pin pipeline and cleaner type labels across the map UI, while the itinerary map remains aligned with the trip itinerary data path and the Explore map remains data-driven from the same filtered dataset.
