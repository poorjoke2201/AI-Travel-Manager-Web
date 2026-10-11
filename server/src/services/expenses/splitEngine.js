const SPLIT_TYPES = ['equal', 'exact', 'percent', 'shares'];

function parseDecimal(value, maxFractionDigits, label, { allowZero = true } = {}) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError(`${label} must be a decimal number.`);
  }

  const text = String(value).trim();
  const match = text.match(/^(?:(\d+)(?:\.(\d+))?|\.(\d+))$/);
  if (!match) throw new TypeError(`${label} must be a non-negative decimal number.`);

  const whole = match[1] || '0';
  const fraction = match[2] ?? match[3] ?? '';
  if (fraction.length > maxFractionDigits) {
    throw new RangeError(`${label} supports at most ${maxFractionDigits} decimal places.`);
  }

  const scale = 10n ** BigInt(maxFractionDigits);
  const scaled = BigInt(whole) * scale
    + BigInt(fraction.padEnd(maxFractionDigits, '0') || '0');
  if (!allowZero && scaled === 0n) throw new RangeError(`${label} must be greater than zero.`);
  return scaled;
}

function parseSharesWeights(splits) {
  const parsed = splits.map((split) => {
    if (typeof split.value !== 'string' && typeof split.value !== 'number') {
      throw new TypeError(`Share weight for "${split.memberId}" must be a decimal number.`);
    }
    const value = String(split.value).trim();
    const match = value.match(/^(?:(\d+)(?:\.(\d+))?|\.(\d+))$/);
    if (!match) throw new TypeError(`Share weight for "${split.memberId}" must be a positive decimal number.`);
    return { split, whole: match[1] || '0', fraction: match[2] ?? match[3] ?? '' };
  });
  const precision = Math.max(0, ...parsed.map(({ fraction }) => fraction.length));

  return parsed.map(({ split, whole, fraction }) => {
    const weight = BigInt(whole) * (10n ** BigInt(precision))
      + BigInt(fraction.padEnd(precision, '0') || '0');
    if (weight <= 0n) throw new RangeError(`Share weight for "${split.memberId}" must be greater than zero.`);
    return weight;
  });
}

function distributeByLargestRemainder(amountPaise, splits, weights) {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n);
  if (totalWeight <= 0n) throw new RangeError('The total split weight must be greater than zero.');

  const amount = BigInt(amountPaise);
  const allocations = weights.map((weight, index) => {
    const numerator = amount * weight;
    return {
      index,
      sharePaise: numerator / totalWeight,
      remainder: numerator % totalWeight,
    };
  });
  let unallocated = amount - allocations.reduce((sum, allocation) => sum + allocation.sharePaise, 0n);

  allocations
    .slice()
    .sort((left, right) => (
      left.remainder === right.remainder
        ? left.index - right.index
        : left.remainder > right.remainder ? -1 : 1
    ))
    .slice(0, Number(unallocated))
    .forEach(({ index }) => {
      allocations[index].sharePaise += 1n;
      unallocated -= 1n;
    });

  if (unallocated !== 0n) throw new Error('Unable to allocate the full amount.');
  return allocations.map((allocation) => Number(allocation.sharePaise));
}

function calculateExpenseSplits({ amountPaise, splitType, splits }) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new RangeError('amountPaise must be a positive safe integer.');
  }
  if (!SPLIT_TYPES.includes(splitType)) {
    throw new TypeError(`splitType must be one of: ${SPLIT_TYPES.join(', ')}.`);
  }
  if (!Array.isArray(splits) || splits.length === 0) {
    throw new RangeError('At least one member must be included in the split.');
  }

  const memberIds = new Set();
  const normalizedSplits = splits.map((split) => {
    if (!split || typeof split.memberId !== 'string' || !split.memberId.trim()) {
      throw new TypeError('Every split must have a memberId.');
    }
    const memberId = split.memberId.trim();
    if (memberIds.has(memberId)) throw new RangeError(`Duplicate split member "${memberId}".`);
    memberIds.add(memberId);
    return { ...split, memberId };
  });

  let shares;
  if (splitType === 'exact') {
    const exactShares = normalizedSplits.map((split) => parseDecimal(
      split.value,
      2,
      `Exact amount for "${split.memberId}"`
    ));
    if (exactShares.reduce((sum, share) => sum + share, 0n) !== BigInt(amountPaise)) {
      throw new RangeError('Exact split amounts must sum to amountPaise.');
    }
    if (exactShares.some((share) => share > BigInt(Number.MAX_SAFE_INTEGER))) {
      throw new RangeError('An exact share exceeds the supported safe-integer range.');
    }
    shares = exactShares.map(Number);
  } else {
    let weights;
    if (splitType === 'equal') {
      weights = normalizedSplits.map(() => 1n);
    } else if (splitType === 'percent') {
      weights = normalizedSplits.map((split) => parseDecimal(
        split.value,
        2,
        `Percentage for "${split.memberId}"`
      ));
      if (weights.reduce((sum, weight) => sum + weight, 0n) !== 10000n) {
        throw new RangeError('Percent split values must total exactly 100.00%.');
      }
    } else {
      weights = parseSharesWeights(normalizedSplits);
    }
    shares = distributeByLargestRemainder(amountPaise, normalizedSplits, weights);
  }

  return normalizedSplits.map((split, index) => ({
    memberId: split.memberId,
    value: splitType === 'equal' ? null : String(split.value).trim(),
    sharePaise: shares[index],
  }));
}

module.exports = { SPLIT_TYPES, calculateExpenseSplits };
