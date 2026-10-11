const test = require('node:test');
const assert = require('node:assert/strict');
const tripController = require('../../server/src/controllers/trip.controller');
const tripService = require('../../server/src/services/trip/trip.service');
const tripRouter = require('../../server/src/routes/trip.routes');

test('trip cover endpoint resolves images for the authenticated trip user', async () => {
  const originalEnsure = tripService.ensureTripCoverImage;
  let requested = null;
  let responseBody = null;
  let responseStatus = null;
  tripService.ensureTripCoverImage = async (tripId, userId) => {
    requested = { tripId, userId };
    return 'https://upload.wikimedia.org/example.webp';
  };
  try {
    await tripController.getTripCoverImage({
      params: { id: 'trip-id' },
      userId: 'owner-id',
    }, {
      status(status) {
        responseStatus = status;
        return this;
      },
      json(body) { responseBody = body; },
    }, (error) => { throw error; });
  } finally {
    tripService.ensureTripCoverImage = originalEnsure;
  }

  assert.deepEqual(requested, { tripId: 'trip-id', userId: 'owner-id' });
  assert.equal(responseStatus, 200);
  assert.equal(responseBody.data.coverImageUrl, 'https://upload.wikimedia.org/example.webp');
});

test('trip cover image endpoint is registered behind authenticated trip access', () => {
  const coverRoute = tripRouter.stack.find((layer) => layer.route?.path === '/:id/cover-image');
  assert.ok(coverRoute);
  assert.equal(coverRoute.route.methods.get, true);
  assert.equal(coverRoute.route.stack.length >= 3, true);
});
