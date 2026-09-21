const test = require('node:test');
const assert = require('node:assert/strict');
const features = require('../../server/src/config/features');

test('feature flags default to development-safe enabled state', () => {
  assert.equal(features.FEATURE_CATEGORY_PINS, true);
  assert.equal(features.FEATURE_SPLIT_VIEW, true);
  assert.equal(features.FEATURE_GROUP_TRIPS, true);
});
