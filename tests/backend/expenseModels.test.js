const test = require('node:test');
const assert = require('node:assert/strict');
const Expense = require('../../server/src/models/Expense');
const Receipt = require('../../server/src/models/Receipt');
const Settlement = require('../../server/src/models/Settlement');
const Trip = require('../../server/src/models/Trip');
const { normalizeGroupTripMembers } = require('../../server/src/services/trip/trip.service');

test('expense stores date-only strings, paise and string member IDs including guests', () => {
  const expense = new Expense({
    tripId: '507f1f77bcf86cd799439011',
    amountPaise: 10001,
    category: 'food',
    description: 'Shared dinner',
    date: new Date('2026-10-09T17:30:00.000Z'),
    paidBy: 'guest-member-id',
    paymentMethod: 'UPI',
    splitType: 'equal',
    splits: [
      { memberId: 'guest-member-id', value: null, sharePaise: 5001 },
      { memberId: '507f1f77bcf86cd799439012', value: null, sharePaise: 5000 },
    ],
    createdBy: '507f1f77bcf86cd799439012',
  });

  assert.equal(expense.date, '2026-10-09');
  assert.equal(expense.amountPaise, 10001);
  assert.equal(expense.paidBy, 'guest-member-id');
  assert.equal(expense.validateSync(), undefined);
});

test('expense model rejects non-integer paise and invalid date-only values', () => {
  const expense = new Expense({
    tripId: '507f1f77bcf86cd799439011',
    amountPaise: 10.5,
    category: 'food',
    date: '2026-02-30',
    paidBy: 'member-a',
    paymentMethod: 'Cash',
    splitType: 'equal',
    splits: [{ memberId: 'member-a', sharePaise: 10 }],
    createdBy: '507f1f77bcf86cd799439012',
  });

  const error = expense.validateSync();
  assert.ok(error.errors.amountPaise);
  assert.ok(error.errors.date);
});

test('settlement model rejects self-settlements and accepts valid date-only settlement records', () => {
  const settlement = new Settlement({
    tripId: '507f1f77bcf86cd799439011',
    fromMember: 'member-a',
    toMember: 'member-a',
    amountPaise: 1200,
    date: '2026-10-09',
    method: 'UPI',
    createdBy: '507f1f77bcf86cd799439012',
  });

  assert.ok(settlement.validateSync().errors.toMember);

  settlement.toMember = 'guest-member';
  assert.equal(settlement.validateSync(), undefined);
});

test('receipt model stores private image metadata and enforces supported types and size', () => {
  const valid = new Receipt({
    tripId: '507f1f77bcf86cd799439011',
    uploadedBy: '507f1f77bcf86cd799439012',
    filename: 'a06d1145-9d1b-4a14-82c1-1181ea1aa0aa.png',
    mimeType: 'image/png',
    size: 1024,
  });
  assert.equal(valid.validateSync(), undefined);
  valid.mimeType = 'image/svg+xml';
  assert.ok(valid.validateSync().errors.mimeType);
  valid.mimeType = 'image/png';
  valid.size = 5 * 1024 * 1024 + 1;
  assert.ok(valid.validateSync().errors.size);
});

test('name-only trip members are retained and receive stable subdocument IDs', () => {
  const normalized = normalizeGroupTripMembers([
    { name: '  Priya  ' },
    { name: 'priya' },
    { name: 'Guest Traveller', status: 'accepted' },
  ]);
  const trip = new Trip({ groupMembers: normalized });

  assert.equal(trip.groupMembers.length, 2);
  assert.equal(trip.groupMembers[0].name, 'Priya');
  assert.equal(trip.groupMembers[0].status, 'accepted');
  assert.ok(trip.groupMembers[0]._id);
  assert.ok(trip.groupMembers[1]._id);
});
