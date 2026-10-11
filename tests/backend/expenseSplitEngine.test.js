const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateExpenseSplits } = require('../../server/src/services/expenses/splitEngine');

function totalShares(result) {
  return result.reduce((total, split) => total + split.sharePaise, 0);
}

test('equal split allocates remainder paise deterministically in member order', () => {
  const result = calculateExpenseSplits({
    amountPaise: 10000,
    splitType: 'equal',
    splits: [{ memberId: 'member-a' }, { memberId: 'member-b' }, { memberId: 'guest-c' }],
  });

  assert.deepEqual(result.map((split) => split.sharePaise), [3334, 3333, 3333]);
  assert.equal(totalShares(result), 10000);
});

test('exact split converts rupees to paise and checks that the inputs equal the total', () => {
  const result = calculateExpenseSplits({
    amountPaise: 10000,
    splitType: 'exact',
    splits: [
      { memberId: 'member-a', value: '10.00' },
      { memberId: 'guest-b', value: '20' },
      { memberId: 'member-c', value: '70.00' },
    ],
  });

  assert.deepEqual(result.map((split) => split.sharePaise), [1000, 2000, 7000]);
  assert.equal(totalShares(result), 10000);
  assert.throws(() => calculateExpenseSplits({
    amountPaise: 10000,
    splitType: 'exact',
    splits: [{ memberId: 'member-a', value: '99.99' }],
  }), /must sum to amountPaise/);
});

test('percent split accepts 33.33/33.33/33.34 and allocates every paise', () => {
  const result = calculateExpenseSplits({
    amountPaise: 10000,
    splitType: 'percent',
    splits: [
      { memberId: 'member-a', value: '33.33' },
      { memberId: 'member-b', value: '33.33' },
      { memberId: 'guest-c', value: '33.34' },
    ],
  });

  assert.deepEqual(result.map((split) => split.sharePaise), [3333, 3333, 3334]);
  assert.equal(totalShares(result), 10000);
});

test('shares split supports positive decimal weights and preserves tie order', () => {
  const result = calculateExpenseSplits({
    amountPaise: 10000,
    splitType: 'shares',
    splits: [
      { memberId: 'member-a', value: '1.0' },
      { memberId: 'member-b', value: '1' },
      { memberId: 'guest-c', value: '1.00' },
    ],
  });

  assert.deepEqual(result.map((split) => split.sharePaise), [3334, 3333, 3333]);
  assert.equal(totalShares(result), 10000);
});

test('the payer may be excluded from the split participants', () => {
  const payerMemberId = 'registered-payer';
  const result = calculateExpenseSplits({
    amountPaise: 12500,
    splitType: 'equal',
    splits: [{ memberId: 'guest-a' }, { memberId: 'guest-b' }],
  });

  test('very large safe-integer totals split without losing paise precision', () => {
    const amountPaise = Number.MAX_SAFE_INTEGER;
    const splits = calculateExpenseSplits({
      amountPaise,
      splitType: 'equal',
      splits: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
    });
    assert.equal(splits.reduce((sum, split) => sum + BigInt(split.sharePaise), 0n), BigInt(amountPaise));
  });

  assert.equal(result.some((split) => split.memberId === payerMemberId), false);
  assert.equal(totalShares(result), 12500);
});

test('split validation requires included members and rejects invalid weights and percentages', () => {
  assert.throws(() => calculateExpenseSplits({
    amountPaise: 100,
    splitType: 'equal',
    splits: [],
  }), /At least one member/);
  assert.throws(() => calculateExpenseSplits({
    amountPaise: 100,
    splitType: 'percent',
    splits: [{ memberId: 'member-a', value: '99.99' }],
  }), /total exactly 100\.00%/);
  assert.throws(() => calculateExpenseSplits({
    amountPaise: 100,
    splitType: 'shares',
    splits: [{ memberId: 'member-a', value: '0' }],
  }), /greater than zero/);
  assert.throws(() => calculateExpenseSplits({
    amountPaise: 100,
    splitType: 'shares',
    splits: [{ memberId: 'member-a', value: '-1' }],
  }), /positive decimal number/);
  assert.throws(() => calculateExpenseSplits({
    amountPaise: 1.5,
    splitType: 'equal',
    splits: [{ memberId: 'member-a' }],
  }), /positive safe integer/);
  assert.throws(() => calculateExpenseSplits({
    amountPaise: 100,
    splitType: 'equal',
    splits: [{ memberId: 'same' }, { memberId: ' same ' }],
  }), /Duplicate split member/);
});
