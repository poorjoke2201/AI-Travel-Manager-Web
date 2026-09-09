const { callGoogleMaps } = require('./googleMaps.service');
const logger = require('../../utils/logger');

/**
 * Geocodes a single free-text address/place name to {lat, lng}.
 * Returns null (never throws) on failure so callers can decide their own
 * fallback - geocoding is used in places where a miss shouldn't crash trip
 * generation (e.g. one hotel out of five failing to resolve).
 */
async function geocodeAddress(query) {
  if (!query || !query.trim()) return null;
  try {
    const data = await callGoogleMaps('geocode/json', { address: query });
    const result = data.results && data.results[0];
    if (!result) return null;
    const { lat, lng } = result.geometry.location;
    return { lat, lng, formattedAddress: result.formatted_address };
  } catch (err) {
    logger.warn(`geocodeAddress failed for "${query}"`, err.message);
    return null;
  }
}

/**
 * Geocodes ONLY the given small list of candidates (per spec section 32 -
 * never geocode the whole hotels/restaurants collection). Each candidate
 * needs `name` and `city`; mutates nothing - returns a map of id -> coords.
 * Runs geocoding calls sequentially with a cap to keep API usage bounded.
 */
async function geocodeCandidates(candidates, { maxCandidates = 15 } = {}) {
  const limited = candidates.slice(0, maxCandidates);
  const results = new Map();

  for (const candidate of limited) {
    const query = candidate.address
      ? `${candidate.name}, ${candidate.address}, ${candidate.city}`
      : `${candidate.name}, ${candidate.city}`;
    // Sequential (not Promise.all) to stay well under Maps rate limits for a
    // feature that's already a fallback path, not the hot path.
    // eslint-disable-next-line no-await-in-loop
    const coords = await geocodeAddress(query);
    if (coords) {
      results.set(String(candidate._id || candidate.sourceId), coords);
    }
  }

  return results;
}

module.exports = { geocodeAddress, geocodeCandidates };