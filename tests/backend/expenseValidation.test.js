const test = require('node:test');
const assert = require('node:assert/strict');
const {
  expenseCreateSchema,
  expenseSplitPreviewSchema,
  expenseUpdateSchema,
  expenseListQuerySchema,
  settlementCreateSchema,
} = require('../../server/src/validators/expense.validator');

const memberId = '507f1f77bcf86cd799439011';

test('expense validation requires safe integer paise and valid date-only inputs', () => {
  const valid = {
    amountPaise: 12550,
    category: 'food',
    date: '2026-10-09',
    paidBy: memberId,
    paymentMethod: 'UPI',
    splitType: 'equal',
    splits: [{ memberId }],
  };
  assert.equal(expenseCreateSchema.safeParse(valid).success, true);
  assert.equal(expenseCreateSchema.safeParse({ ...valid, receipt: memberId }).success, true);
  assert.equal(expenseCreateSchema.safeParse({ ...valid, receipt: 'data:image/png;base64,AAAA' }).success, false);
  assert.equal(expenseCreateSchema.safeParse({ ...valid, amountPaise: 1.5 }).success, false);
  assert.equal(expenseCreateSchema.safeParse({ ...valid, amountPaise: Number.MAX_SAFE_INTEGER + 1 }).success, false);
  assert.equal(expenseCreateSchema.safeParse({ ...valid, date: '2026-02-30' }).success, false);
});

test('expense split preview and partial update validators reject empty or malformed data', () => {
  assert.equal(expenseSplitPreviewSchema.safeParse({
    amountPaise: 100,
    splitType: 'exact',
    splits: [{ memberId, value: '1.00' }],
  }).success, true);
  assert.equal(expenseSplitPreviewSchema.safeParse({
    amountPaise: 100,
    splitType: 'unknown',
    splits: [{ memberId }],
  }).success, false);
  assert.equal(expenseUpdateSchema.safeParse({}).success, false);
  assert.equal(expenseUpdateSchema.safeParse({ amountPaise: 200 }).success, true);
});

test('settlement validation enforces paise, supported methods, and valid dates', () => {
  const valid = {
    fromMember: memberId,
    toMember: '507f1f77bcf86cd799439012',
    amountPaise: 250,
    date: '2026-10-09',
    method: 'Cash',
  };
  assert.equal(settlementCreateSchema.safeParse(valid).success, true);
  assert.equal(settlementCreateSchema.safeParse({ ...valid, amountPaise: 0 }).success, false);
  assert.equal(settlementCreateSchema.safeParse({ ...valid, method: 'Bitcoin' }).success, false);
});

test('expense list validates date ranges and supports all required filters', () => {
  assert.equal(expenseListQuerySchema.safeParse({
    day: '2',
    category: 'food',
    personId: memberId,
    paymentMethod: 'UPI',
    search: 'ticket',
    groupByDay: 'true',
    from: '2026-10-01',
    to: '2026-10-31',
  }).success, true);
  assert.equal(expenseListQuerySchema.safeParse({ from: '2026-10-31', to: '2026-10-01' }).success, false);
  assert.equal(expenseListQuerySchema.safeParse({ groupByDay: 'anything' }).success, false);
});
