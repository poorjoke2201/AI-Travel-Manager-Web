const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDeterministicItinerary, isOpenForVisit } = require('../../server/src/services/itinerary/itineraryOptimizer.service');
const { planItineraryRoutes } = require('../../server/src/services/itinerary/routePlanner.service');
const { validateItinerary } = require('../../server/src/services/ai/geminiValidator');
const { buildItineraryPrompt } = require('../../server/src/services/ai/geminiPrompts');
const { poiCoverageTarget } = require('../../server/src/services/recommendation/candidate.service');
const { needsBackfill } = require('../../server/src/services/recommendation/webSearchEnrichment.service');

test('coverage target scales with days and pace', () => {
	assert.deepEqual(poiCoverageTarget({ numberOfDays: 3, pace: 'balanced' }), { requiredPOIs: 15, targetPOIs: 17 });
});

test('web enrichment triggers only when coverage is short', () => {
	assert.equal(needsBackfill({ availablePOIs: 10, targetPOIs: 10, availableRestaurants: 6, requiredRestaurants: 6 }), false);
	assert.equal(needsBackfill({ availablePOIs: 9, targetPOIs: 10, availableRestaurants: 6, requiredRestaurants: 6 }), true);
});

test('closed days and closing-time overflow are rejected', () => {
	assert.equal(isOpenForVisit({ weeklyOff: 'Monday' }, '2026-10-12', 600, 60), false);
	assert.equal(isOpenForVisit({ closingTime: '17:00' }, '2026-10-13', 960, 90), false);
	assert.equal(isOpenForVisit({ openingTime: '10:00', closingTime: '17:00' }, '2026-10-13', 540, 60), false);
});

test('deterministic fallback uses distinct restaurants across days', () => {
	const trip = {
		destination: 'Mysore',
		startDate: '2026-10-12',
		numberOfDays: 2,
		pace: 'relaxed',
	};
	const pois = [
		{ id: 'p1', name: 'Palace', latitude: 12.3, longitude: 76.6, preferenceScore: 1 },
		{ id: 'p2', name: 'Market', latitude: 12.31, longitude: 76.61, preferenceScore: 0.9 },
	];
	const restaurants = [
		{ id: 'r1', name: 'One', latitude: 12.3, longitude: 76.6 },
		{ id: 'r2', name: 'Two', latitude: 12.31, longitude: 76.61 },
		{ id: 'r3', name: 'Three', latitude: 12.32, longitude: 76.62 },
		{ id: 'r4', name: 'Four', latitude: 12.33, longitude: 76.63 },
		{ id: 'r5', name: 'Five', latitude: 12.34, longitude: 76.64 },
		{ id: 'r6', name: 'Six', latitude: 12.35, longitude: 76.65 },
	];
	const itinerary = buildDeterministicItinerary(trip, { pois, hotels: [], restaurants });
	const mealIds = itinerary.flatMap((day) => day.activities.filter((activity) => activity.type === 'restaurant').map((activity) => activity.refId));
	assert.equal(new Set(mealIds).size, mealIds.length);
});

test('route planner never wraps an overlong day into early-morning times', async () => {
	const days = await planItineraryRoutes([{
		day: 2,
		date: '2026-10-02',
		activities: [
			{ type: 'poi', name: 'Long visit', startTime: '09:00', duration: 900, location: { lat: null, lng: null } },
			{ type: 'poi', name: 'Too late', startTime: '19:00', duration: 900, location: { lat: null, lng: null } },
		],
	}], { reorder: false });

	const activities = days[0].activities;
	assert.ok(activities.every((activity) => !activity.startTime || Number(activity.startTime.slice(0, 2)) >= 8));
	assert.ok(activities.every((activity) => !activity.endTime || Number(activity.endTime.slice(0, 2)) <= 21));
});

test('itinerary validation rejects invalid early-morning and overlapping activities', () => {
	const result = validateItinerary({
		days: [{
			day: 1,
			date: '2026-10-01',
			activities: [
				{ type: 'poi', datasetId: 'p1', name: 'Early place', startTime: '01:00', duration: 90, source: 'dataset' },
				{ type: 'restaurant', datasetId: 'r1', name: 'Overlapping meal', startTime: '01:30', duration: 60, source: 'dataset' },
			],
		}],
	}, {
		trip: { numberOfDays: 1, startDate: new Date('2026-10-01'), endDate: new Date('2026-10-01') },
		candidateIds: new Set(['p1', 'r1']),
	});

	assert.equal(result.valid, false);
	assert.ok(result.errors.some((error) => error.includes('before the allowed day window')));
});

test('itinerary prompt marks selected places as mandatory', () => {
	const prompt = buildItineraryPrompt({
		trip: { destination: 'Mysore', origin: 'Bengaluru', startDate: '2026-10-12', endDate: '2026-10-12', numberOfDays: 1, travellers: { adults: 1, children: 0 }, tripType: 'solo', travelStyle: 'moderate', pace: 'balanced', budget: null, placePreferences: [], foodPreferences: [], accommodationPreference: 'any', dailyTravelToleranceKm: null },
		candidatePOIs: [], candidateHotels: [], candidateRestaurants: [], mandatoryPlaces: [{ type: 'poi', refId: 'p1', name: 'Palace' }],
	});
	assert.match(prompt, /Mandatory places/);
	assert.match(prompt, /Palace/);
});
