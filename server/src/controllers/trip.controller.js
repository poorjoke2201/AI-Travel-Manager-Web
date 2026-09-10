const tripService = require('../services/trip/trip.service');
const { generateTrip } = require('../services/trip/tripGeneration.service');
const { discoverTripOptions } = require('../services/trip/tripDiscovery.service');

async function discoverOptions(req, res, next) {
  try {
    const options = await discoverTripOptions(req.body);
    res.status(200).json({ success: true, data: options });
  } catch (err) {
    next(err);
  }
}

/** POST /api/trips - creates a draft trip (basic info + preferences only, no AI yet). */
async function createTrip(req, res, next) {
  try {
    const trip = await tripService.createDraftTrip(req.userId, req.body);
    res.status(201).json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/trips/generate - creates the draft AND immediately runs the full
 * generation pipeline (spec section 13). Kept as one call for the "Create
 * Trip" form's primary flow; POST /api/trips alone remains available for a
 * save-as-draft-without-generating path if the frontend wants it later.
 */
async function createAndGenerateTrip(req, res, next) {
  try {
    const trip = await tripService.createDraftTrip(req.userId, req.body);
    const generated = await generateTrip(trip._id, req.userId);
    res.status(201).json({ success: true, data: generated });
  } catch (err) {
    next(err);
  }
}

/** POST /api/trips/:id/generate - (re)runs generation on an existing draft/failed trip. */
async function regenerateTrip(req, res, next) {
  try {
    const trip = await generateTrip(req.params.id, req.userId);
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
}

async function listTrips(req, res, next) {
  try {
    const trips = await tripService.listUserTrips(req.userId);
    res.status(200).json({ success: true, data: trips });
  } catch (err) {
    next(err);
  }
}

async function getTrip(req, res, next) {
  try {
    const trip = await tripService.getTripById(req.params.id, req.userId);
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
}

async function updateTrip(req, res, next) {
  try {
    const trip = await tripService.updateTrip(req.params.id, req.userId, req.body);
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
}

async function deleteTrip(req, res, next) {
  try {
    await tripService.deleteTrip(req.params.id, req.userId);
    res.status(200).json({ success: true, message: 'Trip deleted.' });
  } catch (err) {
    next(err);
  }
}

async function replaceItineraryActivity(req, res, next) {
  try {
    const trip = await tripService.replaceItineraryActivity(
      req.params.id,
      req.userId,
      req.params.day,
      req.params.activity,
      req.body.strategy
    );
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createTrip,
  discoverOptions,
  createAndGenerateTrip,
  regenerateTrip,
  listTrips,
  getTrip,
  updateTrip,
  deleteTrip,
  replaceItineraryActivity,
};