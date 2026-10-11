const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateProfileSummary } = require('../../server/src/services/profile/profile.service');

const trips = [
  {
    _id: 'completed-1',
    status: 'generated',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    numberOfDays: 99,
    destination: 'Mysuru, India',
    itinerary: [{
      activities: [
        { type: 'poi', refId: 'poi-1', name: 'Palace' },
        { type: 'poi', refId: null, name: ' City Museum ' },
        { type: 'restaurant', refId: 'restaurant-1', name: 'Cafe' },
      ],
    }],
  },
  {
    _id: 'completed-2',
    status: 'generated',
    startDate: '2026-10-05',
    endDate: '2026-10-08',
    numberOfDays: 1,
    destination: 'Mysuru, India',
    itinerary: [{ activities: [{ type: 'poi', refId: 'poi-1', name: 'Palace' }] }],
  },
  {
    _id: 'today',
    status: 'generated',
    startDate: '2026-10-09',
    endDate: '2026-10-09',
    destination: 'Mysuru, India',
    itinerary: [{ activities: [{ type: 'poi', refId: null, name: 'city museum' }] }],
  },
  {
    _id: 'same-place-different-city',
    status: 'generated',
    startDate: '2026-10-12',
    endDate: '2026-10-13',
    destination: 'Bengaluru, India',
    itinerary: [{ activities: [{ type: 'poi', refId: null, name: 'City Museum' }] }],
  },
  {
    _id: 'draft',
    status: 'draft',
    startDate: '2026-10-01',
    endDate: '2026-10-02',
    destination: 'Mysuru, India',
    itinerary: [{ activities: [{ type: 'poi', refId: 'draft-place', name: 'Draft POI' }] }],
  },
  {
    _id: 'generating',
    status: 'generating',
    startDate: '2026-10-10',
    endDate: '2026-10-11',
    destination: 'Mysuru, India',
    itinerary: [],
  },
  {
    _id: 'failed',
    status: 'failed',
    startDate: '2026-10-01',
    endDate: '2026-10-30',
    destination: 'Mysuru, India',
    itinerary: [{ activities: [{ type: 'poi', refId: 'failed-place', name: 'Failed POI' }] }],
  },
];

test('profile summary derives statuses, unique POIs, completed days, and paise expenditure', () => {
  assert.deepEqual(calculateProfileSummary(trips, [
    { amountPaise: 12550 },
    { amountPaise: 999 },
  ], { today: '2026-10-09' }), {
    totalTripsPlanned: 6,
    placesExplored: 3,
    totalTravelDays: 7,
    totalExpenditurePaise: 13549,
  });
});

test('empty profile summary returns zero values', () => {
  assert.deepEqual(calculateProfileSummary([], [], { today: '2026-10-09' }), {
    totalTripsPlanned: 0,
    placesExplored: 0,
    totalTravelDays: 0,
    totalExpenditurePaise: 0,
  });
});

test('profile summary rejects invalid paise values and overflow', () => {
  assert.throws(() => calculateProfileSummary([], [{ amountPaise: 1.5 }]), /invalid paise amount/);
  assert.throws(() => calculateProfileSummary([], [
    { amountPaise: Number.MAX_SAFE_INTEGER },
    { amountPaise: 1 },
  ]), /exceeds the supported safe-integer range/);
});
