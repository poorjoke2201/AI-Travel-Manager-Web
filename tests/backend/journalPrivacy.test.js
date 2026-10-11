const test = require('node:test');
const assert = require('node:assert/strict');
const journalController = require('../../server/src/controllers/journal.controller');
const journalService = require('../../server/src/services/journal/journal.service');
const journalRouter = require('../../server/src/routes/journal.routes');

test('journal list uses only the authenticated user id', async () => {
  const originalList = journalService.listEntries;
  let requestedUserId = null;
  let body = null;
  journalService.listEntries = async (userId) => {
    requestedUserId = userId;
    return [];
  };
  try {
    await journalController.listEntries({
      userId: 'owner-id',
      params: { userId: 'another-user' },
      query: { userId: 'query-user' },
    }, {
      json(value) { body = value; },
    }, (error) => { throw error; });
  } finally {
    journalService.listEntries = originalList;
  }
  assert.equal(requestedUserId, 'owner-id');
  assert.deepEqual(body.data, []);
});

test('journal API is authenticated and exposes no user-selectable route', () => {
  const hasAuthMiddleware = journalRouter.stack.some((layer) => layer.name === 'requireAuth');
  assert.equal(hasAuthMiddleware, true);
  const routePaths = journalRouter.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
  assert.ok(routePaths.every((routePath) => !routePath.includes(':userId')));
});
