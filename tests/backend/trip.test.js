const test = require('node:test');
const assert = require('node:assert/strict');
const { computeNumberOfDays } = require('../../server/src/services/trip/trip.service');
const { buildTripOverview, buildBudgetSummary } = require('../../server/src/services/trip/tripGeneration.service');
const { mergeDiscoveryResults } = require('../../server/src/services/trip/tripDiscovery.service');

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
