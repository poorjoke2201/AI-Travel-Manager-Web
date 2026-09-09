const axios = require('axios');
const { env } = require('../../config/env');
const logger = require('../../utils/logger');

const client = axios.create({
  baseURL: 'https://api.geoapify.com/v1',
  timeout: 8000,
});

/**
 * Geocodes a free-text query using Geoapify.
 * Returns { lat, lng, formattedAddress } or null on any failure.
 * Used as the fallback when Google Maps geocoding is unavailable.
 */
async function geoapifyGeocode(query) {
  if (!env.geoapifyApiKey || env.geoapifyApiKey.startsWith('<')) return null;
  if (!query || !query.trim()) return null;

  try {
    const { data } = await client.get('/geocode/search', {
      params: {
        text: query,
        filter: 'countrycode:in', // restrict to India
        limit: 1,
        apiKey: env.geoapifyApiKey,
      },
    });

    const feature = data.features && data.features[0];
    if (!feature) return null;

    const [lng, lat] = feature.geometry.coordinates;
    return { lat, lng, formattedAddress: feature.properties.formatted };
  } catch (err) {
    logger.warn(`Geoapify geocode failed for "${query}"`, err.message);
    return null;
  }
}

module.exports = { geoapifyGeocode };
