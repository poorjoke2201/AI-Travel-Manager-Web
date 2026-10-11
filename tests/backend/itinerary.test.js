const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDeterministicItinerary, isOpenForVisit } = require('../../server/src/services/itinerary/itineraryOptimizer.service');
const { planItineraryRoutes } = require('../../server/src/services/itinerary/routePlanner.service');
const { validateItinerary } = require('../../server/src/services/ai/geminiValidator');
const { buildItineraryPrompt } = require('../../server/src/services/ai/geminiPrompts');
const { poiCoverageTarget } = require('../../server/src/services/recommendation/candidate.service');
const { needsBackfill } = require('../../server/src/services/recommendation/webSearchEnrichment.service');
const { optimizeItineraryForTrip } = require('../../server/src/services/engine/v2Optimizer.service');
const { summarizeWeather } = require('../../server/src/services/weather/openMeteo.service');
const { ensureSelectedPlacesIncluded } = require('../../server/src/services/trip/tripGeneration.service');

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

test('route planner starts the next activity after the measured travel leg', async () => {
	const days = await planItineraryRoutes([{
		day: 2,
		date: '2026-10-03',
		activities: [
			{ type: 'poi', name: 'First', startTime: '09:00', duration: 60, location: { lat: 12.3, lng: 76.6 } },
			{ type: 'poi', name: 'Second', startTime: '09:00', duration: 60, location: { lat: 12.31, lng: 76.61 } },
		],
	}], {
		reorder: false,
		routeProvider: async () => ({ provider: 'test', distanceKm: 4.2, durationMinutes: 30 }),
	});
	const activities = days[0].activities;
	const travel = activities.find((activity) => activity.type === 'travel');
	const second = activities.find((activity) => activity.name === 'Second');
	assert.equal(travel.startTime, '10:00');
	assert.equal(travel.endTime, '10:30');
	assert.equal(second.startTime, '10:40');
});

test('route planner retains a selected place even when the day has no schedulable time left', async () => {
	const days = await planItineraryRoutes([{
		day: 1,
		date: '2026-10-03',
		activities: [
			{ type: 'poi', name: 'Long stop', startTime: '09:00', duration: 780, location: { lat: 12.3, lng: 76.6 } },
			{ type: 'poi', name: 'Selected late stop', startTime: '22:00', duration: 180, isSelected: true, location: { lat: 12.31, lng: 76.61 } },
		],
	}], { reorder: false, routeProvider: async () => null });
	const selected = days[0].activities.find((activity) => activity.name === 'Selected late stop');
	assert.ok(selected);
	assert.equal(selected.startTime, null);
	assert.match(selected.notes, /retained but needs rescheduling/);
});

test('v2 itinerary retains all selected POIs and groups them across trip days', async () => {
	const pois = Array.from({ length: 12 }, (_, index) => ({
		id: `poi-${index + 1}`,
		name: `Place ${index + 1}`,
		category: 'Cultural & Heritage Sites',
		latitude: 12.3 + (index % 4) * 0.005,
		longitude: 76.6 + Math.floor(index / 4) * 0.02,
		visitDurationHrs: 1,
		source: 'dataset',
	}));
	const selectedIds = new Set(pois.slice(0, 8).map((poi) => poi.id));
	const days = await optimizeItineraryForTrip({
		destination: 'Mysore',
		destinationLocation: { lat: 12.3, lng: 76.6 },
		startDate: '2026-10-03',
		numberOfDays: 3,
		pace: 'balanced',
		placePreferences: [],
		selectedPlaces: [...selectedIds].map((refId) => ({ type: 'poi', refId })),
	}, { pois, hotels: [], restaurants: [] });
	const scheduledIds = new Set(days.flatMap((day) => day.activities)
		.filter((activity) => activity.type === 'poi')
		.map((activity) => activity.refId));
	assert.deepEqual([...selectedIds].filter((id) => !scheduledIds.has(id)), []);
	assert.ok(days.filter((day) => day.activities.some((activity) => activity.isSelected)).length > 1);
});

test('selected POIs omitted by a generated itinerary are inserted into available days', () => {
	const candidates = Array.from({ length: 4 }, (_, index) => ({
		id: `selected-${index + 1}`,
		name: `Selected ${index + 1}`,
		latitude: 12.3 + index * 0.002,
		longitude: 76.6 + index * 0.002,
		visitDurationHrs: 1,
	}));
	const selectedPlaces = candidates.map((candidate) => ({
		refId: candidate.id,
		type: 'poi',
		name: candidate.name,
	}));
	const days = ensureSelectedPlacesIncluded([
		{ day: 1, date: '2026-10-03', activities: [{ type: 'poi', refId: 'selected-1', name: 'Selected 1', location: { lat: 12.3, lng: 76.6 } }] },
		{ day: 2, date: '2026-10-04', activities: [] },
	], {
		selectedPlaces,
		destination: 'Mysore',
		destinationLocation: { lat: 12.3, lng: 76.6 },
	}, candidates);
	const scheduledIds = days.flatMap((day) => day.activities)
		.filter((activity) => activity.type === 'poi')
		.map((activity) => activity.refId);
	assert.deepEqual([...new Set(scheduledIds)].sort(), selectedPlaces.map((place) => place.refId).sort());
});

test('Open-Meteo daily weather maps to structured forecast fields', () => {
	const forecast = summarizeWeather({
		latitude: 12.3,
		longitude: 76.6,
		daily: {
			time: ['2026-10-03'],
			temperature_2m_max: [29],
			temperature_2m_min: [19],
			precipitation_probability_max: [10],
			weather_code: [0],
			wind_speed_10m_max: [12],
			uv_index_max: [7],
		},
	}, '2026-10-03', '2026-10-03');
	assert.deepEqual(forecast.days[0], {
		date: '2026-10-03',
		maxC: 29,
		minC: 19,
		rainChance: 10,
		weather: 'clear skies',
		windKmh: 12,
		uv: 7,
	});
	assert.equal(forecast.source, 'Open-Meteo');
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
		candidatePOIs: [{
			id: 'p1',
			name: 'Palace',
			importanceScore: 0.95,
			recommendationScore: 0.9,
		}],
		candidateHotels: [], candidateRestaurants: [], mandatoryPlaces: [{ type: 'poi', refId: 'p1', name: 'Palace' }],
	});
	assert.match(prompt, /Mandatory places/);
	assert.match(prompt, /Palace/);
	assert.match(prompt, /systemPriority=1, importance=0\.95, recommendationScore=0\.90/);
	assert.match(prompt, /Do not omit leading candidates solely because the traveller did not specify a matching interest/);
});
