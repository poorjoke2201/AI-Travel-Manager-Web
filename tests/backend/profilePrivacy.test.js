const test = require('node:test');
const assert = require('node:assert/strict');
const profileService = require('../../server/src/services/profile/profile.service');
const profileController = require('../../server/src/controllers/profile.controller');
const profileRouter = require('../../server/src/routes/profile.routes');

test('profile GET resolves only the authenticated user and includes their private phone', async () => {
  const originalGetProfile = profileService.getProfile;
  let requestedUserId = null;
  let responseBody = null;
  profileService.getProfile = async (userId) => {
    requestedUserId = userId;
    return { phoneNumber: '+919876543210' };
  };
  try {
    await profileController.getProfile({
      userId: 'authenticated-user',
      params: { userId: 'different-user' },
      query: { userId: 'query-user' },
    }, {
      json(body) { responseBody = body; },
    }, (error) => {
      throw error;
    });
  } finally {
    profileService.getProfile = originalGetProfile;
  }
  assert.equal(requestedUserId, 'authenticated-user');
  assert.equal(responseBody.data.phoneNumber, '+919876543210');
});

test('profile API has no public or user-id-selectable profile route', () => {
  const paths = profileRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);
  assert.ok(paths.includes('/'));
  assert.ok(paths.includes('/summary'));
  assert.ok(paths.every((routePath) => !routePath.includes(':')));
});
