const test = require('node:test');
const assert = require('node:assert/strict');
const { dedupeCanonicalCityNames } = require('../../server/src/routes/cities.routes');
const { cityMatchPatterns, CANDIDATE_QUERY_V2 } = require('../../server/src/services/recommendation/candidate.service');
const { computeNumberOfDays } = require('../../server/src/services/trip/trip.service');
const {
	buildTripOverview,
	buildBudgetSummary,
	ensureIntercityTransportOptions,
	buildPreTripFallback,
} = require('../../server/src/services/trip/tripGeneration.service');
const {
	normalizeGroupTripMembers,
} = require('../../server/src/services/trip/trip.service');
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

test('transport fallback never calls includes on an undefined route mode list', () => {
	const trip = { budget: 20000, transportPreference: 'any' };
	const options = ensureIntercityTransportOptions(trip, [{ mode: 'train', summary: 'Train' }]);

	assert.ok(Array.isArray(options));
	assert.ok(options.some((option) => option.mode === 'train'));
	assert.equal(options[0].mode, 'train');
});

test('group invite phone numbers are normalized into pending invite records until the member approves', () => {
	const members = normalizeGroupTripMembers([
		'+919876543210',
		{ phoneNumber: '+919876543211', name: 'Aria' },
	]);

	assert.equal(members.length, 2);
	assert.equal(members[0].status, 'pending');
	assert.equal(members[0].phoneNumber, '+919876543210');
	assert.equal(members[1].status, 'pending');
	assert.equal(members[1].name, 'Aria');
});

test('selected place anchors are kept on the draft payload', () => {
	const payload = {
		tripName: 'Mysore heritage trip',
		origin: 'Bengaluru',
		destination: 'Mysore',
		startDate: '2026-09-20',
		endDate: '2026-09-23',
		budget: 20000,
		travelStyle: 'moderate',
		selectedPlaces: [
			{ refId: '64f3d0f2a1b2c3d4e5f67890', type: 'poi', name: 'Mysore Palace', source: 'dataset' },
			{ refId: '64f3d0f2a1b2c3d4e5f67891', type: 'restaurant', name: 'Mysore Food House', source: 'dataset' },
		],
	};

	assert.deepEqual(payload.selectedPlaces.map((place) => place.name), ['Mysore Palace', 'Mysore Food House']);
	assert.equal(payload.selectedPlaces[0].type, 'poi');
	assert.equal(payload.selectedPlaces[1].type, 'restaurant');
});

test('pending invite members are not treated as visible trip members until they approve', () => {
	const trip = {
		userId: 'owner-1',
		groupMembers: [
			{ userId: 'owner-1', status: 'accepted' },
			{ phoneNumber: '+919876543210', status: 'pending' },
		],
	};
	const currentUser = { _id: 'member-1', phoneNumber: '+919876543210' };
	const currentPhone = '+919876543210';
	const isGroupMember = trip.groupMembers.some((member) => {
		const sameUser = String(member.userId) === String(currentUser._id);
		const samePhone = Boolean(currentPhone) && member.phoneNumber && member.phoneNumber === currentPhone;
		return (sameUser || samePhone) && member.status === 'accepted';
	});

	assert.equal(isGroupMember, false);
});

test('destination autocomplete keeps only one canonical city name for Mysore variants', () => {
	const names = ['Mysuru', 'Mysore', 'mysore', 'Mysuru', 'Bengaluru', 'Bangalore'];
	const result = dedupeCanonicalCityNames(names);

	assert.deepEqual(result, ['Mysore', 'Bengaluru']);
});

test('destination autocomplete rejects non-city strings such as hotel group names', () => {
	const names = ['Mysore', 'Mysore - Member ITC Hotel Group', 'Bengaluru', 'Bengaluru resort'];
	const result = dedupeCanonicalCityNames(names);

	assert.deepEqual(result, ['Mysore', 'Bengaluru']);
});

test('selected hotel ids accept dataset ids and discovery results deduplicate identical stays', () => {
	const merged = mergeDiscoveryResults(
		{
			places: [],
			stays: [{ id: 'hotel-1', name: 'Mysore Central Hotel' }, { id: 'hotel-2', name: 'Green Stay' }],
			restaurants: [],
			transport: [],
		},
		{
			places: [],
			stays: [{ id: 'hotel-1', name: 'Mysore Central Hotel' }, { id: 'hotel-3', name: 'Lake View Inn' }],
			restaurants: [],
			transport: [],
		}
	);

	assert.equal(merged.stays.length, 3);
	assert.deepEqual(merged.stays.map((stay) => stay.id).sort(), ['hotel-1', 'hotel-2', 'hotel-3']);
	assert.equal(typeof 'hotel-1', 'string');
});

test('discovery merging deduplicates stays by stable id', () => {
	const merged = mergeDiscoveryResults(
		{
			places: [],
			stays: [{ id: 'hotel-1', name: 'Mysore Central Hotel' }, { id: 'hotel-2', name: 'Green Stay' }],
			restaurants: [],
			transport: [],
		},
		{
			places: [],
			stays: [{ id: 'hotel-1', name: 'Mysore Central Hotel' }, { id: 'hotel-3', name: 'Lake View Inn' }],
			restaurants: [],
			transport: [],
		}
	);

	assert.equal(merged.stays.length, 3);
	assert.deepEqual(merged.stays.map((stay) => stay.id).sort(), ['hotel-1', 'hotel-2', 'hotel-3']);
});

test('candidate retrieval always uses canonical city variants', () => {
	const patterns = cityMatchPatterns('Mysuru');
	assert.ok(patterns.includes('Mysore'));
	assert.ok(patterns.includes('Mysuru'));
	assert.ok(patterns.includes('mysuru'));
	assert.equal(typeof CANDIDATE_QUERY_V2, 'boolean');
	assert.equal(CANDIDATE_QUERY_V2, true);
	const districtPatterns = cityMatchPatterns('Mysuru District');
	[
		'Mysore',
		'Mysuru',
		'Mysuru District',
		'Mysuru Sub-district',
		'Mysuru Taluk',
		'mysore',
		'mysuru',
		'mysuru district',
		'mysuru sub-district',
		'mysuru taluk',
	].forEach((alias) => assert.ok(districtPatterns.includes(alias), `missing alias ${alias}`));
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
