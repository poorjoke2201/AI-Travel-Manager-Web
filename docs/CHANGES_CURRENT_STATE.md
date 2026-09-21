# Current-state summary for the three requested feature changes

## 1. Current trip detail and map surfaces

- The trip details page is in [client/src/pages/TripDetailsPage.jsx](../client/src/pages/TripDetailsPage.jsx). It maintains a tabbed flow for Overview, Pre-Trip, Transport, Itinerary, Map and Budget.
- The Itinerary tab renders each day in [client/src/components/itinerary/DayItinerary.jsx](../client/src/components/itinerary/DayItinerary.jsx) and the map currently renders via [client/src/components/itinerary/ItineraryMap.jsx](../client/src/components/itinerary/ItineraryMap.jsx).
- The Explore page search and result pipeline is in [client/src/pages/ExplorePage.jsx](../client/src/pages/ExplorePage.jsx) and uses [client/src/components/explore/ExploreMap.jsx](../client/src/components/explore/ExploreMap.jsx) for the map surface.
- The Trip model exists in [server/src/models/Trip.js](../server/src/models/Trip.js); the current solo-trip schema includes budget, travellers, destination and itinerary arrays but no group-trip fields or member access model.
- Expense logic is in [server/src/services/expenses/budget.service.js](../server/src/services/expenses/budget.service.js) and the model is [server/src/models/Expense.js](../server/src/models/Expense.js). It is currently owner-scoped and not yet group-aware.
- Auth and access checks are in [server/src/middleware/auth.middleware.js](../server/src/middleware/auth.middleware.js). The existing rule is single-owner access; this is where the shared `requireTripAccess` pattern will plug in for feature 3.
- The trip creation flow is in [client/src/pages/CreateTripPage.jsx](../client/src/pages/CreateTripPage.jsx) and [client/src/components/trip/TripForm.jsx](../client/src/components/trip/TripForm.jsx). It currently creates one-user solo trips only.

## 2. Feature hook points

### Feature 1: category-specific map pins

- Entry point: [client/src/utils/mapUtils.js](../client/src/utils/mapUtils.js) and all Leaflet markers created from trip and Explore maps.
- New icon resolution logic plugs in centrally via [client/src/mapIcons/resolveIcon.js](../client/src/mapIcons/resolveIcon.js).
- The map views and popup labels are updated by swapping the marker icon factory rather than per-component hard-coded colors.
- The dev review page lives at `/dev/pins` and is intended for visual QA of all asset keys.

### Feature 2: split itinerary+map view

- Entry point: [client/src/pages/TripDetailsPage.jsx](../client/src/pages/TripDetailsPage.jsx) and the tab routing in [client/src/App.jsx](../client/src/App.jsx).
- The Itinerary tab is changed from separate map subtab to a split layout with list + map, while the route-level `initialTab` compatibility remains in place.
- The selected day and stop state is managed in a shared view context to keep cards and markers synchronised.

### Feature 3: group trips and shared expenses

- Entry point: [server/src/models/Trip.js](../server/src/models/Trip.js), [server/src/models/Expense.js](../server/src/models/Expense.js), and the trip form in [client/src/components/trip/TripForm.jsx](../client/src/components/trip/TripForm.jsx).
- The app adds `isGroupTrip` and group-member metadata in the trip schema, with a future `requireTripAccess` middleware and `TripMember` / `GroupExpense` models to enforce access and settlement logic without disturbing solo-trip behaviour.
- Existing `Expense` usage remains intact for solo trips, while group expenses are additive and behind the feature flag.

## 3. Ground rules observed

- No breaking changes to solo trip behaviour.
- Feature flags are additive and default to enabled in development.
- Money remains integer-based for the existing app contract; group expense work preserves paise arithmetic rather than introducing floats.
