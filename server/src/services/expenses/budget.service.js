const Expense = require('../../models/Expense');
const Receipt = require('../../models/Receipt');
const Settlement = require('../../models/Settlement');
const Trip = require('../../models/Trip');
const ApiError = require('../../utils/apiError');
const { isValidDateOnly, normalizeDateOnly } = require('../../utils/dateOnly');
const { calculateExpenseSplits } = require('./splitEngine');
const receiptStorage = require('./receiptStorage.service');

const CATEGORIES = ['transport', 'accommodation', 'food', 'activities', 'shopping', 'miscellaneous'];
const PAYMENT_METHODS = ['UPI', 'Cash', 'Card', 'Net banking', 'Other'];

function normalizePhoneNumber(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^\d+]/g, '');
  if (!cleaned || (cleaned.length < 8 && !cleaned.startsWith('+'))) return null;
  return cleaned.startsWith('+') ? `+${cleaned.replace(/\+/g, '')}` : cleaned;
}

function inrToPaise(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return 0;
  const fraction = match[2] || '';
  const roundedFraction = BigInt((fraction.slice(0, 2).padEnd(2, '0')) || '0')
    + (fraction[2] && fraction[2] >= '5' ? 1n : 0n);
  const paise = BigInt(match[1]) * 100n + roundedFraction;
  return paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) : 0;
}

function formatPaise(value) {
  const paise = BigInt(value);
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  const rupees = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `₹${negative ? '-' : ''}${rupees}.${fraction}`;
}

function addPaise(total, amount) {
  const result = BigInt(total) + BigInt(amount);
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw ApiError.conflict('The aggregated money total exceeds the supported safe-integer range.');
  }
  return Number(result);
}

function subtractPaise(left, right) {
  const result = BigInt(left) - BigInt(right);
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw ApiError.conflict('The aggregated money difference exceeds the supported safe-integer range.');
  }
  return Number(result);
}

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === 'string' ? normalizeDateOnly(value) : null;
}

function getTripDayCount(trip) {
  const start = dateOnly(trip.startDate);
  const end = dateOnly(trip.endDate);
  if (!isValidDateOnly(start) || !isValidDateOnly(end) || end < start) return 0;
  const startUtc = Date.parse(`${start}T00:00:00.000Z`);
  const endUtc = Date.parse(`${end}T00:00:00.000Z`);
  return Math.floor((endUtc - startUtc) / 86_400_000) + 1;
}

function getTripDay(date, trip) {
  const cleanDate = dateOnly(date);
  const start = dateOnly(trip.startDate);
  const tripDays = getTripDayCount(trip);
  if (!isValidDateOnly(cleanDate) || !isValidDateOnly(start) || !tripDays) {
    return { day: null, dayLabel: 'Date unavailable', period: 'unknown' };
  }
  const offset = Math.floor((Date.parse(`${cleanDate}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000);
  if (offset < 0) return { day: null, dayLabel: 'Before trip', period: 'before' };
  if (offset >= tripDays) return { day: null, dayLabel: 'After trip', period: 'after' };
  return { day: offset + 1, dayLabel: `Day ${offset + 1}`, period: 'trip' };
}

function categoryPlan(trip) {
  const summary = trip.budgetSummary || {};
  const total = inrToPaise(trip.budget || summary.totalEstimatedInr || 0);
  const activityCost = (trip.itinerary || []).flatMap((day) => day.activities || [])
    .reduce((sum, activity) => addPaise(sum, inrToPaise(activity.estimatedCostInr || 0)), 0);
  const planned = {
    transport: addPaise(inrToPaise(summary.intercityInr || 0), inrToPaise(summary.intracityInr || 0)),
    accommodation: inrToPaise(summary.accommodationInr || 0),
    food: inrToPaise(summary.foodInr || 0),
    activities: activityCost,
    shopping: 0,
    miscellaneous: 0,
  };
  const assigned = Object.values(planned).reduce((sum, amount) => addPaise(sum, amount), 0);
  planned.miscellaneous = Math.max(0, subtractPaise(total, assigned));
  return planned;
}

function memberIdentity(member) {
  if (member?.userId) return String(member.userId);
  return member?._id ? String(member._id) : null;
}

function getTripMembers(trip) {
  const members = [];
  const seen = new Set();
  const add = (member) => {
    const memberId = memberIdentity(member);
    if (!memberId || seen.has(memberId)) return;
    seen.add(memberId);
    members.push({
      memberId,
      name: member.name || (member.role === 'owner' ? 'Trip lead' : null) || member.phoneNumber || 'Traveller',
      role: member.role || 'member',
      status: member.status || 'accepted',
      userId: member.userId ? String(member.userId) : null,
      phoneNumber: member.phoneNumber || null,
    });
  };

  if (trip.userId) add({ userId: trip.userId, name: 'Trip lead', role: 'owner', status: 'accepted' });
  for (const member of trip.groupMembers || []) {
    if (member?.status === 'accepted') add(member);
  }
  return members;
}

async function getOwnedTrip(userId, tripId) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw ApiError.notFound('Trip not found.');
  const currentUserId = String(userId);
  const isOwner = String(trip.userId) === currentUserId;
  const isAcceptedMember = (trip.groupMembers || []).some(
    (member) => member.status === 'accepted' && String(member.userId || '') === currentUserId
  );
  if (!isOwner && !isAcceptedMember) {
    throw ApiError.forbidden('You do not have access to this trip.');
  }
  return trip;
}

function assertTripMember(trip, memberId, fieldName) {
  if (!getTripMembers(trip).some((member) => member.memberId === String(memberId))) {
    throw ApiError.badRequest(`${fieldName} must refer to the trip lead or an accepted trip member.`);
  }
}

function splitExpense(expense) {
  try {
    return calculateExpenseSplits({
      amountPaise: expense.amountPaise,
      splitType: expense.splitType || 'equal',
      splits: expense.splits,
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
}

function toLegacyPaise(value, label) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw ApiError.conflict(`A legacy expense has an invalid ${label}; it must be migrated manually.`);
  }
  const text = String(value).trim();
  const match = text.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw ApiError.conflict(`A legacy expense has an invalid ${label}; it must be migrated manually.`);
  const paise = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0');
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw ApiError.conflict(`A legacy expense ${label} exceeds the supported amount range.`);
  }
  return Number(paise);
}

function legacyMemberId(trip, value) {
  const id = String(value ?? '');
  const members = getTripMembers(trip);
  const exactMatch = members.find((member) => member.memberId === id || member.userId === id);
  if (exactMatch) return exactMatch.memberId;
  const phone = normalizePhoneNumber(id.replace(/^phone:/, ''));
  if (phone) {
    const phoneMatch = (trip.groupMembers || []).find(
      (member) => member.status === 'accepted' && normalizePhoneNumber(member.phoneNumber) === phone
    );
    if (phoneMatch?._id) return String(phoneMatch._id);
  }
  return id;
}

function migrateLegacyExpense(raw, trip) {
  const amountPaise = toLegacyPaise(raw.amount, 'amount');
  const category = CATEGORIES.includes(raw.category) ? raw.category : null;
  if (!category) throw ApiError.conflict('A legacy expense has an unsupported category and must be migrated manually.');

  const date = normalizeDateOnly(raw.date || raw.createdAt);
  if (!isValidDateOnly(date)) throw ApiError.conflict('A legacy expense has an invalid date and must be migrated manually.');

  const legacyPayer = raw.payerId || raw.userId || trip.userId;
  const paidBy = legacyMemberId(trip, legacyPayer);
  const oldParticipants = Array.isArray(raw.participants) && raw.participants.length
    ? raw.participants
    : [legacyPayer];
  const splitsByMember = new Map();
  for (const oldId of oldParticipants) {
    const memberId = legacyMemberId(trip, oldId);
    if (!memberId) continue;
    splitsByMember.set(memberId, memberId);
  }
  const splitMembers = Array.from(splitsByMember.keys());
  if (!splitMembers.length) splitMembers.push(paidBy);

  let splitType = 'equal';
  let splits = splitMembers.map((memberId) => ({ memberId }));
  if (raw.splitType === 'custom') {
    splitType = 'exact';
    splits = splitMembers.map((memberId) => ({
      memberId,
      value: String(raw.customAmounts?.[memberId] ?? raw.customAmounts?.[oldParticipants.find((id) => legacyMemberId(trip, id) === memberId)] ?? '0'),
    }));
  } else if (raw.splitType === 'percentage') {
    splitType = 'percent';
    splits = splitMembers.map((memberId) => ({
      memberId,
      value: String(raw.percentages?.[memberId] ?? raw.percentages?.[oldParticipants.find((id) => legacyMemberId(trip, id) === memberId)] ?? '0'),
    }));
  }

  try {
    splits = calculateExpenseSplits({ amountPaise, splitType, splits });
  } catch (error) {
    throw ApiError.conflict(`A legacy expense cannot be converted automatically: ${error.message}`);
  }
  const method = PAYMENT_METHODS.includes(raw.paymentMethod) ? raw.paymentMethod : 'Other';
  const createdBy = raw.createdBy || raw.userId || trip.userId;
  if (!createdBy) throw ApiError.conflict('A legacy expense has no creator and must be migrated manually.');
  const migrated = {
    tripId: raw.tripId,
    amountPaise,
    category,
    description: raw.description || null,
    date,
    paidBy,
    paymentMethod: method,
    splitType,
    splits,
    receipt: raw.receipt || raw.billImage || null,
    createdBy,
  };
  return migrated;
}

async function migrateLegacyExpenses(trip) {
  const legacyExpenses = await Expense.collection.find({
    tripId: trip._id,
    amountPaise: { $exists: false },
    amount: { $exists: true },
  }).toArray();
  for (const raw of legacyExpenses) {
    const migrated = migrateLegacyExpense(raw, trip);
    const { tripId, createdBy, ...fields } = migrated;
    await Expense.collection.updateOne(
      { _id: raw._id, amountPaise: { $exists: false } },
      {
        $set: { ...fields, tripId, createdBy },
        $unset: {
          amount: '',
          userId: '',
          payerId: '',
          participants: '',
          customAmounts: '',
          percentages: '',
          isGroupExpense: '',
          billImage: '',
        },
      }
    );
  }
}

function computeGroupBalances(trip, expenses, settlements = []) {
  const members = getTripMembers(trip);
  const byId = new Map(members.map((member) => [member.memberId, member]));
  const totals = new Map(members.map((member) => [member.memberId, 0]));

  for (const expense of expenses) {
    const payerId = String(expense.paidBy);
    const amountPaise = Number(expense.amountPaise) || 0;
    totals.set(payerId, addPaise(totals.get(payerId) || 0, amountPaise));
    for (const split of expense.splits || []) {
      const memberId = String(split.memberId);
      totals.set(memberId, subtractPaise(totals.get(memberId) || 0, Number(split.sharePaise) || 0));
      if (!byId.has(memberId)) byId.set(memberId, { memberId, name: 'Traveller', role: 'member' });
    }
    if (!byId.has(payerId)) byId.set(payerId, { memberId: payerId, name: 'Traveller', role: 'member' });
  }
  for (const settlement of settlements) {
    const fromMember = String(settlement.fromMember);
    const toMember = String(settlement.toMember);
    const amountPaise = Number(settlement.amountPaise) || 0;
    totals.set(fromMember, addPaise(totals.get(fromMember) || 0, amountPaise));
    totals.set(toMember, subtractPaise(totals.get(toMember) || 0, amountPaise));
  }

  return Array.from(totals.entries())
    .map(([memberId, netPaise]) => {
      const member = byId.get(memberId);
      return {
        memberId,
        userId: member?.userId || memberId,
        netPaise,
        name: member?.name || 'Traveller',
        role: member?.role || 'member',
      };
    })
    .filter((entry) => entry.netPaise !== 0)
    .sort((left, right) => right.netPaise - left.netPaise);
}

function suggestSettlements(balances) {
  const creditors = balances.filter((entry) => entry.netPaise > 0)
    .map((entry) => ({ memberId: entry.memberId, name: entry.name, remaining: entry.netPaise }))
    .sort((left, right) => right.remaining - left.remaining);
  const debtors = balances.filter((entry) => entry.netPaise < 0)
    .map((entry) => ({ memberId: entry.memberId, name: entry.name, remaining: -entry.netPaise }))
    .sort((left, right) => right.remaining - left.remaining);
  const suggestions = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountPaise = Math.min(debtor.remaining, creditor.remaining);
    if (amountPaise > 0) {
      suggestions.push({
        fromMember: debtor.memberId,
        fromName: debtor.name,
        toMember: creditor.memberId,
        toName: creditor.name,
        amountPaise,
      });
    }
    debtor.remaining -= amountPaise;
    creditor.remaining -= amountPaise;
    if (!debtor.remaining) debtorIndex += 1;
    if (!creditor.remaining) creditorIndex += 1;
  }
  return suggestions;
}

function buildExpenseFilter(tripId, filters = {}) {
  const query = { tripId };
  if (filters.category) query.category = filters.category;
  if (filters.paymentMethod) query.paymentMethod = filters.paymentMethod;
  if (filters.from || filters.to) {
    query.date = {};
    if (filters.from) query.date.$gte = filters.from;
    if (filters.to) query.date.$lte = filters.to;
  }
  const memberId = filters.personId || filters.memberId;
  if (memberId) query.$or = [{ 'splits.memberId': memberId }, { paidBy: memberId }];
  return query;
}

function filterByTripDay(expenses, trip, selectedDay) {
  if (selectedDay === undefined || selectedDay === '') return expenses;
  return expenses.filter((expense) => {
    const info = getTripDay(expense.date, trip);
    if (selectedDay === 'before' || selectedDay === 'after') return info.period === selectedDay;
    return info.day === Number(selectedDay);
  });
}

function decorateExpense(expense, trip, userId) {
  const memberNames = new Map(getTripMembers(trip).map((member) => [member.memberId, member.name]));
  const dayInfo = getTripDay(expense.date, trip);
  const creatorId = String(expense.createdBy?._id || expense.createdBy || '');
  return {
    ...expense,
    createdBy: creatorId,
    day: dayInfo.day,
    dayLabel: dayInfo.dayLabel,
    paidByName: memberNames.get(String(expense.paidBy)) || 'Traveller',
    addedByName: expense.createdBy?.username || (creatorId === String(trip.userId) ? 'Trip lead' : 'Trip member'),
    editable: String(trip.userId) === String(userId) || creatorId === String(userId),
  };
}

function decorateSettlement(settlement, trip, userId) {
  const members = new Map(getTripMembers(trip).map((member) => [member.memberId, member.name]));
  const creatorId = String(settlement.createdBy?._id || settlement.createdBy || '');
  return {
    ...settlement,
    createdBy: creatorId,
    fromMemberName: members.get(String(settlement.fromMember)) || 'Former trip member',
    toMemberName: members.get(String(settlement.toMember)) || 'Former trip member',
    addedByName: settlement.createdBy?.username || (creatorId === String(trip.userId) ? 'Trip lead' : 'Trip member'),
    editable: String(trip.userId) === String(userId) || creatorId === String(userId),
  };
}

async function listExpenses(userId, tripId, filters = {}) {
  const trip = await getOwnedTrip(userId, tripId);
  await migrateLegacyExpenses(trip);
  let expenses = await Expense.find(buildExpenseFilter(trip._id, filters))
    .populate('createdBy', 'username')
    .sort({ date: -1, createdAt: -1 })
    .lean();
  expenses = filterByTripDay(expenses, trip, filters.day);
  if (filters.search) {
    const search = filters.search.toLocaleLowerCase();
    expenses = expenses.filter((expense) => String(expense.description || '').toLocaleLowerCase().includes(search));
  }
  const decorated = expenses.map((expense) => decorateExpense(expense, trip, userId));
  if (!filters.groupByDay) return decorated;
  const groups = new Map();
  for (const expense of decorated) {
    const key = expense.date;
    if (!groups.has(key)) {
      groups.set(key, {
        date: expense.date,
        day: expense.day,
        dayLabel: expense.day === null ? `${expense.dayLabel} · ${expense.date}` : expense.dayLabel,
        totalPaise: 0,
        expenses: [],
      });
    }
    const group = groups.get(key);
    group.totalPaise += expense.amountPaise;
    group.expenses.push(expense);
  }
  return Array.from(groups.values()).sort((left, right) => right.date.localeCompare(left.date));
}

function buildBudgetAggregation(trip, expenses, settlements) {
  const tripDays = getTripDayCount(trip);
  const plannedByCategory = categoryPlan(trip);
  const totalBudgetPaise = inrToPaise(trip.budget || trip.budgetSummary?.totalEstimatedInr || 0);
  const spentPaise = expenses.reduce((sum, expense) => addPaise(sum, expense.amountPaise), 0);
  const remainingPaise = subtractPaise(totalBudgetPaise, spentPaise);
  const dailyBudgetPaise = tripDays ? Math.floor(totalBudgetPaise / tripDays) : 0;
  const spentByCategory = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  const perDayByKey = new Map();
  const peopleById = new Map(getTripMembers(trip).map((member) => [member.memberId, {
    ...member,
    paidPaise: 0,
    sharePaise: 0,
    settlementsPaidPaise: 0,
    settlementsReceivedPaise: 0,
    categorySharePaise: Object.fromEntries(CATEGORIES.map((category) => [category, 0])),
    daySharePaise: {},
  }]));

  const getPerson = (memberId) => {
    const id = String(memberId);
    if (!peopleById.has(id)) {
      peopleById.set(id, {
        memberId: id,
        name: 'Former trip member',
        role: 'member',
        paidPaise: 0,
        sharePaise: 0,
        settlementsPaidPaise: 0,
        settlementsReceivedPaise: 0,
        categorySharePaise: Object.fromEntries(CATEGORIES.map((category) => [category, 0])),
        daySharePaise: {},
      });
    }
    return peopleById.get(id);
  };

  for (const expense of expenses) {
    const amountPaise = expense.amountPaise;
    spentByCategory[expense.category] = addPaise(spentByCategory[expense.category], amountPaise);
    const payer = getPerson(expense.paidBy);
    payer.paidPaise = addPaise(payer.paidPaise, amountPaise);
    const dayInfo = getTripDay(expense.date, trip);
    const dayKey = `${dayInfo.period}:${dayInfo.day ?? expense.date}`;
    if (!perDayByKey.has(dayKey)) {
      perDayByKey.set(dayKey, {
        day: dayInfo.day,
        date: dayInfo.day === null ? expense.date : new Date(Date.parse(`${dateOnly(trip.startDate)}T00:00:00.000Z`) + ((dayInfo.day - 1) * 86_400_000)).toISOString().slice(0, 10),
        dayLabel: dayInfo.day === null ? `${dayInfo.dayLabel} · ${expense.date}` : dayInfo.dayLabel,
        totalPaise: 0,
        expensesCount: 0,
        byCategoryPaise: Object.fromEntries(CATEGORIES.map((category) => [category, 0])),
        byMemberPaise: {},
      });
    }
    const dayTotals = perDayByKey.get(dayKey);
    dayTotals.totalPaise = addPaise(dayTotals.totalPaise, amountPaise);
    dayTotals.expensesCount += 1;
    dayTotals.byCategoryPaise[expense.category] = addPaise(dayTotals.byCategoryPaise[expense.category], amountPaise);
    for (const split of expense.splits || []) {
      const person = getPerson(split.memberId);
      person.sharePaise = addPaise(person.sharePaise, split.sharePaise);
      person.categorySharePaise[expense.category] = addPaise(person.categorySharePaise[expense.category], split.sharePaise);
      person.daySharePaise[dayKey] = addPaise(person.daySharePaise[dayKey] || 0, split.sharePaise);
      dayTotals.byMemberPaise[String(split.memberId)] = addPaise(dayTotals.byMemberPaise[String(split.memberId)] || 0, split.sharePaise);
    }
  }

  for (const settlement of settlements) {
    const fromPerson = getPerson(settlement.fromMember);
    fromPerson.settlementsPaidPaise = addPaise(fromPerson.settlementsPaidPaise, settlement.amountPaise);
    const toPerson = getPerson(settlement.toMember);
    toPerson.settlementsReceivedPaise = addPaise(toPerson.settlementsReceivedPaise, settlement.amountPaise);
  }

  const categories = CATEGORIES.map((category) => {
    const plannedPaise = plannedByCategory[category];
    const actualPaise = spentByCategory[category];
    const remaining = subtractPaise(plannedPaise, actualPaise);
    return {
      category,
      plannedPaise,
      actualPaise,
      remainingPaise: remaining,
      progressPct: plannedPaise ? Math.round((actualPaise / plannedPaise) * 100) : actualPaise ? 100 : 0,
    };
  });
  const perPerson = Array.from(peopleById.values()).map((person) => {
    const balancePaise = subtractPaise(
      addPaise(subtractPaise(person.paidPaise, person.sharePaise), person.settlementsPaidPaise),
      person.settlementsReceivedPaise
    );
    return {
      ...person,
      balancePaise,
      paid: person.paidPaise,
      share: person.sharePaise,
      balance: balancePaise,
    };
  });
  const perDay = [];
  for (let day = 1; day <= tripDays; day += 1) {
    const start = dateOnly(trip.startDate);
    const date = new Date(Date.parse(`${start}T00:00:00.000Z`) + ((day - 1) * 86_400_000)).toISOString().slice(0, 10);
    const saved = perDayByKey.get(`trip:${day}`);
    perDay.push(saved || {
      day,
      date,
      dayLabel: `Day ${day}`,
      totalPaise: 0,
      expensesCount: 0,
      byCategoryPaise: Object.fromEntries(CATEGORIES.map((category) => [category, 0])),
      byMemberPaise: {},
    });
  }
  perDay.push(...Array.from(perDayByKey.entries())
    .filter(([key]) => !key.startsWith('trip:'))
    .map(([, value]) => value)
    .sort((left, right) => right.date.localeCompare(left.date)));
  const balances = perPerson.map((person) => ({
    memberId: person.memberId,
    userId: person.userId || person.memberId,
    name: person.name,
    role: person.role,
    paidPaise: person.paidPaise,
    sharePaise: person.sharePaise,
    balancePaise: person.balancePaise,
    netPaise: person.balancePaise,
  })).filter((member) => member.balancePaise !== 0).sort((left, right) => right.balancePaise - left.balancePaise);

  return {
    totalBudget: totalBudgetPaise,
    totalBudgetPaise,
    spent: spentPaise,
    spentPaise,
    remaining: remainingPaise,
    remainingPaise,
    tripDays,
    dailyBudget: dailyBudgetPaise,
    dailyBudgetPaise,
    progressPct: totalBudgetPaise ? Math.round((spentPaise / totalBudgetPaise) * 100) : 0,
    categories,
    perCategory: categories,
    perDay,
    perPerson,
    balances,
    suggestedSettlements: trip.isGroupTrip ? suggestSettlements(balances.map((entry) => ({
      memberId: entry.memberId, name: entry.name, netPaise: entry.balancePaise,
    }))) : [],
    settlements,
  };
}

async function getBudget(userId, tripId) {
  const trip = await getOwnedTrip(userId, tripId);
  await migrateLegacyExpenses(trip);
  const [expenses, settlements] = await Promise.all([
    Expense.find({ tripId: trip._id }).populate('createdBy', 'username').sort({ date: -1, createdAt: -1 }).lean(),
    Settlement.find({ tripId: trip._id }).populate('createdBy', 'username').sort({ date: -1, createdAt: -1 }).lean(),
  ]);
  const aggregation = buildBudgetAggregation(trip, expenses, settlements);
  const decoratedExpenses = expenses.map((expense) => decorateExpense(expense, trip, userId));
  const decoratedSettlements = settlements.map((settlement) => decorateSettlement(settlement, trip, userId));
  return {
    tripId: trip._id,
    tripName: trip.tripName,
    destination: trip.destination,
    startDate: dateOnly(trip.startDate),
    endDate: dateOnly(trip.endDate),
    tripOwnerId: String(trip.userId),
    currentUserId: String(userId),
    ...aggregation,
    status: aggregation.spentPaise === 0 ? 'none' : aggregation.remainingPaise < 0 ? 'over' : aggregation.progressPct >= 80 ? 'approaching' : 'on-track',
    members: getTripMembers(trip),
    expenses: decoratedExpenses,
    settlements: decoratedSettlements,
  };
}

async function addExpense(userId, tripId, payload) {
  const trip = await getOwnedTrip(userId, tripId);
  await migrateLegacyExpenses(trip);
  await receiptStorage.assertReceiptBelongsToTrip(trip._id, payload.receipt);
  assertTripMember(trip, payload.paidBy, 'paidBy');
  for (const split of payload.splits) assertTripMember(trip, split.memberId, 'split member');
  const splits = splitExpense(payload);
  return Expense.create({
    ...payload,
    tripId: trip._id,
    splits,
    createdBy: userId,
  });
}

async function previewExpenseSplit(userId, tripId, payload) {
  const trip = await getOwnedTrip(userId, tripId);
  for (const split of payload.splits) assertTripMember(trip, split.memberId, 'split member');
  return { splits: splitExpense(payload) };
}

async function getBalances(userId, tripId) {
  const budget = await getBudget(userId, tripId);
  return {
    tripId: budget.tripId,
    totalBudgetPaise: budget.totalBudgetPaise,
    spentPaise: budget.spentPaise,
    remainingPaise: budget.remainingPaise,
    perPerson: budget.perPerson,
    balances: budget.balances,
    suggestedSettlements: budget.suggestedSettlements,
    settlements: budget.settlements,
  };
}

function canManageRecord(userId, trip, record) {
  return String(trip.userId) === String(userId) || String(record.createdBy) === String(userId);
}

async function updateExpense(userId, expenseId, updates) {
  let expense = await Expense.findById(expenseId);
  if (!expense) throw ApiError.notFound('Expense not found.');
  const trip = await getOwnedTrip(userId, expense.tripId);
  await migrateLegacyExpenses(trip);
  expense = await Expense.findById(expenseId);
  if (!expense) throw ApiError.notFound('Expense not found.');
  if (!canManageRecord(userId, trip, expense)) throw ApiError.forbidden('Only the expense creator or trip lead can edit this expense.');

  const combined = {
    amountPaise: updates.amountPaise ?? expense.amountPaise,
    category: updates.category ?? expense.category,
    description: updates.description === undefined ? expense.description : updates.description,
    date: updates.date ?? expense.date,
    paidBy: updates.paidBy ?? expense.paidBy,
    paymentMethod: updates.paymentMethod ?? expense.paymentMethod,
    splitType: updates.splitType ?? expense.splitType,
    splits: updates.splits ?? expense.splits.map((split) => ({ memberId: split.memberId, value: split.value })),
    receipt: updates.receipt === undefined ? expense.receipt : updates.receipt,
  };
  const previousReceipt = expense.receipt;
  await receiptStorage.assertReceiptBelongsToTrip(trip._id, combined.receipt);
  assertTripMember(trip, combined.paidBy, 'paidBy');
  for (const split of combined.splits) assertTripMember(trip, split.memberId, 'split member');
  combined.splits = splitExpense(combined);
  Object.assign(expense, combined);
  await expense.save();
  if (String(previousReceipt || '') !== String(expense.receipt || '')) {
    await receiptStorage.deleteReceiptIfUnused(trip._id, previousReceipt);
  }
  return expense;
}

async function deleteExpense(userId, expenseId) {
  let expense = await Expense.findById(expenseId);
  if (!expense) throw ApiError.notFound('Expense not found.');
  const trip = await getOwnedTrip(userId, expense.tripId);
  await migrateLegacyExpenses(trip);
  expense = await Expense.findById(expenseId);
  if (!expense) throw ApiError.notFound('Expense not found.');
  if (!canManageRecord(userId, trip, expense)) throw ApiError.forbidden('Only the expense creator or trip lead can delete this expense.');
  const receiptId = expense.receipt;
  await expense.deleteOne();
  await receiptStorage.deleteReceiptIfUnused(trip._id, receiptId);
}

async function listSettlements(userId, tripId) {
  const trip = await getOwnedTrip(userId, tripId);
  const settlements = await Settlement.find({ tripId: trip._id })
    .populate('createdBy', 'username')
    .sort({ date: -1, createdAt: -1 })
    .lean();
  return settlements.map((settlement) => decorateSettlement(settlement, trip, userId));
}

async function addSettlement(userId, tripId, payload) {
  const trip = await getOwnedTrip(userId, tripId);
  if (!trip.isGroupTrip) throw ApiError.badRequest('Settlements are available only for group trips.');
  assertTripMember(trip, payload.fromMember, 'fromMember');
  assertTripMember(trip, payload.toMember, 'toMember');
  if (payload.fromMember === payload.toMember) throw ApiError.badRequest('A member cannot settle a balance with themself.');
  return Settlement.create({ ...payload, tripId: trip._id, createdBy: userId });
}

async function updateSettlement(userId, settlementId, updates) {
  const settlement = await Settlement.findById(settlementId);
  if (!settlement) throw ApiError.notFound('Settlement not found.');
  const trip = await getOwnedTrip(userId, settlement.tripId);
  if (!canManageRecord(userId, trip, settlement)) throw ApiError.forbidden('Only the settlement creator or trip lead can edit this settlement.');
  const combined = {
    fromMember: updates.fromMember ?? settlement.fromMember,
    toMember: updates.toMember ?? settlement.toMember,
    amountPaise: updates.amountPaise ?? settlement.amountPaise,
    date: updates.date ?? settlement.date,
    method: updates.method ?? settlement.method,
    note: updates.note === undefined ? settlement.note : updates.note,
  };
  assertTripMember(trip, combined.fromMember, 'fromMember');
  assertTripMember(trip, combined.toMember, 'toMember');
  if (combined.fromMember === combined.toMember) throw ApiError.badRequest('A member cannot settle a balance with themself.');
  Object.assign(settlement, combined);
  await settlement.save();
  return settlement;
}

async function deleteSettlement(userId, settlementId) {
  const settlement = await Settlement.findById(settlementId);
  if (!settlement) throw ApiError.notFound('Settlement not found.');
  const trip = await getOwnedTrip(userId, settlement.tripId);
  if (!canManageRecord(userId, trip, settlement)) throw ApiError.forbidden('Only the settlement creator or trip lead can delete this settlement.');
  await settlement.deleteOne();
}

async function getTripExpenseReport(userId, tripId, filters = {}) {
  const trip = await getOwnedTrip(userId, tripId);
  await migrateLegacyExpenses(trip);
  let expenses = await Expense.find({ tripId: trip._id }).sort({ date: -1, createdAt: -1 }).lean();
  let settlements = await Settlement.find({ tripId: trip._id }).sort({ date: -1, createdAt: -1 }).lean();
  expenses = expenses.filter((expense) => {
    if (filters.from && expense.date < filters.from) return false;
    if (filters.to && expense.date > filters.to) return false;
    if (filters.category && expense.category !== filters.category) return false;
    if (filters.paymentMethod && expense.paymentMethod !== filters.paymentMethod) return false;
    if (filters.day !== undefined) {
      const dayInfo = getTripDay(expense.date, trip);
      if (filters.day === 'before' || filters.day === 'after') {
        if (dayInfo.period !== filters.day) return false;
      } else if (dayInfo.day !== Number(filters.day)) return false;
    }
    if (filters.personId && String(expense.paidBy) !== filters.personId
      && !(expense.splits || []).some((split) => String(split.memberId) === filters.personId)) return false;
    return true;
  });
  settlements = settlements.filter((settlement) => {
    if (filters.category) return false;
    if (filters.from && settlement.date < filters.from) return false;
    if (filters.to && settlement.date > filters.to) return false;
    if (filters.paymentMethod && settlement.method !== filters.paymentMethod) return false;
    if (filters.day !== undefined) {
      const dayInfo = getTripDay(settlement.date, trip);
      if (filters.day === 'before' || filters.day === 'after') {
        if (dayInfo.period !== filters.day) return false;
      } else if (dayInfo.day !== Number(filters.day)) return false;
    }
    if (filters.personId && String(settlement.fromMember) !== filters.personId
      && String(settlement.toMember) !== filters.personId) return false;
    return true;
  });
  if (!expenses.length && (!settlements.length || filters.type === 'category' || filters.type === 'day')) {
    throw ApiError.notFound('No expenses or settlements match the requested report filters.');
  }
  const receiptIds = expenses.map((expense) => String(expense.receipt || ''))
    .filter((receiptId) => /^[a-f\d]{24}$/i.test(receiptId));
  const receipts = receiptIds.length
    ? await Receipt.find({ _id: { $in: receiptIds }, tripId: trip._id }).lean()
    : [];
  const receiptsById = new Map(receipts.map((receipt) => [String(receipt._id), receipt]));
  const receiptImages = [];
  for (const expense of expenses) {
    const receipt = receiptsById.get(String(expense.receipt || ''));
    if (!receipt) continue;
    receiptImages.push({
      date: expense.date,
      description: expense.description,
      dataUri: await receiptStorage.receiptDataUri({
        ...receipt,
        path: receiptStorage.receiptFilePath(receipt.filename),
      }),
    });
  }
  return {
    trip,
    expenses,
    settlements,
    receiptImages,
    aggregation: buildBudgetAggregation(trip, expenses, settlements),
  };
}

async function getBudgetInsights(userId, tripId) {
  const budget = await getBudget(userId, tripId);
  const overBudget = budget.categories.filter((item) => item.remainingPaise < 0);
  const message = budget.remainingPaise < 0
    ? `You are ${formatPaise(Math.abs(budget.remainingPaise))} over budget.`
    : overBudget.length
      ? `${overBudget[0].category} spending is ${formatPaise(Math.abs(overBudget[0].remainingPaise))} above its planned amount.`
      : `You have ${formatPaise(budget.remainingPaise)} remaining, with ${budget.progressPct}% of the budget recorded.`;
  return { message, budget };
}

module.exports = {
  CATEGORIES,
  inrToPaise,
  getTripDay,
  getTripDayCount,
  categoryPlan,
  buildBudgetAggregation,
  buildExpenseFilter,
  canManageRecord,
  assertTripMember,
  computeGroupBalances,
  getBudget,
  getBalances,
  getTripExpenseReport,
  getBudgetInsights,
  listExpenses,
  addExpense,
  previewExpenseSplit,
  updateExpense,
  deleteExpense,
  listSettlements,
  addSettlement,
  updateSettlement,
  deleteSettlement,
  suggestSettlements,
  getOwnedTrip,
  migrateLegacyExpense,
  migrateLegacyExpenses,
};
