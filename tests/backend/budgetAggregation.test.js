const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildBudgetAggregation,
  assertTripMember,
  canManageRecord,
  computeGroupBalances,
  getTripDay,
  getTripDayCount,
  migrateLegacyExpense,
  suggestSettlements,
} = require('../../server/src/services/expenses/budget.service');

const ownerId = '507f1f77bcf86cd799439011';
const memberId = '507f1f77bcf86cd799439012';
const guestId = '507f1f77bcf86cd799439013';

function tripFixture() {
  return {
    _id: '507f1f77bcf86cd799439099',
    userId: ownerId,
    tripName: 'Weekend',
    destination: 'Example',
    isGroupTrip: true,
    startDate: '2026-10-09T00:00:00.000Z',
    endDate: '2026-10-10T00:00:00.000Z',
    budget: 1000.5,
    budgetSummary: {
      accommodationInr: 200,
      intercityInr: 100,
      intracityInr: 50,
      foodInr: 100,
    },
    itinerary: [{ activities: [{ estimatedCostInr: 100 }] }],
    groupMembers: [
      { _id: memberId, userId: memberId, name: 'Member', status: 'accepted' },
      { _id: guestId, name: 'Guest', status: 'accepted' },
    ],
  };
}

test('trip-day mapping is derived from the expense date and uses inclusive dates', () => {
  const trip = tripFixture();
  assert.equal(getTripDayCount(trip), 2);
  assert.deepEqual(getTripDay('2026-10-08', trip), { day: null, dayLabel: 'Before trip', period: 'before' });
  assert.deepEqual(getTripDay('2026-10-09', trip), { day: 1, dayLabel: 'Day 1', period: 'trip' });
  assert.deepEqual(getTripDay('2026-10-11', trip), { day: null, dayLabel: 'After trip', period: 'after' });
});

test('budget aggregation uses integer paise, excludes settlements from spending, and derives per-person balances', () => {
  const trip = tripFixture();
  const expenses = [
    {
      amountPaise: 10001,
      category: 'food',
      date: '2026-10-09',
      paidBy: ownerId,
      splits: [
        { memberId: ownerId, sharePaise: 5001 },
        { memberId: guestId, sharePaise: 5000 },
      ],
    },
    {
      amountPaise: 500,
      category: 'transport',
      date: '2026-10-10',
      paidBy: memberId,
      splits: [{ memberId: guestId, sharePaise: 500 }],
    },
  ];
  const settlements = [{ fromMember: guestId, toMember: ownerId, amountPaise: 300 }];
  const summary = buildBudgetAggregation(trip, expenses, settlements);
  const byMember = new Map(summary.perPerson.map((person) => [person.memberId, person]));

  assert.equal(summary.totalBudgetPaise, 100050);
  assert.equal(summary.spentPaise, 10501);
  assert.equal(summary.remainingPaise, 89549);
  assert.equal(summary.tripDays, 2);
  assert.equal(summary.dailyBudgetPaise, 50025);
  assert.equal(summary.categories.find((item) => item.category === 'food').actualPaise, 10001);
  assert.equal(summary.categories.find((item) => item.category === 'activities').plannedPaise, 10000);
  assert.equal(summary.categories.find((item) => item.category === 'miscellaneous').plannedPaise, 45050);
  assert.equal(summary.perDay.find((item) => item.day === 1).totalPaise, 10001);
  assert.equal(byMember.get(ownerId).paidPaise, 10001);
  assert.equal(byMember.get(guestId).sharePaise, 5500);
  assert.equal(byMember.get(ownerId).balancePaise, 4700);
  assert.equal(byMember.get(memberId).balancePaise, 500);
  assert.equal(byMember.get(guestId).balancePaise, -5200);
  assert.equal(summary.settlements[0].amountPaise, 300);
});

test('greedy settlement suggestions use at most n-1 transfers and zero every balance', () => {
  const balances = [
    { memberId: 'a', name: 'A', netPaise: 500 },
    { memberId: 'b', name: 'B', netPaise: -200 },
    { memberId: 'c', name: 'C', netPaise: -100 },
    { memberId: 'd', name: 'D', netPaise: -200 },
  ];
  const suggestions = suggestSettlements(balances);
  assert.ok(suggestions.length <= balances.length - 1);

  const settled = new Map(balances.map((person) => [person.memberId, person.netPaise]));
  for (const suggestion of suggestions) {
    settled.set(suggestion.fromMember, settled.get(suggestion.fromMember) + suggestion.amountPaise);
    settled.set(suggestion.toMember, settled.get(suggestion.toMember) - suggestion.amountPaise);
  }
  assert.deepEqual(Array.from(settled.values()), [0, 0, 0, 0]);
});

test('group balance ledger includes paise expense shares and recorded settlements', () => {
  const trip = tripFixture();
  const balances = computeGroupBalances(trip, [{
    paidBy: ownerId,
    amountPaise: 1000,
    splits: [
      { memberId: ownerId, sharePaise: 500 },
      { memberId: guestId, sharePaise: 500 },
    ],
  }], [{ fromMember: guestId, toMember: ownerId, amountPaise: 200 }]);
  const byMember = new Map(balances.map((entry) => [entry.memberId, entry.netPaise]));
  assert.equal(byMember.get(ownerId), 300);
  assert.equal(byMember.get(guestId), -300);
});

test('expense mutation is restricted to the creator or trip owner', () => {
  const trip = tripFixture();
  assert.equal(canManageRecord(ownerId, trip, { createdBy: memberId }), true);
  assert.equal(canManageRecord(memberId, trip, { createdBy: memberId }), true);
  assert.equal(canManageRecord(guestId, trip, { createdBy: memberId }), false);
  assert.doesNotThrow(() => assertTripMember(trip, guestId, 'split member'));
  assert.throws(() => assertTripMember(trip, 'pending-member', 'split member'), /accepted trip member/);
});

test('legacy rupee expenses migrate to canonical paise fields and exact splits', () => {
  const trip = tripFixture();
  const migrated = migrateLegacyExpense({
    _id: 'expense-1',
    tripId: trip._id,
    userId: ownerId,
    payerId: ownerId,
    amount: 30.01,
    category: 'food',
    date: new Date('2026-10-09T20:00:00.000Z'),
    paymentMethod: 'UPI',
    splitType: 'custom',
    participants: [ownerId, guestId],
    customAmounts: { [ownerId]: 10, [guestId]: 20.01 },
  }, trip);

  assert.equal(migrated.amountPaise, 3001);
  assert.equal(migrated.date, '2026-10-09');
  assert.equal(migrated.splitType, 'exact');
  assert.deepEqual(migrated.splits.map((split) => split.sharePaise), [1000, 2001]);
  assert.equal(migrated.createdBy, ownerId);
});

test('unreconcilable legacy expenses fail explicitly rather than silently losing split data', () => {
  const trip = tripFixture();
  assert.throws(() => migrateLegacyExpense({
    tripId: trip._id,
    userId: ownerId,
    amount: 30,
    category: 'food',
    date: '2026-10-09',
    paymentMethod: 'UPI',
    splitType: 'custom',
    participants: [ownerId, guestId],
    customAmounts: { [ownerId]: 10, [guestId]: 10 },
  }, trip), /cannot be converted automatically/);
});

test('aggregate money calculations fail explicitly before exceeding the safe integer range', () => {
  const trip = { ...tripFixture(), budget: Number.MAX_SAFE_INTEGER / 100 };
  assert.throws(() => buildBudgetAggregation(trip, [
    { amountPaise: Number.MAX_SAFE_INTEGER, category: 'food', date: '2026-10-09', paidBy: ownerId, splits: [] },
    { amountPaise: 1, category: 'food', date: '2026-10-09', paidBy: ownerId, splits: [] },
  ], []), /safe-integer range/);
});
