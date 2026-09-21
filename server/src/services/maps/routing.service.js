const { getGeoapifyRoute } = require('./geoapify.service');

/**
 * Real road travel distance/duration between two points via Geoapify.
 * Haversine remains the straight-line fallback for ranking, while this API is
 * used when we need actual ETA/route data for a trip.
 */
async function getRoute(origin, destination, waypoints = [], mode = 'driving') {
  if (typeof waypoints === 'string') {
    mode = waypoints;
    waypoints = [];
  }

  return getGeoapifyRoute(origin, destination, waypoints, mode);
}

/**
 * Batched road distance/duration for one origin to many destinations. The
 * previous Google Maps implementation has been removed; this lightweight
 * Geoapify-based compatibility wrapper returns null entries when a leg fails.
 */
async function getDistanceMatrix(origin, destinations, mode = 'driving') {
  if (!destinations.length) return [];

  const results = [];
  for (const destination of destinations) {
    // eslint-disable-next-line no-await-in-loop
    const route = await getRoute(origin, destination, [], mode);
    results.push(route ? {
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
    } : null);
  }

  return results;
}

module.exports = { getRoute, getDistanceMatrix };