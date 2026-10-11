const test = require('node:test');
const assert = require('node:assert/strict');
const { serializePendingInvite } = require('../../server/src/controllers/trip.controller');

test('pending-trip notification response excludes invitee phone and group-member data', () => {
  const invite = serializePendingInvite({
    _id: '507f1f77bcf86cd799439011',
    tripName: 'Coastal trip',
    origin: 'Bengaluru',
    destination: 'Goa',
    startDate: new Date('2026-11-01'),
    endDate: new Date('2026-11-05'),
    createdAt: new Date('2026-10-01'),
    groupMembers: [{ phoneNumber: '+919876543210', email: 'private@example.com' }],
  });

  assert.deepEqual(Object.keys(invite).sort(), [
    '_id', 'createdAt', 'destination', 'endDate', 'origin', 'startDate', 'tripName',
  ]);
  assert.equal('groupMembers' in invite, false);
  assert.equal('phoneNumber' in invite, false);
});
