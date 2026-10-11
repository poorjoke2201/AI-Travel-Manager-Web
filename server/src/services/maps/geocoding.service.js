const axios = require('axios');
const { geoapifyGeocode } = require('./geoapify.service');
const { env } = require('../../config/env');
const logger = require('../../utils/logger');
const { haversineDistanceKm } = require('../../utils/haversine');

const MAX_DESTINATION_DISTANCE_KM = 100;

function isValidCoordinates(coords) {
  return Number.isFinite(coords?.lat)
    && Number.isFinite(coords?.lng)
    && coords.lat >= -90
    && coords.lat <= 90
    && coords.lng >= -180
    && coords.lng <= 180;
}

function isWithinDestinationRadius(coords, destinationCoords, maxDistanceKm = MAX_DESTINATION_DISTANCE_KM) {
  if (!isValidCoordinates(coords)) return false;
  if (!isValidCoordinates(destinationCoords)) return true;
  return haversineDistanceKm(coords, destinationCoords) <= maxDistanceKm;
}

async function locationIqGeocode(query, biasCoords = null) {
  if (!env.locationIqApiKey || !query?.trim()) return null;
  try {
    const params = {
      key: env.locationIqApiKey,
      q: query,
      format: 'json',
      limit: 5,
      countrycodes: 'in',
      addressdetails: 1,
    };
    // Bias results toward the destination city when we know its coordinates
    if (biasCoords) {
      params.viewbox = `${biasCoords.lng - 1},${biasCoords.lat + 1},${biasCoords.lng + 1},${biasCoords.lat - 1}`;
      params.bounded = 0; // soft bias, not hard clip
    }
    const { data } = await axios.get(`${env.locationIqBaseUrl}/search`, {
      params,
      headers: { 'User-Agent': 'TravelManagerApp/1.0' },
      timeout: 8000,
    });
    const results = Array.isArray(data) ? data : [];
    if (!results.length) return null;
    const candidates = results
      .map((result) => ({
        lat: Number(result.lat),
        lng: Number(result.lon),
        formattedAddress: result.display_name,
      }))
      .filter((result) => isValidCoordinates(result)
        && (!biasCoords || isWithinDestinationRadius(result, biasCoords)));
    if (!candidates.length) return null;
    if (biasCoords) {
      candidates.sort((a, b) => haversineDistanceKm(a, biasCoords) - haversineDistanceKm(b, biasCoords));
    }
    return candidates[0];
  } catch (err) {
    logger.warn(`LocationIQ geocode failed for "${query}"`, err.message);
    return null;
  }
}
// Static city-center coordinates used as the final fallback when all live
// providers are unavailable or rate-limited.
const CITY_COORDS = {
  'agra': { lat: 27.1767, lng: 78.0081 }, 'ahmedabad': { lat: 23.0225, lng: 72.5714 },
  'ajmer': { lat: 26.4499, lng: 74.6399 }, 'allahabad': { lat: 25.4358, lng: 81.8463 },
  'amritsar': { lat: 31.6340, lng: 74.8723 }, 'aurangabad': { lat: 19.8762, lng: 75.3433 },
  'bangalore': { lat: 12.9716, lng: 77.5946 }, 'bengaluru': { lat: 12.9716, lng: 77.5946 },
  'bhopal': { lat: 23.2599, lng: 77.4126 }, 'bhubaneswar': { lat: 20.2961, lng: 85.8245 },
  'chandigarh': { lat: 30.7333, lng: 76.7794 }, 'chennai': { lat: 13.0827, lng: 80.2707 },
  'coimbatore': { lat: 11.0168, lng: 76.9558 }, 'darjeeling': { lat: 27.0360, lng: 88.2627 },
  'dehradun': { lat: 30.3165, lng: 78.0322 }, 'delhi': { lat: 28.6139, lng: 77.2090 },
  'new delhi': { lat: 28.6139, lng: 77.2090 }, 'goa': { lat: 15.2993, lng: 74.1240 },
  'guwahati': { lat: 26.1445, lng: 91.7362 }, 'gwalior': { lat: 26.2183, lng: 78.1828 },
  'hampi': { lat: 15.3350, lng: 76.4600 }, 'haridwar': { lat: 29.9457, lng: 78.1642 },
  'hyderabad': { lat: 17.3850, lng: 78.4867 }, 'indore': { lat: 22.7196, lng: 75.8577 },
  'jaipur': { lat: 26.9124, lng: 75.7873 }, 'jaisalmer': { lat: 26.9157, lng: 70.9083 },
  'jammu': { lat: 32.7266, lng: 74.8570 }, 'jodhpur': { lat: 26.2389, lng: 73.0243 },
  'kanpur': { lat: 26.4499, lng: 80.3319 }, 'kanyakumari': { lat: 8.0883, lng: 77.5385 },
  'kochi': { lat: 9.9312, lng: 76.2673 }, 'cochin': { lat: 9.9312, lng: 76.2673 },
  'kodaikanal': { lat: 10.2381, lng: 77.4892 }, 'kolkata': { lat: 22.5726, lng: 88.3639 },
  'kozhikode': { lat: 11.2588, lng: 75.7804 }, 'kullu': { lat: 31.9579, lng: 77.1095 },
  'leh': { lat: 34.1526, lng: 77.5771 }, 'lonavala': { lat: 18.7481, lng: 73.4072 },
  'lucknow': { lat: 26.8467, lng: 80.9462 }, 'ludhiana': { lat: 30.9010, lng: 75.8573 },
  'madurai': { lat: 9.9252, lng: 78.1198 }, 'manali': { lat: 32.2396, lng: 77.1887 },
  'mangalore': { lat: 12.9141, lng: 74.8560 }, 'mathura': { lat: 27.4924, lng: 77.6737 },
  'meerut': { lat: 28.9845, lng: 77.7064 }, 'mount abu': { lat: 24.5926, lng: 72.7156 },
  'mumbai': { lat: 19.0760, lng: 72.8777 }, 'munnar': { lat: 10.0889, lng: 77.0595 },
  'mussoorie': { lat: 30.4598, lng: 78.0664 }, 'mysore': { lat: 12.2958, lng: 76.6394 }, 'mysuru': { lat: 12.2958, lng: 76.6394 },
  'nagpur': { lat: 21.1458, lng: 79.0882 }, 'nainital': { lat: 29.3919, lng: 79.4542 },
  'nashik': { lat: 19.9975, lng: 73.7898 }, 'noida': { lat: 28.5355, lng: 77.3910 },
  'ooty': { lat: 11.4102, lng: 76.6950 }, 'patna': { lat: 25.5941, lng: 85.1376 },
  'pondicherry': { lat: 11.9416, lng: 79.8083 }, 'puducherry': { lat: 11.9416, lng: 79.8083 },
  'pune': { lat: 18.5204, lng: 73.8567 }, 'puri': { lat: 19.8135, lng: 85.8312 },
  'raipur': { lat: 21.2514, lng: 81.6296 }, 'ranchi': { lat: 23.3441, lng: 85.3096 },
  'rishikesh': { lat: 30.0869, lng: 78.2676 }, 'shimla': { lat: 31.1048, lng: 77.1734 },
  'srinagar': { lat: 34.0837, lng: 74.7973 }, 'surat': { lat: 21.1702, lng: 72.8311 },
  'thiruvananthapuram': { lat: 8.5241, lng: 76.9366 }, 'trivandrum': { lat: 8.5241, lng: 76.9366 },
  'udaipur': { lat: 24.5854, lng: 73.7125 }, 'ujjain': { lat: 23.1765, lng: 75.7885 },
  'vadodara': { lat: 22.3072, lng: 73.1812 }, 'varanasi': { lat: 25.3176, lng: 82.9739 },
  'vijayawada': { lat: 16.5062, lng: 80.6480 }, 'visakhapatnam': { lat: 17.6868, lng: 83.2185 },
};

/**
 * Extracts the most likely city token from a geocoding query string.
 * Handles patterns like:
 *   "Mysore Palace, Mysuru Sub District, India"  -> "Mysuru"
 *   "Some Place, Mysuru, India"                  -> "Mysuru"
 *   "Mysuru"                                     -> "Mysuru"
 * Strategy: walk comma-separated parts right-to-left, skip "India" and
 * anything that looks like a sub-district/state qualifier, return the
 * first part that matches a known city or is a short clean token.
 */
function extractCityFromQuery(query) {
  if (!query) return null;
  const parts = query.split(',').map((p) => p.trim()).filter(Boolean);
  // Walk from right, skipping country names and stripping administrative suffixes.
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (/^india$/i.test(part)) continue;
    const key = part
      .replace(/\b(sub.?district|division|district|tehsil|taluk|mandal)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (CITY_COORDS[key]) return part; // exact known city
    if (/sub.?district|division|district|tehsil|taluk|mandal/i.test(part)) continue;
    if (part.split(' ').length <= 3 && part.length <= 30) return part; // short enough to be a city
  }
  return parts[0] || null; // last resort: first token (the place name itself)
}

function cityFallbackCoords(city) {
  if (!city) return null;
  // Try the value as-is first, then strip sub-district qualifiers
  const normalized = city.toLowerCase().trim();
  const direct = CITY_COORDS[normalized];
  if (direct) return direct;
  const stripped = normalized
    .replace(/\b(sub.?district|division|district|tehsil|taluk|mandal)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (CITY_COORDS[stripped]) return CITY_COORDS[stripped];
  const extracted = extractCityFromQuery(city);
  return extracted ? (CITY_COORDS[extracted.toLowerCase().trim()] || null) : null;
}

/**
 * Builds a clean geocoding query that always ends with the canonical city
 * name and "India", regardless of what administrative string the record's
 * city field contains (e.g. "Mysuru Sub District" -> "Mysuru").
 */
function buildGeocodingQuery(placeName, recordCity, destinationCity) {
  // Prefer the trip destination city over the record's city field because
  // Gemini often sets city to an administrative boundary name.
  const cityAnchor = destinationCity || recordCity || '';
  // Strip sub-district / administrative qualifiers from the city anchor
  const cleanCity = cityAnchor
    .replace(/\s*(sub.?district|district|division|tehsil|taluk|mandal)\s*/gi, '')
    .trim();
  const parts = [placeName];
  if (cleanCity) parts.push(cleanCity);
  parts.push('India');
  return parts.join(', ');
}

/**
 * Geocodes a single free-text address/place name to {lat, lng}.
 * Accepts an optional destinationCity so queries are anchored to the right
 * city even when the record's own city field is an administrative string.
 */
async function geocodeAddress(query, {
  destinationCity = null,
  biasCoords = null,
  allowCityFallback = true,
} = {}) {
  if (!query || !query.trim()) return null;

  // If a destination city is provided, rebuild the query with a clean anchor
  const effectiveQuery = destinationCity
    ? buildGeocodingQuery(query.split(',')[0].trim(), null, destinationCity)
    : query;

  // Resolve bias coords from destinationCity if not explicitly provided
  const effectiveBias = biasCoords
    || (destinationCity
      ? cityFallbackCoords(destinationCity)
      : cityFallbackCoords(extractCityFromQuery(effectiveQuery)));

  const geoapifyResult = await geoapifyGeocode(effectiveQuery, effectiveBias);
  if (geoapifyResult && isWithinDestinationRadius(geoapifyResult, effectiveBias)) return geoapifyResult;

  const locationIqResult = await locationIqGeocode(effectiveQuery, effectiveBias);
  if (locationIqResult && isWithinDestinationRadius(locationIqResult, effectiveBias)) return locationIqResult;

  if (!allowCityFallback) return null;
  // Static city-center fallback — use destination city first, then extract from query
  if (destinationCity) {
    const cityCoords = cityFallbackCoords(destinationCity);
    if (cityCoords) return cityCoords;
  }
  const extracted = extractCityFromQuery(effectiveQuery);
  return extracted ? cityFallbackCoords(extracted) : null;
}

function getGeocodeProviderOrder() {
  return ['geoapify', 'locationiq', 'cityFallback'];
}

/**
 * Geocodes a small list of candidates. Accepts an optional destinationCity
 * so every query is anchored to the correct city.
 */
async function geocodeCandidates(candidates, { maxCandidates = 15, destinationCity = null } = {}) {
  const limited = candidates.slice(0, maxCandidates);
  const results = new Map();
  for (const candidate of limited) {
    // Always anchor to destinationCity, ignoring the record's own city field
    // which may be an administrative boundary name set by Gemini.
    const city = destinationCity || candidate.city;
    const biasCoords = cityFallbackCoords(city);
    const query = buildGeocodingQuery(candidate.name, candidate.city, city);
    // eslint-disable-next-line no-await-in-loop
    const coords = await geocodeAddress(query, {
      destinationCity: city,
      biasCoords,
      allowCityFallback: false,
    });
    if (coords && isWithinDestinationRadius(coords, biasCoords)) {
      results.set(String(candidate._id || candidate.sourceId), coords);
    }
  }

  return results;
}

module.exports = {
  geocodeAddress,
  geocodeCandidates,
  cityFallbackCoords,
  getGeocodeProviderOrder,
  isValidCoordinates,
  isWithinDestinationRadius,
  MAX_DESTINATION_DISTANCE_KM,
};