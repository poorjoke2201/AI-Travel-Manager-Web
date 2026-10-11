const tripService = require('../services/trip/trip.service');
const { generateTrip } = require('../services/trip/tripGeneration.service');
const { discoverTripOptions } = require('../services/trip/tripDiscovery.service');
const { enrichItineraryImages } = require('../services/trip/itineraryImageEnrichment.service');

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

async function listPendingInvites(req, res, next) {
  try {
    const trips = await tripService.listPendingInvitesForUser(req.userId);
    const invitations = trips.map(serializePendingInvite);
    res.status(200).json({ success: true, data: invitations });
  } catch (err) {
    next(err);
  }
}

function serializePendingInvite(trip) {
  return {
    _id: trip._id,
    tripName: trip.tripName,
    origin: trip.origin,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    createdAt: trip.createdAt,
  };
}

async function getTrip(req, res, next) {
  try {
    const trip = await tripService.getTripById(req.params.id, req.userId);
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
}

async function getTripCoverImage(req, res, next) {
  try {
    const imageUrl = await tripService.ensureTripCoverImage(req.params.id, req.userId);
    res.status(200).json({ success: true, data: { coverImageUrl: imageUrl } });
  } catch (err) {
    next(err);
  }
}

async function enrichTripImages(req, res, next) {
  try {
    const trip = await tripService.getTripById(req.params.id, req.userId);
    if (trip.itineraryContentVersion < 2) {
      await enrichItineraryImages(trip.itinerary, trip.destination);
      trip.itineraryImagesEnrichedAt = new Date();
      trip.itineraryContentEnrichedAt = new Date();
      trip.itineraryContentVersion = 4;
      await trip.save();
    }
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

async function acceptTripInvite(req, res, next) {
  try {
    const trip = await tripService.acceptTripInvite(req.params.id, req.userId);
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
  listPendingInvites,
  serializePendingInvite,
  getTrip,
  getTripCoverImage,
  enrichTripImages,
  updateTrip,
  deleteTrip,
  replaceItineraryActivity,
  acceptTripInvite,
};