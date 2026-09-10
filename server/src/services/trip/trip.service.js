const Trip = require('../../models/Trip');
const ApiError = require('../../utils/apiError');
const { recommendPOIs } = require('./../recommendation/poiRecommendation.service');
const { recommendRestaurants } = require('./../recommendation/restaurantRecommendation.service');
const { recommendHotels } = require('./../recommendation/hotelRecommendation.service');
const { haversineDistanceKm } = require('../../utils/haversine');
const { planItineraryRoutes } = require('../itinerary/routePlanner.service');

/** Computes numberOfDays from startDate/endDate so the two can never drift apart (spec section 8). */
function computeNumberOfDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1; // inclusive of both start and end day
}

async function createDraftTrip(userId, payload) {
  const numberOfDays = computeNumberOfDays(payload.startDate, payload.endDate);
  return Trip.create({ ...payload, userId, numberOfDays, status: 'draft' });
}

async function listUserTrips(userId) {
  return Trip.find({ userId }).sort({ createdAt: -1 }).lean();
}

async function getTripById(tripId, userId) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw ApiError.notFound('Trip not found.');
  assertOwnership(trip, userId);
  return trip;
}

/** Loose variant for endpoints (public trip view) where any authenticated user may read a public trip. */
async function getTripForViewing(tripId, userId) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw ApiError.notFound('Trip not found.');
  if (!trip.isPublic && String(trip.userId) !== String(userId)) {
    throw ApiError.forbidden('This trip is private.');
  }
  return trip;
}

async function updateTrip(tripId, userId, updates) {
  const trip = await getTripById(tripId, userId);

  if (updates.startDate || updates.endDate) {
    const startDate = updates.startDate || trip.startDate;
    const endDate = updates.endDate || trip.endDate;
    updates.numberOfDays = computeNumberOfDays(startDate, endDate);
  }

  Object.assign(trip, updates);
  await trip.save();
  return trip;
}

async function deleteTrip(tripId, userId) {
  const trip = await getTripById(tripId, userId);
  await trip.deleteOne();
}

async function replaceItineraryActivity(tripId, userId, dayNumber, activityIndex, strategy = 'nearby') {
  const trip = await getTripById(tripId, userId);
  const day = trip.itinerary.find((item) => item.day === Number(dayNumber));
  const current = day?.activities?.[Number(activityIndex)];
  if (!day || !current || !['poi', 'restaurant', 'hotel'].includes(current.type)) {
    throw ApiError.badRequest('That itinerary activity cannot be replaced.');
  }

  const destinationCoords = trip.destinationLocation?.lat
    ? trip.destinationLocation
    : null;
  const candidates = current.type === 'poi'
    ? await recommendPOIs(trip, destinationCoords)
    : current.type === 'restaurant'
      ? await recommendRestaurants(trip)
      : await recommendHotels(trip);
  const currentPoint = current.location?.lat != null ? current.location : null;
  const alternatives = candidates.filter((candidate) => candidate.name !== current.name);
  alternatives.sort((a, b) => {
    if (!currentPoint) return 0;
    const distanceA = a.latitude == null ? Infinity : haversineDistanceKm(currentPoint, { lat: a.latitude, lng: a.longitude });
    const distanceB = b.latitude == null ? Infinity : haversineDistanceKm(currentPoint, { lat: b.latitude, lng: b.longitude });
    return strategy === 'farther' ? distanceB - distanceA : distanceA - distanceB;
  });

  const replacement = alternatives[0];
  if (!replacement) throw ApiError.notFound('No similar place is available for replacement.');

  current.name = replacement.name;
  current.refId = replacement.source === 'dataset' ? replacement.id : null;
  current.source = replacement.source || 'dataset';
  current.location = { lat: replacement.latitude ?? null, lng: replacement.longitude ?? null };
  current.notes = strategy === 'farther' ? 'Replaced with a farther alternative.' : 'Replaced with a nearby alternative.';
  await planItineraryRoutes(trip.itinerary);
  await trip.save();
  return trip;
}

async function listPublicTrips({ limit = 20, skip = 0 } = {}) {
  return Trip.find({ isPublic: true })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'username avatar')
    .lean();
}

/**
 * A user must never be able to read/modify another user's private trip by
 * ID-guessing (spec section 42) - this is the single choke point for that
 * check across update/delete/get.
 */
function assertOwnership(trip, userId) {
  if (String(trip.userId) !== String(userId)) {
    throw ApiError.forbidden('You do not have access to this trip.');
  }
}

module.exports = {
  computeNumberOfDays,
  createDraftTrip,
  listUserTrips,
  getTripById,
  getTripForViewing,
  updateTrip,
  deleteTrip,
  replaceItineraryActivity,
  listPublicTrips,
};