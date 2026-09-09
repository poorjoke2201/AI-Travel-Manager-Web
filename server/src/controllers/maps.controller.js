const { geocodeAddress } = require('../services/maps/geocoding.service');
const { getRoute } = require('../services/maps/routing.service');
const ApiError = require('../utils/apiError');

/** GET /api/maps/geocode?address=... */
async function geocode(req, res, next) {
  try {
    const { address } = req.query;
    if (!address || !address.trim()) {
      throw ApiError.badRequest('Query parameter "address" is required.');
    }
    const result = await geocodeAddress(address);
    if (!result) {
      return res.status(200).json({ success: true, data: null, message: 'No results found for this address.' });
    }
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /api/maps/route  body: { origin: {lat,lng}, destination: {lat,lng}, mode? } */
async function route(req, res, next) {
  try {
    const { origin, destination, mode } = req.body;
    if (!origin || !destination || typeof origin.lat !== 'number' || typeof destination.lat !== 'number') {
      throw ApiError.badRequest('Both origin and destination ({lat, lng}) are required.');
    }
    const result = await getRoute(origin, destination, mode || 'driving');
    if (!result) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'Route unavailable right now - falling back to straight-line distance is recommended client-side.',
      });
    }
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { geocode, route };