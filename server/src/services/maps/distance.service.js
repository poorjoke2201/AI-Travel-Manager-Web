const { haversineDistanceKm } = require('../../utils/haversine');
const { getDistanceMatrix } = require('./routing.service');
const logger = require('../../utils/logger');

/**
 * Higher-level distance API used by recommendation/itinerary code so those
 * layers never need to know whether Google Maps is available. Implements
 * the fallback philosophy from spec section 47: try real road distance,
 * silently degrade to Haversine if Maps fails or is disabled.
 *
 * `useRoadDistance` is deliberately opt-in and capped - road distance calls
 * cost API quota, so callers should only request it for the small,
 * already-ranked candidate set (e.g. ordering one day's stops), never for
 * broad candidate filtering, which should always use plain Haversine.
 */
async function bestDistanceKm(origin, destination, { useRoadDistance = false } = {}) {
  if (useRoadDistance) {
    const [result] = await getDistanceMatrix(origin, [destination]).catch((err) => {
      logger.warn('bestDistanceKm: road distance lookup failed, falling back to Haversine', err.message);
      return [null];
    });
    if (result) return { km: result.distanceKm, durationMinutes: result.durationMinutes, isRoadDistance: true };
  }

  return { km: haversineDistanceKm(origin, destination), durationMinutes: null, isRoadDistance: false };
}

/**
 * Batch version for ranking a candidate list against one origin. Always
 * Haversine (cheap, no API quota) - this is the function candidate/scoring
 * services should use, never bestDistanceKm, to keep bulk filtering free.
 */
function haversineDistancesKm(origin, points) {
  return points.map((p) => haversineDistanceKm(origin, p));
}

module.exports = { bestDistanceKm, haversineDistancesKm };