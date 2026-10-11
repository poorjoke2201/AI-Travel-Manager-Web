const test = require('node:test');
const assert = require('node:assert/strict');
const { computeGroupBalances } = require('../../server/src/services/expenses/budget.service');

test('group trips produce Splitwise-style balances for shared expenses', () => {
  const trip = {
    userId: '507f1f77bcf86cd799439011',
    isGroupTrip: true,
    groupMembers: [
      { userId: '507f1f77bcf86cd799439011', name: 'Asha', role: 'owner', status: 'accepted' },
      { userId: '507f1f77bcf86cd799439012', name: 'Rohit', role: 'member', status: 'accepted' },
      { userId: '507f1f77bcf86cd799439013', name: 'Meera', role: 'member', status: 'accepted' },
    ],
  };

  const balances = computeGroupBalances(trip, [
    {
      paidBy: '507f1f77bcf86cd799439011',
      amountPaise: 300000,
      splits: [
        { memberId: '507f1f77bcf86cd799439011', sharePaise: 100000 },
        { memberId: '507f1f77bcf86cd799439012', sharePaise: 100000 },
        { memberId: '507f1f77bcf86cd799439013', sharePaise: 100000 },
      ],
    },
    {
      paidBy: '507f1f77bcf86cd799439012',
      amountPaise: 150000,
      splits: [
        { memberId: '507f1f77bcf86cd799439011', sharePaise: 50000 },
        { memberId: '507f1f77bcf86cd799439012', sharePaise: 50000 },
        { memberId: '507f1f77bcf86cd799439013', sharePaise: 50000 },
      ],
    },
  ]);

  assert.equal(balances.length, 2);
  assert.ok(balances.some((entry) => entry.userId === '507f1f77bcf86cd799439011' && entry.netPaise === 150000));
  assert.ok(balances.some((entry) => entry.userId === '507f1f77bcf86cd799439013' && entry.netPaise === -150000));
});

test('custom split calculations reflect exact owed amounts and payer settlements', () => {
  const trip = {
    userId: 'u1',
    isGroupTrip: true,
    groupMembers: [
      { userId: 'u1', name: 'Asha', role: 'owner', status: 'accepted' },
      { userId: 'u2', name: 'Rohit', role: 'member', status: 'accepted' },
      { userId: 'u3', name: 'Meera', role: 'member', status: 'accepted' },
    ],
  };

  const balances = computeGroupBalances(trip, [
    {
      paidBy: 'u1',
      amountPaise: 150000,
      splits: [
        { memberId: 'u1', sharePaise: 30000 },
        { memberId: 'u2', sharePaise: 60000 },
        { memberId: 'u3', sharePaise: 60000 },
      ],
    },
  ]);

  const byUser = new Map(balances.map((entry) => [entry.userId, entry.netPaise]));
  assert.equal(byUser.get('u1'), 120000);
  assert.equal(byUser.get('u2'), -60000);
  assert.equal(byUser.get('u3'), -60000);
});

test('the trip lead and all accepted members are included in settlement balances even when owner is not stored in groupMembers', () => {
  const trip = {
    userId: 'owner-1',
    isGroupTrip: true,
    groupMembers: [
      { userId: 'member-2', name: 'Rohit', role: 'member', status: 'accepted' },
      { userId: 'member-3', name: 'Meera', role: 'member', status: 'accepted' },
    ],
  };

  const balances = computeGroupBalances(trip, [
    {
      paidBy: 'owner-1',
      amountPaise: 300000,
      splits: [
        { memberId: 'owner-1', sharePaise: 100000 },
        { memberId: 'member-2', sharePaise: 100000 },
        { memberId: 'member-3', sharePaise: 100000 },
      ],
    },
  ]);

  const byUser = new Map(balances.map((entry) => [entry.userId, entry.netPaise]));
  assert.equal(byUser.get('owner-1'), 200000);
  assert.equal(byUser.get('member-2'), -100000);
  assert.equal(byUser.get('member-3'), -100000);
});
