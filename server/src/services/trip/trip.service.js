const Trip = require('../../models/Trip');
const ApiError = require('../../utils/apiError');

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
  listPublicTrips,
};