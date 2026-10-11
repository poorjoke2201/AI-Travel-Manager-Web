import { formatExactPaise, parseInrToPaise } from './budgetUtils.js';

function parseScaled(value, precision, allowZero = true) {
  const match = String(value ?? '').trim().match(/^(?:(\d+)(?:\.(\d+))?|\.(\d+))$/);
  if (!match) return null;
  const fraction = match[2] ?? match[3] ?? '';
  if (fraction.length > precision) return null;
  const scaled = BigInt(match[1] || '0') * (10n ** BigInt(precision))
    + BigInt(fraction.padEnd(precision, '0') || '0');
  return allowZero ? scaled : scaled > 0n ? scaled : null;
}

function sumValues(splits, precision, allowZero = true) {
  let total = 0n;
  for (const split of splits) {
    const value = parseScaled(split.value, precision, allowZero);
    if (value === null) return null;
    total += value;
  }
  return total;
}

export function validateExpenseSplitForm(amountInput, splitType, splits) {
  const amountPaise = parseInrToPaise(amountInput);
  if (!amountPaise) return { valid: false, amountPaise: null, error: 'Enter an amount greater than ₹0.00 with no more than two decimal places.', allocationMessage: '' };
  if (!splits.length) return { valid: false, amountPaise, error: 'Include at least one trip member in the split.', allocationMessage: '' };

  if (splitType === 'equal') {
    return { valid: true, amountPaise, error: '', allocationMessage: `Split equally between ${splits.length} member${splits.length === 1 ? '' : 's'}` };
  }
  if (splitType === 'exact') {
    const allocatedPaise = sumValues(splits, 2);
    if (allocatedPaise === null) return { valid: false, amountPaise, error: 'Enter a valid exact amount for every included member.', allocationMessage: '' };
    const remainingPaise = BigInt(amountPaise) - allocatedPaise;
    const allocationMessage = `${formatExactPaise(allocatedPaise)} of ${formatExactPaise(amountPaise)} allocated · ${formatExactPaise(remainingPaise)} left`;
    return {
      valid: remainingPaise === 0n,
      amountPaise,
      error: remainingPaise === 0n ? '' : remainingPaise < 0n ? 'The split exceeds the expense total.' : 'The exact split must equal the expense total.',
      allocationMessage,
    };
  }
  if (splitType === 'percent') {
    const percentTotal = sumValues(splits, 2);
    if (percentTotal === null) return { valid: false, amountPaise, error: 'Enter a valid percentage for every included member.', allocationMessage: '' };
    const allocationMessage = `${percentTotal / 100n}.${String(percentTotal % 100n).padStart(2, '0')}% of 100.00%`;
    return {
      valid: percentTotal === 10000n,
      amountPaise,
      error: percentTotal === 10000n ? '' : 'Percentages must total exactly 100.00%.',
      allocationMessage,
    };
  }
  if (splitType === 'shares') {
    const weightsValid = splits.every((split) => parseScaled(split.value, 29, false) !== null);
    return {
      valid: weightsValid,
      amountPaise,
      error: weightsValid ? '' : 'Enter a positive weight for every included member.',
      allocationMessage: `${splits.length} member${splits.length === 1 ? '' : 's'} included`,
    };
  }
  return { valid: false, amountPaise, error: 'Choose a supported split type.', allocationMessage: '' };
}
