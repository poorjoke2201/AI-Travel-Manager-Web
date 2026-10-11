const test = require('node:test');
const assert = require('node:assert/strict');
const ActivityLog = require('../../server/src/models/ActivityLog');
const Trip = require('../../server/src/models/Trip');
const activityService = require('../../server/src/services/activity/activity.service');
const { threeDViewSchema } = require('../../server/src/validators/activity.validator');

test('activity model retains structured data and expires records after about 90 days', () => {
  const indexes = ActivityLog.schema.indexes();
  const ttlIndex = indexes.find(([keys, options]) => keys.createdAt === 1 && options.expireAfterSeconds);
  assert.equal(ttlIndex[1].expireAfterSeconds, 90 * 24 * 60 * 60);
  assert.equal(ActivityLog.schema.path('meta').instance, 'Mixed');
  assert.equal(threeDViewSchema.safeParse({ placeName: 'Palace', city: 'Mysuru' }).success, true);
  assert.equal(threeDViewSchema.safeParse({ placeName: '' }).success, false);
});

test('3D view logging records structured place metadata and a per-hour dedupe key', async () => {
  const originalFindOne = ActivityLog.findOne;
  const originalSave = ActivityLog.prototype.save;
  let saved = null;
  ActivityLog.findOne = () => ({ select() { return this; }, lean: async () => null });
  ActivityLog.prototype.save = async function save() {
    saved = this.toObject();
    return this;
  };
  try {
    const result = await activityService.logThreeDView('507f1f77bcf86cd799439011', {
      placeName: 'Mysore Palace',
      city: 'Mysuru',
    });
    assert.equal(result.logged, true);
  } finally {
    ActivityLog.findOne = originalFindOne;
    ActivityLog.prototype.save = originalSave;
  }
  assert.equal(saved.type, '3d_view_opened');
  assert.equal(saved.meta.placeName, 'Mysore Palace');
  assert.equal(saved.meta.placeKey, 'name:mysore palace|city:mysuru');
  assert.match(saved.dedupeKey, /^3d-view:/);
});

test('3D view throttle skips the same place opened within the last hour', async () => {
  const originalFindOne = ActivityLog.findOne;
  let query = null;
  ActivityLog.findOne = (filter) => {
    query = filter;
    return { select() { return this; }, lean: async () => ({ _id: 'existing' }) };
  };
  try {
    const result = await activityService.logThreeDView('user-id', { placeName: 'Museum', city: 'City' });
    assert.deepEqual(result, { logged: false });
  } finally {
    ActivityLog.findOne = originalFindOne;
  }
  assert.equal(query.type, '3d_view_opened');
  assert.equal(query['meta.placeKey'], 'name:museum|city:city');
  assert.ok(query.createdAt.$gte instanceof Date);
});

test('activity backfill creates only trip-created records from each trip creation date', async () => {
  const originalTripFind = Trip.find;
  const originalActivityUpdateOne = ActivityLog.updateOne;
  const createdAt = new Date('2026-10-01T00:00:00.000Z');
  const captured = [];
  Trip.find = () => ({
    select() {
      return { lean: async () => [{ _id: 'trip-id', tripName: 'A trip', destination: 'A city', createdAt }] };
    },
  });
  ActivityLog.updateOne = async (...args) => { captured.push(args); };
  try {
    await activityService.backfillTripCreated('user-id');
  } finally {
    Trip.find = originalTripFind;
    ActivityLog.updateOne = originalActivityUpdateOne;
  }
  assert.equal(captured.length, 1);
  assert.equal(captured[0][1].$setOnInsert.type, 'trip_created');
  assert.equal(captured[0][1].$setOnInsert.createdAt, createdAt);
  assert.equal(captured[0][1].$setOnInsert.tripId, 'trip-id');
});
