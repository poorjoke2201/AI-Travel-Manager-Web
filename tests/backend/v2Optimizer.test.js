const test = require('node:test');
const assert = require('node:assert/strict');

const { getGeocodeProviderOrder } = require('../../server/src/services/maps/geocoding.service');
const { optimizeItineraryForTrip, scorePoiForV2Detailed } = require('../../server/src/services/engine/v2Optimizer.service');
const { computeTransitionScore } = require('../../server/src/services/engine/transitionModel.service');

test('geocode provider order prefers Geoapify before LocationIQ', () => {
  assert.deepEqual(getGeocodeProviderOrder(), ['geoapify', 'locationiq', 'cityFallback']);
});

test('transition model prefers realistic category progressions and no self loops', () => {
  assert.ok(computeTransitionScore('heritage', 'cafe') > computeTransitionScore('heritage', 'heritage'));
  assert.ok(computeTransitionScore('restaurant', 'cafe') > 0.1);
  assert.equal(computeTransitionScore('heritage', 'heritage'), 0);
});

test('v2 optimizer exposes a breakdown with a valid score', () => {
  const poi = { category: 'heritage', tags: ['fort', 'heritage'], popularityScore: 0.8 };
  const result = scorePoiForV2Detailed(poi, { placePreferences: ['heritage'] }, 12 * 60);
  assert.ok(result.score >= 0);
  assert.ok(result.score <= 1);
  assert.ok(result.breakdown.preference >= 0);
  assert.ok(result.breakdown.timeFit >= 0);
});

test('v2 optimizer creates a valid multi-day itinerary with meal stops', async () => {
  const trip = {
    destination: 'Mysore',
    origin: 'Bengaluru',
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-03'),
    numberOfDays: 3,
    budget: 20000,
    travelStyle: 'moderate',
    pace: 'balanced',
    placePreferences: ['heritage', 'nature'],
    foodPreferences: ['south indian'],
    accommodationPreference: 'hotel',
    selectedTransportMode: 'train',
    selectedHotelId: 'hotel-1',
    destinationLocation: { lat: 12.2958, lng: 76.6394 },
  };

  const pois = [
    { id: 'p1', name: 'Mysore Palace', category: 'heritage', tags: ['palace', 'heritage'], latitude: 12.305, longitude: 76.655, bestTimeToVisit: 'Morning', visitDurationHrs: 2 },
    { id: 'p2', name: 'Chamundi Hill', category: 'nature', tags: ['viewpoint', 'hill'], latitude: 12.274, longitude: 76.677, bestTimeToVisit: 'Sunrise', visitDurationHrs: 2 },
    { id: 'p3', name: 'St. Philomena Church', category: 'heritage', tags: ['church', 'heritage'], latitude: 12.308, longitude: 76.688, bestTimeToVisit: 'Morning', visitDurationHrs: 1.5 },
  ];

  const hotels = [{ id: 'hotel-1', name: 'Grand Hotel', latitude: 12.2958, longitude: 76.6394 }];
  const restaurants = [
    { id: 'r1', name: 'Local Tiffin', cuisine: ['south indian'], latitude: 12.296, longitude: 76.64, openingTime: '08:00', closingTime: '22:00' },
    { id: 'r2', name: 'Heritage Cafe', cuisine: ['coffee'], latitude: 12.301, longitude: 76.648, openingTime: '09:00', closingTime: '22:00' },
  ];

  const days = await optimizeItineraryForTrip(trip, { pois, hotels, restaurants });

  assert.equal(days.length, 3);
  const placeKeys = days.flatMap((day) => day.activities)
    .filter((activity) => ['poi', 'restaurant'].includes(activity.type))
    .map((activity) => activity.name.toLowerCase());
  assert.equal(new Set(placeKeys).size, placeKeys.length);
  assert.ok(days[0].activities.some((activity) => activity.type === 'poi'));
  assert.ok(days.flatMap((day) => day.activities).some((activity) => activity.type === 'restaurant'));
  days.forEach((day) => {
    const starts = day.activities.map((activity) => {
      const [hours, minutes] = activity.startTime.split(':').map(Number);
      return hours * 60 + minutes;
    });
    assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
    day.activities.slice(0, -1).forEach((activity, index) => {
      const [hours, minutes] = activity.startTime.split(':').map(Number);
      const end = (hours * 60) + minutes + activity.duration;
      assert.ok(end <= starts[index + 1], `${activity.name} overlaps the next activity`);
    });
  });
});
