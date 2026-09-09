const { callGoogleMaps } = require('./googleMaps.service');
const logger = require('../../utils/logger');

/**
 * Real road travel distance/duration between two points via the Directions
 * API. This is the ROAD-TRAVEL counterpart to utils/haversine.js's
 * straight-line distance - keep them conceptually separate (spec section 24):
 * haversine for ranking/clustering, this for actual ETAs and the car
 * transport option (spec section 17).
 * Returns null on failure so callers fall back to Haversine.
 */
async function getRoute(origin, destination, mode = 'driving') {
  try {
    const data = await callGoogleMaps('directions/json', {
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      mode,
    });

    const route = data.routes && data.routes[0];
    const leg = route && route.legs && route.legs[0];
    if (!leg) return null;

    return {
      distanceKm: leg.distance.value / 1000,
      durationMinutes: Math.round(leg.duration.value / 60),
      distanceText: leg.distance.text,
      durationText: leg.duration.text,
      polyline: route.overview_polyline ? route.overview_polyline.points : null,
      steps: leg.steps.map((s) => ({
        instruction: s.html_instructions,
        distanceText: s.distance.text,
        durationText: s.duration.text,
      })),
    };
  } catch (err) {
    logger.warn(`getRoute failed (${origin.lat},${origin.lng} -> ${destination.lat},${destination.lng})`, err.message);
    return null;
  }
}

/**
 * Batched road distance/duration for one origin to many destinations
 * (e.g. hotel -> each candidate POI for a day) via the Distance Matrix API.
 * Returns an array aligned with `destinations`, with null entries for any
 * leg that failed to resolve.
 */
async function getDistanceMatrix(origin, destinations, mode = 'driving') {
  if (!destinations.length) return [];
  try {
    const data = await callGoogleMaps('distancematrix/json', {
      origins: `${origin.lat},${origin.lng}`,
      destinations: destinations.map((d) => `${d.lat},${d.lng}`).join('|'),
      mode,
    });

    const row = data.rows && data.rows[0];
    if (!row) return destinations.map(() => null);

    return row.elements.map((el) =>
      el.status === 'OK'
        ? { distanceKm: el.distance.value / 1000, durationMinutes: Math.round(el.duration.value / 60) }
        : null
    );
  } catch (err) {
    logger.warn('getDistanceMatrix failed', err.message);
    return destinations.map(() => null);
  }
}

module.exports = { getRoute, getDistanceMatrix };