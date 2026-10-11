const test = require('node:test');
const assert = require('node:assert/strict');
const {
  filterAndSortJourneys,
  formatJourneyDateRange,
  getJourneyDays,
  getJourneyStatus,
} = require('../../client/src/utils/savedJourneys.js');

const TODAY = '2026-10-09';

test('journey badges map dates and trip states without inventing a generating badge', () => {
  assert.equal(getJourneyStatus({ status: 'draft' }, TODAY), 'draft');
  assert.equal(getJourneyStatus({ status: 'failed' }, TODAY), 'draft');
  assert.equal(getJourneyStatus({ status: 'generating' }, TODAY), null);
  assert.equal(getJourneyStatus({ status: 'generated', endDate: '2026-10-08' }, TODAY), 'completed');
  assert.equal(getJourneyStatus({ status: 'generated', endDate: '2026-10-09' }, TODAY), 'upcoming');
  assert.equal(getJourneyStatus({ status: 'generated', endDate: 'invalid' }, TODAY), null);
});

test('trip card day counts are derived inclusively from date fields', () => {
  assert.equal(getJourneyDays('2026-10-09', '2026-10-09'), 1);
  assert.equal(getJourneyDays('2026-10-09', '2026-10-11'), 3);
  assert.equal(getJourneyDays('2026-10-11', '2026-10-09'), null);
});

test('trip date ranges format date-only values in UTC', () => {
  assert.equal(formatJourneyDateRange('2026-10-09', '2026-10-11'), '9 Oct - 11 Oct 2026');
  assert.equal(formatJourneyDateRange('invalid', '2026-10-11'), '');
});

test('saved journeys filter by status and trip name or destination', () => {
  const trips = [
    { tripName: 'Coast', destination: 'Goa', status: 'generated', endDate: '2026-10-12' },
    { tripName: 'Old town', destination: 'Mysuru', status: 'generated', endDate: '2026-10-08' },
    { tripName: 'New plan', destination: 'Pune', status: 'draft' },
    { tripName: 'Working', destination: 'Kochi', status: 'generating' },
  ];
  assert.deepEqual(filterAndSortJourneys(trips, { filter: 'upcoming', today: TODAY }), [trips[0]]);
  assert.deepEqual(filterAndSortJourneys(trips, { filter: 'completed', query: 'mysuru', today: TODAY }), [trips[1]]);
  assert.deepEqual(filterAndSortJourneys(trips, { filter: 'draft', today: TODAY }), [trips[2]]);
  assert.deepEqual(filterAndSortJourneys(trips, { filter: 'upcoming', query: 'no match', today: TODAY }), []);
  assert.deepEqual(filterAndSortJourneys(trips, { filter: 'all', today: TODAY }), trips);
});

test('saved journeys sort by creation time, name, and budget with missing budgets last', () => {
  const trips = [
    { tripName: 'Zeta', createdAt: '2026-10-09T12:00:00Z', budget: null },
    { tripName: 'Alpha', createdAt: '2026-10-09T13:00:00Z', budget: 700 },
    { tripName: 'Beta', createdAt: '2026-10-08T13:00:00Z', budget: 1400 },
  ];
  assert.deepEqual(filterAndSortJourneys(trips, { sort: 'latest' }), [trips[1], trips[0], trips[2]]);
  assert.deepEqual(filterAndSortJourneys(trips, { sort: 'oldest' }), [trips[2], trips[0], trips[1]]);
  assert.deepEqual(filterAndSortJourneys(trips, { sort: 'name' }), [trips[1], trips[2], trips[0]]);
  assert.deepEqual(filterAndSortJourneys(trips, { sort: 'budget' }), [trips[2], trips[1], trips[0]]);
});
