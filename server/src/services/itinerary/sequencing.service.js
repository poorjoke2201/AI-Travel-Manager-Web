const { haversineDistanceKm } = require('../../utils/haversine');

/**
 * Orders POIs within one day's cluster using a greedy nearest-neighbour
 * walk starting from `startPoint` (typically the hotel/base location, or
 * the cluster centroid if no base is known yet). This is intentionally
 * simple (not full TSP-optimal) - for the small number of stops per day
 * (typically <=7) a full solve isn't worth the complexity, and greedy
 * nearest-neighbour is what actually matches how people plan a day.
 */
function sequenceDayPOIs(pois, startPoint) {
  if (!pois.length) return [];

  const withCoords = pois.filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number');
  const withoutCoords = pois.filter((p) => !(typeof p.latitude === 'number' && typeof p.longitude === 'number'));

  if (!withCoords.length) return [...pois]; // nothing to sequence geographically

  const remaining = [...withCoords];
  const ordered = [];
  let current = startPoint || { lat: withCoords[0].latitude, lng: withCoords[0].longitude };

  while (remaining.length) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    remaining.forEach((poi, idx) => {
      const d = haversineDistanceKm(current, { lat: poi.latitude, lng: poi.longitude });
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = idx;
      }
    });
    const [next] = remaining.splice(nearestIdx, 1);
    ordered.push(next);
    current = { lat: next.latitude, lng: next.longitude };
  }

  // Coordinate-less items (e.g. Gemini-fallback POIs) get appended at the end
  // rather than dropped, since we can't place them geographically.
  return [...ordered, ...withoutCoords];
}

/**
 * Inserts a restaurant candidate before/after a given index based on
 * proximity to that point in the sequence - used by itineraryOptimizer to
 * slot lunch/dinner near wherever the traveller will actually be.
 */
function findNearestRestaurant(point, restaurants, excludeIds = new Set()) {
  const candidates = restaurants.filter(
    (r) => !excludeIds.has(r.id) && typeof r.latitude === 'number' && typeof r.longitude === 'number'
  );
  if (!candidates.length) {
    return restaurants.find((r) => !excludeIds.has(r.id)) || null; // fall back to any unused one, even without coords
  }

  let best = null;
  let bestDist = Infinity;
  candidates.forEach((r) => {
    const d = haversineDistanceKm(point, { lat: r.latitude, lng: r.longitude });
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  });
  return best;
}

module.exports = { sequenceDayPOIs, findNearestRestaurant };