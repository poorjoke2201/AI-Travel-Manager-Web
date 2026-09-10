const { callGoogleMaps } = require('./googleMaps.service');
const { getGeoapifyRoute } = require('./geoapify.service');
const logger = require('../../utils/logger');

function decodePolyline(encoded) {
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    coordinates.push([lat / 1e5, lng / 1e5]);
  }

  return coordinates;
}

/**
 * Real road travel distance/duration between two points via the Directions
 * API. This is the ROAD-TRAVEL counterpart to utils/haversine.js's
 * straight-line distance - keep them conceptually separate (spec section 24):
 * haversine for ranking/clustering, this for actual ETAs and the car
 * transport option (spec section 17).
 * Returns null on failure so callers fall back to Haversine.
 */
async function getGoogleRoute(origin, destination, waypoints = [], mode = 'driving') {
  try {
    const params = {
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      mode,
    };
    if (waypoints.length) {
      params.waypoints = waypoints.map((point) => `${point.lat},${point.lng}`).join('|');
    }

    const data = await callGoogleMaps('directions/json', params);

    const route = data.routes && data.routes[0];
    const leg = route && route.legs && route.legs[0];
    if (!leg) return null;

    return {
      distanceKm: leg.distance.value / 1000,
      durationMinutes: Math.round(leg.duration.value / 60),
      distanceText: leg.distance.text,
      durationText: leg.duration.text,
      provider: 'google',
      geometry: route.overview_polyline ? decodePolyline(route.overview_polyline.points) : [],
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

/** Gets a road route, falling back to Geoapify when Google is unavailable. */
async function getRoute(origin, destination, waypoints = [], mode = 'driving') {
  if (typeof waypoints === 'string') {
    mode = waypoints;
    waypoints = [];
  }
  const googleRoute = await getGoogleRoute(origin, destination, waypoints, mode);
  if (googleRoute) return googleRoute;

  return getGeoapifyRoute(origin, destination, waypoints, mode);
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