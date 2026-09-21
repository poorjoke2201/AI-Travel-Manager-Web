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
      payerId: '507f1f77bcf86cd799439011',
      amount: 3000,
      participants: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012', '507f1f77bcf86cd799439013'],
    },
    {
      payerId: '507f1f77bcf86cd799439012',
      amount: 1500,
      participants: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012', '507f1f77bcf86cd799439013'],
    },
  ]);

  assert.equal(balances.length, 2);
  assert.ok(balances.some((entry) => entry.userId === '507f1f77bcf86cd799439011' && entry.net === 1500));
  assert.ok(balances.some((entry) => entry.userId === '507f1f77bcf86cd799439013' && entry.net === -1500));
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
      payerId: 'u1',
      amount: 1500,
      splitType: 'custom',
      participants: ['u1', 'u2', 'u3'],
      customAmounts: {
        u1: 300,
        u2: 600,
        u3: 600,
      },
    },
  ]);

  const byUser = new Map(balances.map((entry) => [entry.userId, entry.net]));
  assert.equal(byUser.get('u1'), 1200);
  assert.equal(byUser.get('u2'), -600);
  assert.equal(byUser.get('u3'), -600);
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
      payerId: 'owner-1',
      amount: 3000,
      participants: ['owner-1', 'member-2', 'member-3'],
      splitType: 'equal',
    },
  ]);

  const byUser = new Map(balances.map((entry) => [entry.userId, entry.net]));
  assert.equal(byUser.get('owner-1'), 2000);
  assert.equal(byUser.get('member-2'), -1000);
  assert.equal(byUser.get('member-3'), -1000);
});
