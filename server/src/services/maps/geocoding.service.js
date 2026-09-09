const { callGoogleMaps } = require('./googleMaps.service');
const { geoapifyGeocode } = require('./geoapify.service');
const logger = require('../../utils/logger');

// Static city-center coordinates used as fallback when Google Maps geocoding
// is unavailable (billing disabled, quota exceeded, etc.).
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
  'mussoorie': { lat: 30.4598, lng: 78.0664 }, 'mysore': { lat: 12.2958, lng: 76.6394 },
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

function cityFallbackCoords(city) {
  if (!city) return null;
  return CITY_COORDS[city.toLowerCase().trim()] || null;
}

/**
 * Geocodes a single free-text address/place name to {lat, lng}.
 * Returns null (never throws) on failure so callers can decide their own
 * fallback - geocoding is used in places where a miss shouldn't crash trip
 * generation (e.g. one hotel out of five failing to resolve).
 */
async function geocodeAddress(query) {
  if (!query || !query.trim()) return null;

  // 1. Try Google Maps
  try {
    const data = await callGoogleMaps('geocode/json', { address: query });
    const result = data.results && data.results[0];
    if (result) {
      const { lat, lng } = result.geometry.location;
      return { lat, lng, formattedAddress: result.formatted_address };
    }
  } catch (err) {
    logger.warn(`Google Maps geocode failed for "${query}", trying Geoapify`, err.message);
  }

  // 2. Try Geoapify
  const geoapifyResult = await geoapifyGeocode(query);
  if (geoapifyResult) return geoapifyResult;

  // 3. Static city-center fallback
  const cityName = query.replace(/,.*$/, '').trim(); // strip ", India" suffix etc.
  return cityFallbackCoords(cityName);
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
    const resolved = coords || cityFallbackCoords(candidate.city);
    if (resolved) {
      results.set(String(candidate._id || candidate.sourceId), resolved);
    }
  }

  return results;
}

module.exports = { geocodeAddress, geocodeCandidates, cityFallbackCoords };