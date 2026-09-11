const test = require('node:test');
const assert = require('node:assert/strict');
const { computeNumberOfDays } = require('../../server/src/services/trip/trip.service');
const {
	buildTripOverview,
	buildBudgetSummary,
	ensureIntercityTransportOptions,
	buildPreTripFallback,
} = require('../../server/src/services/trip/tripGeneration.service');
const { mergeDiscoveryResults, mergeTransportOptions } = require('../../server/src/services/trip/tripDiscovery.service');

test('trip duration is inclusive of start and end dates', () => {
	assert.equal(computeNumberOfDays('2026-10-12', '2026-10-16'), 5);
	assert.equal(computeNumberOfDays('2026-10-12', '2026-10-12'), 1);
});

test('trip overview and budget summary cover the trip story and spend', () => {
	const trip = {
		destination: 'Mysore',
		numberOfDays: 3,
		travelStyle: 'balanced',
		placePreferences: ['heritage', 'markets'],
		foodPreferences: ['south indian', 'coffee'],
		budget: 18000,
	};

	const overview = buildTripOverview(trip, 'The Green Stay');
	assert.match(overview, /Mysore/i);
	assert.match(overview, /heritage/i);
	assert.match(overview, /coffee/i);

	const budget = buildBudgetSummary(trip, [{ pricePerNightInr: 2200 }], [
		{ mode: 'train', approxPriceInr: 1200 },
		{ mode: 'bus', approxPriceInr: 650 },
	]);
	assert.equal(budget.accommodationInr, 6600);
	assert.equal(budget.intercityInr, 1200);
	assert.equal(budget.intracityInr, 650);
	assert.equal(budget.foodInr, 3600);
	assert.equal(budget.totalEstimatedInr, 12050);
});

test('discovery merging keeps web-derived transport and stay options', () => {
	const merged = mergeDiscoveryResults(
		{
			places: [{ id: 'p1', name: 'Heritage Place' }],
			stays: [{ id: 's1', name: 'Dataset Stay' }],
			restaurants: [{ id: 'r1', name: 'Dataset Bite' }],
			transport: [{ mode: 'train', summary: 'Dataset rail option' }],
			intracityTransport: [{ mode: 'bus', summary: 'Dataset local bus' }],
		},
		{
			places: [{ id: 'p2', name: 'Web Place' }],
			stays: [{ id: 's2', name: 'Web Stay' }],
			restaurants: [{ id: 'r2', name: 'Web Eatery' }],
			transport: [{ mode: 'car', summary: 'Web road option' }],
			intracityTransport: [{ mode: 'cab', summary: 'Web cab option' }],
		}
	);

	assert.equal(merged.stays.length, 2);
	assert.equal(merged.places.length, 2);
	assert.equal(merged.transport.length, 2);
	assert.equal(merged.intracityTransport.length, 2);
	assert.equal(merged.intracityTransport[0].mode, 'bus');
	assert.equal(merged.intracityTransport[1].mode, 'cab');
});

test('intercity transport always has a priced option', () => {
	const trip = { budget: 20000, selectedTransportMode: 'bike' };
	const options = ensureIntercityTransportOptions(trip, [
		{ mode: 'bike', summary: 'Bike route', approxPriceInr: null },
	]);

	assert.equal(options.length, 4);
	assert.equal(options[0].mode, 'train');
	assert.deepEqual(options.map((option) => option.mode), ['train', 'flight', 'bus', 'car']);
	assert.equal(options[0].approxPriceInr, 2400);

	const priced = ensureIntercityTransportOptions(
		{ budget: 18000, selectedTransportMode: 'bus' },
		[{ mode: 'bus', summary: 'Coach', approxPriceInr: null }]
	);
	assert.equal(priced[0].approxPriceInr, 1440);
});

test('discovery transport options are unique by mode and keep route data', () => {
	const options = mergeTransportOptions(
		[{ mode: 'car', summary: 'AI car estimate' }, { mode: 'train', summary: 'Train' }],
		[{ mode: 'car', summary: 'Mapped road route', distanceKm: 1200 }, { mode: 'bus', summary: 'Bus' }]
	);

	assert.deepEqual(options.map((option) => option.mode), ['car', 'train', 'bus']);
	assert.equal(options[0].distanceKm, 1200);
});

test('pre-trip fallback uses weather when Gemini is unavailable', () => {
	const fallback = buildPreTripFallback({
		summary: 'Open-Meteo weather: highs 32-34 C; maximum rain probability 80%; maximum UV index 9',
		days: [{ maxC: 34, minC: 22, rainChance: 80, uv: 9 }],
	});

	assert.match(fallback.weatherAdvice, /Open-Meteo/);
	assert.ok(fallback.packingChecklist.clothing.includes('Breathable cotton layers'));
	assert.ok(fallback.packingChecklist.destinationSpecific.includes('Compact umbrella or rain jacket'));
	assert.ok(fallback.packingChecklist.destinationSpecific.includes('Sunscreen'));
});
