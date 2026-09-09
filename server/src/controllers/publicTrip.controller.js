const tripService = require('../services/trip/trip.service');

/** GET /api/public/trips - browsable public trip discovery, no auth required. */
async function listPublicTrips(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const skip = parseInt(req.query.skip, 10) || 0;
    const trips = await tripService.listPublicTrips({ limit, skip });
    res.status(200).json({ success: true, data: trips });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/public/trips/:id - view a single trip. Works for public trips
 * with no auth; a private trip is only visible to its owner (spec section 33).
 */
async function getPublicTrip(req, res, next) {
  try {
    const trip = await tripService.getTripForViewing(req.params.id, req.userId || null);
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
}

module.exports = { listPublicTrips, getPublicTrip };