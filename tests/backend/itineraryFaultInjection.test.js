const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const axios = require(require.resolve('axios', {
  paths: [path.resolve(__dirname, '../../server')],
}));
const Trip = require('../../server/src/models/Trip');
const { generateValidatedJson } = require('../../server/src/services/ai/gemini.service');
const { validateItinerary } = require('../../server/src/services/ai/geminiValidator');
const { buildDeterministicItinerary } = require('../../server/src/services/itinerary/itineraryOptimizer.service');
const { planItineraryRoutes } = require('../../server/src/services/itinerary/routePlanner.service');
const { getWeatherForecast } = require('../../server/src/services/weather/openMeteo.service');
const { geocodeAddress } = require('../../server/src/services/maps/geocoding.service');
const { recommendPOIs } = require('../../server/src/services/recommendation/poiRecommendation.service');
const {
  buildPreTripFallback,
  generateItinerarySection,
  generateTrip,
} = require('../../server/src/services/trip/tripGeneration.service');

function makeTrip(overrides = {}) {
  return {
    _id: 'trip-id',
    destination: 'Mysuru',
    startDate: new Date('2026-11-01T00:00:00.000Z'),
    endDate: new Date('2026-11-01T00:00:00.000Z'),
    numberOfDays: 1,
    pace: 'balanced',
    origin: 'Bengaluru',
    travellers: { adults: 1, children: 0 },
    tripType: 'solo',
    travelStyle: 'moderate',
    budget: null,
    placePreferences: [],
    foodPreferences: [],
    accommodationPreference: 'any',
    dailyTravelToleranceKm: null,
    selectedPlaces: [],
    ...overrides,
  };
}

function validGeminiItinerary() {
  return {
    days: [{
      day: 1,
      date: '2026-11-01',
      activities: [
        { type: 'poi', datasetId: 'poi-1', name: 'Palace', startTime: '11:00', duration: 60, source: 'dataset' },
        { type: 'restaurant', datasetId: 'restaurant-1', name: 'Breakfast', startTime: '12:15', duration: 45, source: 'dataset' },
        { type: 'restaurant', datasetId: 'restaurant-2', name: 'Lunch', startTime: '14:00', duration: 60, source: 'dataset' },
        { type: 'restaurant', datasetId: 'restaurant-3', name: 'Dinner', startTime: '19:00', duration: 60, source: 'dataset' },
      ],
    }],
  };
}

function dateOffset(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function withLegacyItineraryMode(run) {
  const previous = process.env.VALIDATION_ENGINE;
  process.env.VALIDATION_ENGINE = 'legacy';
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.VALIDATION_ENGINE;
    else process.env.VALIDATION_ENGINE = previous;
  }
}

test('valid Gemini itinerary passes validation and maps supplied candidates', async () => {
  const trip = makeTrip();
  const candidates = {
    pois: [{ id: 'poi-1', name: 'Palace', latitude: 12.3, longitude: 76.6, source: 'dataset' }],
    hotels: [],
    restaurants: [
      { id: 'restaurant-1', name: 'Breakfast', latitude: 12.3, longitude: 76.6, source: 'dataset' },
      { id: 'restaurant-2', name: 'Lunch', latitude: 12.31, longitude: 76.61, source: 'dataset' },
      { id: 'restaurant-3', name: 'Dinner', latitude: 12.32, longitude: 76.62, source: 'dataset' },
    ],
  };

  const days = await withLegacyItineraryMode(() => generateItinerarySection(trip, candidates, {
    generateValidatedJsonFn: async (_prompt, validator) => {
      const checked = validator(validGeminiItinerary());
      assert.equal(checked.valid, true, checked.errors.join('; '));
      return { ok: true, data: checked.data, errors: [], provider: 'gemini' };
    },
    geocodeMissingActivityCoordsFn: async () => {},
    planItineraryRoutesFn: async (itineraryDays) => itineraryDays,
  }));

  assert.equal(days.length, 1);
  assert.equal(days[0].activities.find((activity) => activity.name === 'Palace').refId, 'poi-1');
  assert.equal(days[0].activities.filter((activity) => activity.type === 'restaurant').length, 3);
});

test('invalid JSON is retried and valid JSON from the retry is accepted', async () => {
  let attempts = 0;
  const result = await generateValidatedJson('return JSON', (value) => ({
    valid: value.ok === true,
    errors: value.ok === true ? [] : ['ok must be true'],
    data: value,
  }), {
    maxRetries: 1,
    generateJsonFn: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('Gemini returned unparseable JSON.');
      return { ok: true };
    },
  });

  assert.equal(attempts, 2);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { ok: true });
});

test('wrong itinerary day count is rejected by the itinerary validator', () => {
  const result = validateItinerary(validGeminiItinerary(), {
    trip: makeTrip({ numberOfDays: 2, endDate: new Date('2026-11-02T00:00:00.000Z') }),
    candidateIds: new Set(['poi-1', 'restaurant-1', 'restaurant-2', 'restaurant-3']),
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error === 'Expected 2 days, got 1'));
});

test('Gemini failure produces a deterministic itinerary from available candidates', async () => {
  const days = await withLegacyItineraryMode(() => generateItinerarySection(makeTrip(), {
    pois: [{ id: 'poi-1', name: 'Palace', latitude: 12.3, longitude: 76.6, source: 'dataset' }],
    hotels: [],
    restaurants: [],
  }, {
    generateValidatedJsonFn: async () => ({ ok: false, data: null, errors: ['Gemini unavailable'] }),
    geocodeMissingActivityCoordsFn: async () => {},
    planItineraryRoutesFn: async (itineraryDays) => itineraryDays,
  }));

  assert.equal(days.length, 1);
  assert.ok(days[0].activities.some((activity) => activity.name === 'Palace'));
  assert.equal(days[0].weatherContext, null);
});

test('geocoding tries Geoapify, then LocationIQ, then the supported-city fallback', async () => {
  const calls = [];
  const liveResult = await geocodeAddress('Mysuru, India', {
    geoapifyGeocodeFn: async () => {
      calls.push('geoapify');
      return null;
    },
    locationIqGeocodeFn: async () => {
      calls.push('locationiq');
      return { lat: 12.31, lng: 76.64 };
    },
  });
  assert.deepEqual(calls, ['geoapify', 'locationiq']);
  assert.deepEqual(liveResult, { lat: 12.31, lng: 76.64 });

  calls.length = 0;
  const fallbackResult = await geocodeAddress('Mysuru, India', {
    geoapifyGeocodeFn: async () => {
      calls.push('geoapify');
      return null;
    },
    locationIqGeocodeFn: async () => {
      calls.push('locationiq');
      return null;
    },
  });
  assert.deepEqual(calls, ['geoapify', 'locationiq']);
  assert.deepEqual(fallbackResult, { lat: 12.2958, lng: 76.6394 });
});

test('routing failure uses Haversine distance and marks the travel leg as estimated', async () => {
  const days = await planItineraryRoutes([{
    day: 2,
    date: '2026-11-02',
    activities: [
      { type: 'poi', name: 'First', startTime: '09:00', duration: 30, location: { lat: 12.3, lng: 76.6 } },
      { type: 'poi', name: 'Second', startTime: '10:00', duration: 30, location: { lat: 12.31, lng: 76.61 } },
    ],
  }], {
    reorder: false,
    routeProvider: async () => null,
  });
  const travel = days[0].activities.find((activity) => activity.type === 'travel');

  assert.ok(travel);
  assert.equal(travel.isEstimated, true);
  assert.match(travel.notes, /^\d+\.\d+ km$/);
});

test('Open-Meteo request failure returns no forecast and generic pre-trip fallback remains available', async () => {
  const originalGet = axios.get;
  axios.get = async () => {
    throw new Error('simulated Open-Meteo outage');
  };
  try {
    const forecast = await getWeatherForecast({
      latitude: 12.3,
      longitude: 76.6,
      startDate: dateOffset(1),
      endDate: dateOffset(2),
    });
    assert.equal(forecast, null);

    const outOfWindowForecast = await getWeatherForecast({
      latitude: 12.3,
      longitude: 76.6,
      startDate: dateOffset(1200),
      endDate: dateOffset(1201),
    });
    assert.equal(outOfWindowForecast, null);
  } finally {
    axios.get = originalGet;
  }

  const fallback = buildPreTripFallback(null);
  assert.ok(fallback.packingChecklist.essentials.includes('ID proof'));
  assert.match(fallback.weatherAdvice, /unavailable/i);
});

test('insufficient dataset POIs are supplemented with explicitly tagged Gemini suggestions', async () => {
  const suggestions = await recommendPOIs(makeTrip(), { lat: 12.3, lng: 76.6 }, null, {
    candidateProvider: async () => [
      { _id: 'db-1', name: 'Palace', latitude: 12.3, longitude: 76.6, source: 'dataset' },
      { _id: 'db-2', name: 'Museum', latitude: 12.31, longitude: 76.61, source: 'dataset' },
    ],
    generateJsonFn: async () => ({
      pois: [{ name: 'Garden', category: 'park', description: 'A public garden.' }],
    }),
  });

  const generated = suggestions.find((candidate) => candidate.name === 'Garden');
  assert.ok(generated);
  assert.equal(generated.source, 'gemini');
  assert.equal(generated.latitude, null);
  assert.equal(generated.longitude, null);
});

test('candidate-query failure marks the trip failed and records a retryable error', async () => {
  const originalFindById = Trip.findById;
  const saveStatuses = [];
  const trip = {
    ...makeTrip({ userId: 'user-id', status: 'draft' }),
    discoveredCandidates: null,
    save: async function save() {
      saveStatuses.push(this.status);
    },
  };
  Trip.findById = async () => trip;

  try {
    await assert.rejects(
      generateTrip('trip-id', 'user-id', {
        geocodeAddressFn: async () => ({ lat: 12.2958, lng: 76.6394 }),
        recommendHotelsFn: async () => {
          throw new Error('simulated MongoDB candidate query failure');
        },
      }),
      /Trip generation failed/
    );
  } finally {
    Trip.findById = originalFindById;
  }

  assert.deepEqual(saveStatuses, ['generating', 'failed']);
  assert.equal(trip.status, 'failed');
  assert.match(trip.generationError, /MongoDB candidate query failure/);
});

test('sparse small-town input still produces a day without discarding its supplied place', () => {
  const days = buildDeterministicItinerary(makeTrip({
    destination: 'Kushalnagar',
    pace: 'relaxed',
  }), {
    pois: [{ id: 'town-poi-1', name: 'Local Heritage Site', source: 'dataset' }],
    hotels: [],
    restaurants: [],
  });

  assert.equal(days.length, 1);
  assert.ok(days[0].activities.some((activity) => activity.name === 'Local Heritage Site'));
});
