const test = require('node:test');
const assert = require('node:assert/strict');
const options = require('../../shared/travelPreferences.json');
const categories = require('../../server/src/constants/categories');
const trip = require('../../server/src/constants/trip');
const transport = require('../../server/src/constants/transport');

test('server trip validators and Create Trip option data use the shared preference lists', () => {
  assert.deepEqual(categories.PLACE_INTERESTS, options.placeInterests);
  assert.deepEqual(categories.FOOD_PREFERENCES, options.foodPreferences);
  assert.deepEqual(trip.TRAVEL_STYLES, options.travelStyles.map(({ value }) => value));
  assert.deepEqual(trip.TRIP_TYPES, options.tripTypes.map(({ value }) => value));
  assert.deepEqual(trip.PACE_OPTIONS, options.paceOptions.map(({ value }) => value));
  assert.deepEqual(trip.ACCOMMODATION_PREFERENCES, options.accommodationPreferences.map(({ value }) => value));
  assert.deepEqual(transport.TRANSPORT_MODES, options.transportModes.map(({ value }) => value));
});
