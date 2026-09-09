/**
 * Cheap geographic ("as the crow flies") distance calculations.
 * This is intentionally separate from server/src/services/maps/routing.service.js,
 * which uses Google Maps for actual road travel distance/time. Never conflate
 * the two - haversine is for ranking/clustering, routing is for real ETAs.
 */

const EARTH_RADIUS_KM = 6371.0088;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * @param {{lat:number, lng:number}} a
 * @param {{lat:number, lng:number}} b
 * @returns {number} distance in kilometres
 */
function haversineDistanceKm(a, b) {
  if (
    a == null || b == null ||
    typeof a.lat !== 'number' || typeof a.lng !== 'number' ||
    typeof b.lat !== 'number' || typeof b.lng !== 'number' ||
    Number.isNaN(a.lat) || Number.isNaN(a.lng) || Number.isNaN(b.lat) || Number.isNaN(b.lng)
  ) {
    return Infinity;
  }

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

/** Sort-stable: distance from `origin` to every point in `points`, ascending. */
function sortByDistance(origin, points, getCoords = (p) => p.coordinates) {
  return points
    .map((p) => ({ point: p, distanceKm: haversineDistanceKm(origin, getCoords(p)) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Centroid of a set of {lat,lng} points - used by clustering.service.js. */
function centroid(points) {
  const valid = points.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  if (!valid.length) return null;
  const sum = valid.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / valid.length, lng: sum.lng / valid.length };
}

module.exports = { haversineDistanceKm, sortByDistance, centroid, EARTH_RADIUS_KM };