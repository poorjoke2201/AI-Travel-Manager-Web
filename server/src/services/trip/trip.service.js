const Trip = require('../../models/Trip');
const receiptStorage = require('../expenses/receiptStorage.service');
const User = require('../../models/User');
const ApiError = require('../../utils/apiError');
const { recommendPOIs } = require('./../recommendation/poiRecommendation.service');
const { recommendRestaurants } = require('./../recommendation/restaurantRecommendation.service');
const { recommendHotels } = require('./../recommendation/hotelRecommendation.service');
const { haversineDistanceKm } = require('../../utils/haversine');
const { planItineraryRoutes } = require('../itinerary/routePlanner.service');
const { canonicalizeCityName } = require('../destination/destinationResolver.service');
const { resolveDestinationLeadImage } = require('./itineraryImageEnrichment.service');
const activityService = require('../activity/activity.service');

function normalizePhoneNumber(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^\d+]/g, '');
  if (!cleaned || (cleaned.length < 8 && !cleaned.startsWith('+'))) return null;
  return cleaned.startsWith('+') ? `+${cleaned.replace(/\+/g, '')}` : cleaned;
}

function normalizeGroupTripMembers(members = []) {
  const normalized = [];
  const seen = new Set();

  for (const member of members) {
    if (!member) continue;

    if (typeof member === 'string') {
      const phoneNumber = normalizePhoneNumber(member);
      if (!phoneNumber || seen.has(`phone:${phoneNumber}`)) continue;
      seen.add(`phone:${phoneNumber}`);
      normalized.push({ phoneNumber, name: null, role: 'member', status: 'pending' });
      continue;
    }

    if (member.userId) {
      const userId = String(member.userId);
      if (seen.has(`user:${userId}`)) continue;
      seen.add(`user:${userId}`);
      normalized.push({
        userId,
        name: member.name ?? null,
        email: member.email ?? null,
        phoneNumber: member.phoneNumber ?? null,
        role: member.role || 'member',
        status: member.status || 'accepted',
        joinedAt: member.joinedAt ?? null,
      });
      continue;
    }

    const phoneNumber = normalizePhoneNumber(member.phoneNumber);
    if (phoneNumber) {
      if (seen.has(`phone:${phoneNumber}`)) continue;
      seen.add(`phone:${phoneNumber}`);
      normalized.push({
        phoneNumber,
        name: member.name ?? null,
        email: member.email ?? null,
        role: member.role || 'member',
        status: member.status || 'pending',
        joinedAt: member.joinedAt ?? null,
      });
      continue;
    }

    const name = typeof member.name === 'string' ? member.name.trim() : '';
    const nameKey = name.toLowerCase();
    if (!name || seen.has(`name:${nameKey}`)) continue;
    seen.add(`name:${nameKey}`);
    normalized.push({
      name,
      email: member.email ?? null,
      role: member.role || 'member',
      status: 'accepted',
      joinedAt: member.joinedAt ?? null,
    });
  }

  return normalized;
}

function computeNumberOfDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

async function createDraftTrip(userId, payload) {
  const numberOfDays = computeNumberOfDays(payload.startDate, payload.endDate);
  const groupMembers = normalizeGroupTripMembers(payload.groupMembers || []);
  const totalTravelers = Number(payload.travellers?.adults || 0) + Number(payload.travellers?.children || 0);
  const isGroupTrip = Boolean(payload.isGroupTrip || groupMembers.length || totalTravelers > 1);
  const destination = canonicalizeCityName(payload.destination);

  const trip = await Trip.create({
    ...payload,
    destination,
    userId,
    numberOfDays,
    status: 'draft',
    isGroupTrip,
    groupMembers,
  });
  await activityService.recordBestEffort(userId, 'trip_created', {
    tripId: trip._id,
    meta: {
      tripName: trip.tripName,
      destination: trip.destination,
    },
    createdAt: trip.createdAt,
    dedupeKey: `trip-created:${trip._id}`,
  });
  return trip;
}

async function listUserTrips(userId) {
  const currentUser = await User.findById(userId).lean();
  const phoneNumber = currentUser?.phoneNumber ? normalizePhoneNumber(currentUser.phoneNumber) : null;

  return Trip.find({
    $or: [
      { userId },
      { 'groupMembers.userId': userId },
      ...(phoneNumber ? [{ 'groupMembers.phoneNumber': phoneNumber, 'groupMembers.status': 'accepted' }] : []),
    ],
  }).sort({ createdAt: -1 }).lean();
}

async function getTripById(tripId, userId) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw ApiError.notFound('Trip not found.');
  await assertOwnership(trip, userId);
  return trip;
}

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

  if (updates.destination && updates.destination !== trip.destination) {
    trip.coverImageUrl = null;
    trip.coverImageResolvedAt = null;
  }
  if (updates.startDate || updates.endDate) {
    const startDate = updates.startDate || trip.startDate;
    const endDate = updates.endDate || trip.endDate;
    updates.numberOfDays = computeNumberOfDays(startDate, endDate);
  }

  Object.assign(trip, updates);
  await trip.save();
  return trip;
}

async function ensureTripCoverImage(tripId, userId) {
  const trip = await getTripById(tripId, userId);
  if (trip.coverImageUrl || trip.coverImageResolvedAt) return trip.coverImageUrl;

  trip.coverImageUrl = await resolveDestinationLeadImage(trip.destination);
  trip.coverImageResolvedAt = new Date();
  await trip.save();
  return trip.coverImageUrl;
}

async function deleteTrip(tripId, userId) {
  const trip = await getTripById(tripId, userId);
  await receiptStorage.deleteTripReceipts(trip._id);
  await trip.deleteOne();
}

async function replaceItineraryActivity(tripId, userId, dayNumber, activityIndex, strategy = 'nearby') {
  const trip = await getTripById(tripId, userId);
  const day = trip.itinerary.find((item) => item.day === Number(dayNumber));
  const current = day?.activities?.[Number(activityIndex)];
  if (!day || !current || !['poi', 'restaurant', 'hotel'].includes(current.type)) {
    throw ApiError.badRequest('That itinerary activity cannot be replaced.');
  }

  const destinationCoords = trip.destinationLocation?.lat ? trip.destinationLocation : null;
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

  const previousPlaceName = current.name;
  current.name = replacement.name;
  current.refId = replacement.source === 'dataset' ? replacement.id : null;
  current.source = replacement.source || 'dataset';
  current.category = replacement.category || replacement.poiType || current.type;
  current.poiType = replacement.poiType || null;
  current.significance = replacement.significance || null;
  current.characteristics = replacement.characteristics || null;
  current.tags = replacement.tags || [];
  current.description = replacement.description || null;
  current.imageUrl = replacement.imageUrl || null;
  current.location = { lat: replacement.latitude ?? null, lng: replacement.longitude ?? null };
  current.notes = strategy === 'farther' ? 'Replaced with a farther alternative.' : 'Replaced with a nearby alternative.';
  trip.itineraryImagesEnrichedAt = null;
  trip.itineraryContentEnrichedAt = null;
  trip.itineraryContentVersion = 0;
  await planItineraryRoutes(trip.itinerary);
  await trip.save();
  await activityService.recordBestEffort(userId, 'place_replaced', {
    tripId: trip._id,
    meta: {
      tripName: trip.tripName,
      previousPlaceName,
      placeName: replacement.name,
    },
  });
  return trip;
}

async function acceptTripInvite(tripId, userId) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw ApiError.notFound('Trip not found.');

  const currentUser = await User.findById(userId);
  if (!currentUser) throw ApiError.unauthorized('User for this invite no longer exists.');

  const currentPhone = normalizePhoneNumber(currentUser.phoneNumber);
  if (!currentPhone) throw ApiError.badRequest('Your account must have a verified phone number to accept an invite.');

  const memberIndex = trip.groupMembers?.findIndex((member) => {
    const sameUser = String(member.userId) === String(userId);
    const samePhone = Boolean(member.phoneNumber) && normalizePhoneNumber(member.phoneNumber) === currentPhone;
    return sameUser || samePhone;
  });

  if (memberIndex === -1) {
    throw ApiError.notFound('This trip does not include your account as an invitee.');
  }

  const priorStatus = trip.groupMembers[memberIndex].status;
  if (!['pending', 'invited', 'accepted'].includes(priorStatus)) {
    throw ApiError.badRequest('This invite cannot be accepted in its current state.');
  }

  trip.groupMembers[memberIndex].userId = currentUser._id;
  trip.groupMembers[memberIndex].name = currentUser.name || currentUser.username;
  trip.groupMembers[memberIndex].email = currentUser.email || trip.groupMembers[memberIndex].email;
  trip.groupMembers[memberIndex].status = 'accepted';
  trip.groupMembers[memberIndex].joinedAt = new Date();

  if (!trip.isGroupTrip) trip.isGroupTrip = true;
  await trip.save();
  return trip;
}

async function listPendingInvitesForUser(userId) {
  const currentUser = await User.findById(userId).lean();
  if (!currentUser?.phoneNumber) return [];

  const phoneNumber = normalizePhoneNumber(currentUser.phoneNumber);
  if (!phoneNumber) return [];

  return Trip.find({
    'groupMembers.phoneNumber': phoneNumber,
    'groupMembers.status': { $in: ['pending', 'invited'] },
    userId: { $ne: userId },
  }).sort({ createdAt: -1 }).lean();
}

async function listPublicTrips({ limit = 20, skip = 0 } = {}) {
  return Trip.find({ isPublic: true })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'username avatar')
    .lean();
}

async function assertOwnership(trip, userId) {
  if (String(trip.userId) === String(userId)) return;

  const currentUser = await User.findById(userId).lean();
  const currentPhone = currentUser?.phoneNumber ? normalizePhoneNumber(currentUser.phoneNumber) : null;
  const isGroupMember = trip.groupMembers?.some((member) => {
    const sameUser = String(member.userId) === String(userId);
    const samePhone = Boolean(currentPhone)
      && member.phoneNumber
      && normalizePhoneNumber(member.phoneNumber) === currentPhone;
    return (sameUser || samePhone) && member.status === 'accepted';
  });

  if (!isGroupMember) {
    throw ApiError.forbidden('You do not have access to this trip.');
  }
}

module.exports = {
  computeNumberOfDays,
  normalizePhoneNumber,
  normalizeGroupTripMembers,
  createDraftTrip,
  listUserTrips,
  getTripById,
  getTripForViewing,
  updateTrip,
  ensureTripCoverImage,
  deleteTrip,
  replaceItineraryActivity,
  acceptTripInvite,
  listPendingInvitesForUser,
  listPublicTrips,
};
