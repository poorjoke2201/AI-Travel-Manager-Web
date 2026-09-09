const axios = require('axios');
const { env } = require('../../config/env');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');

const BASE_URL = 'https://maps.googleapis.com/maps/api';

const client = axios.create({ baseURL: BASE_URL, timeout: 8000 });

/**
 * Thin wrapper around the raw Google Maps HTTP endpoints. Every other maps
 * service (geocoding, routing, distance) goes through this so API-key
 * handling, timeouts, and error normalization live in exactly one place.
 * Throws ApiError.serviceUnavailable on any failure so callers can trigger
 * their Haversine/deterministic fallback (spec section 47) instead of
 * crashing the request.
 */
async function callGoogleMaps(endpoint, params) {
  if (!env.googleMapsApiKey) {
    throw ApiError.serviceUnavailable('Google Maps API key is not configured.');
  }

  try {
    const { data } = await client.get(`/${endpoint}`, {
      params: { ...params, key: env.googleMapsApiKey },
    });

    if (data.status && !['OK', 'ZERO_RESULTS'].includes(data.status)) {
      logger.warn(`Google Maps ${endpoint} returned status ${data.status}`, data.error_message);
      throw ApiError.serviceUnavailable(`Google Maps ${endpoint} error: ${data.status}`);
    }

    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.warn(`Google Maps ${endpoint} request failed`, err);
    throw ApiError.serviceUnavailable(`Google Maps ${endpoint} request failed.`);
  }
}

module.exports = { callGoogleMaps };