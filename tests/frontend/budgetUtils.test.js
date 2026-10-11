const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addDateDays,
  formatExactPaise,
  formatWholePaise,
  fromDisplayDate,
  parseInrToPaise,
  toDisplayDate,
  tripDayForDate,
} = require('../../client/src/utils/budgetUtils.js');
const { validateExpenseSplitForm } = require('../../client/src/utils/expenseFormValidation.js');

test('budget form converts rupees with integer paise and formats grouped amounts', () => {
  assert.equal(parseInrToPaise('1234.50'), 123450);
  assert.equal(parseInrToPaise('0.00'), null);
  assert.equal(parseInrToPaise('1.234'), null);
  assert.equal(formatExactPaise(123450), '₹1,234.50');
  assert.equal(formatWholePaise(123450), '₹1,235');
});

test('date-only UI maps display dates and trip days without timezone conversion', () => {
  assert.equal(fromDisplayDate('09-10-2026'), '2026-10-09');
  assert.equal(fromDisplayDate('31-02-2026'), null);
  assert.equal(toDisplayDate('2026-10-09'), '09-10-2026');
  assert.equal(addDateDays('2026-10-09', -1), '2026-10-08');
  assert.equal(tripDayForDate('2026-10-10', '2026-10-09', '2026-10-10'), 2);
  assert.equal(tripDayForDate('2026-10-08', '2026-10-09', '2026-10-10'), 'before');
});

test('drawer allocation validation covers equal, exact, percent, and shares modes', () => {
  const twoMembers = [{ memberId: 'a', value: '0.50' }, { memberId: 'b', value: '0.50' }];
  assert.equal(validateExpenseSplitForm('1.00', 'equal', [{ memberId: 'a' }]).valid, true);
  assert.equal(validateExpenseSplitForm('1.00', 'exact', twoMembers).valid, true);
  assert.equal(validateExpenseSplitForm('1.00', 'exact', [{ memberId: 'a', value: '0.99' }]).valid, false);
  assert.equal(validateExpenseSplitForm('1.00', 'percent', [{ memberId: 'a', value: '33.33' }, { memberId: 'b', value: '66.67' }]).valid, true);
  assert.equal(validateExpenseSplitForm('1.00', 'percent', [{ memberId: 'a', value: '50' }]).valid, false);
  assert.equal(validateExpenseSplitForm('1.00', 'shares', [{ memberId: 'a', value: '1.5' }, { memberId: 'b', value: '2' }]).valid, true);
  assert.equal(validateExpenseSplitForm('1.00', 'shares', [{ memberId: 'a', value: '0' }]).valid, false);
  assert.equal(validateExpenseSplitForm('1.00', 'equal', []).valid, false);
});
