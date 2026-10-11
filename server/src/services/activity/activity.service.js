const { createHash } = require('node:crypto');
const ActivityLog = require('../../models/ActivityLog');
const Trip = require('../../models/Trip');
const logger = require('../../utils/logger');

const ACTIVITY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function normalizePlacePart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function placeKey(placeName, city, placeRefId) {
  const reference = String(placeRefId || '').trim();
  if (reference) return `ref:${reference}`;
  return `name:${normalizePlacePart(placeName)}|city:${normalizePlacePart(city)}`;
}

async function logActivity(userId, type, { tripId = null, meta = {}, createdAt, dedupeKey = null } = {}) {
  const record = new ActivityLog({
    userId,
    type,
    tripId,
    meta,
    ...(createdAt ? { createdAt } : {}),
    ...(dedupeKey ? { dedupeKey } : {}),
  });
  await record.save();
  return record;
}

async function recordBestEffort(userId, type, options) {
  try {
    return await logActivity(userId, type, options);
  } catch (error) {
    logger.warn(`Could not record ${type} activity for user ${userId}`, error);
    return null;
  }
}

async function logThreeDView(userId, { placeName, city = '', placeRefId = null }) {
  const normalizedKey = placeKey(placeName, city, placeRefId);
  if (normalizedKey === 'name:|city:') throw new Error('A place name or reference is required for a 3D activity.');

  const now = new Date();
  const cutoff = new Date(now.getTime() - ONE_HOUR_MS);
  const recent = await ActivityLog.findOne({
    userId,
    type: '3d_view_opened',
    'meta.placeKey': normalizedKey,
    createdAt: { $gte: cutoff },
  }).select('_id').lean();
  if (recent) return { logged: false };

  const hash = createHash('sha256').update(normalizedKey).digest('hex');
  const hourBucket = Math.floor(now.getTime() / ONE_HOUR_MS);
  try {
    await logActivity(userId, '3d_view_opened', {
      meta: {
        placeName: String(placeName).trim().slice(0, 120),
        city: String(city || '').trim().slice(0, 100),
        placeKey: normalizedKey,
      },
      createdAt: now,
      dedupeKey: `3d-view:${userId}:${hash}:${hourBucket}`,
    });
    return { logged: true };
  } catch (error) {
    if (error.code === 11000) return { logged: false };
    throw error;
  }
}

async function backfillTripCreated(userId) {
  const createdAfter = new Date(Date.now() - ACTIVITY_RETENTION_MS);
  const trips = await Trip.find({ userId, createdAt: { $gte: createdAfter } })
    .select('_id tripName destination createdAt')
    .lean();

  for (const trip of trips) {
    const dedupeKey = `trip-created:${trip._id}`;
    try {
      await ActivityLog.updateOne(
        { dedupeKey },
        {
          $setOnInsert: {
            userId,
            type: 'trip_created',
            tripId: trip._id,
            meta: {
              tripName: String(trip.tripName || '').slice(0, 100),
              destination: String(trip.destination || '').slice(0, 100),
            },
            createdAt: trip.createdAt,
            dedupeKey,
          },
        },
        { upsert: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
}

async function listRecentActivities(userId) {
  await backfillTripCreated(userId);
  return ActivityLog.find({ userId }).sort({ createdAt: -1 }).limit(5).lean();
}

module.exports = {
  ACTIVITY_RETENTION_MS,
  normalizePlacePart,
  placeKey,
  logActivity,
  recordBestEffort,
  logThreeDView,
  backfillTripCreated,
  listRecentActivities,
};
