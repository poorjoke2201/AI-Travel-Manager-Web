const ApiError = require('../../utils/apiError');

/**
 * Legacy Google Maps adapter retained only as an explicit compatibility stub.
 * The active app path now uses Geoapify for geocoding and routing.
 */
async function callGoogleMaps() {
  throw ApiError.serviceUnavailable('Google Maps support has been removed from this app. Use Geoapify-backed routing/geocoding instead.');
}

module.exports = { callGoogleMaps };