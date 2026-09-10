/**
 * Centralized environment configuration.
 * Every other file should read config from here instead of touching
 * process.env directly - keeps env access auditable and typo-proof.
 */
const path = require('path');

// Resolve the project .env from this file's location so npm --prefix and
// process managers do not change which environment file gets loaded.
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const REQUIRED_IN_PRODUCTION = ['MONGO_URI', 'JWT_SECRET', 'GEMINI_API_KEY', 'GOOGLE_MAPS_API_KEY'];

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  mongoUri: process.env.MONGO_URI || '',

  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',

  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  geoapifyPlacesApiKey: process.env.GEOAPIFY_PLACES_API_KEY || '',
  geoapifyPlaceDetailsApiKey: process.env.GEOAPIFY_PLACE_DETAILS_API_KEY || '',
  geoapifyGeocodingApiKey: process.env.GEOAPIFY_GEOCODING_API_KEY || '',
  geoapifyRoutingApiKey: process.env.GEOAPIFY_ROUTING_API_KEY || '',
  geoapifyRoutePlannerApiKey: process.env.GEOAPIFY_ROUTE_PLANNER_API_KEY || '',
  geoapifyRouteMatrixApiKey: process.env.GEOAPIFY_ROUTE_MATRIX_API_KEY || '',

  huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY || '',
  huggingfaceModel: process.env.HUGGINGFACE_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3',

  isProduction: (process.env.NODE_ENV || 'development') === 'production',
};

function validateEnv() {
  if (!env.isProduction) return; // be lenient in dev so the app boots without all keys yet
  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = { env, validateEnv };