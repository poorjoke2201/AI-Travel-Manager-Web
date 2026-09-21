const Expense = require('../../models/Expense');
const Trip = require('../../models/Trip');
const ApiError = require('../../utils/apiError');

const CATEGORIES = ['transport', 'accommodation', 'food', 'activities', 'shopping', 'miscellaneous'];

function normalizePhoneNumber(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^\d+]/g, '');
  if (!cleaned || (cleaned.length < 8 && !cleaned.startsWith('+'))) return null;
  return cleaned.startsWith('+') ? `+${cleaned.replace(/\+/g, '')}` : cleaned;
}

function categoryPlan(trip) {
  const summary = trip.budgetSummary || {};
  const total = Number(trip.budget) || Number(summary.totalEstimatedInr) || 0;
  const planned = {
    transport: Number(summary.intercityInr || 0) + Number(summary.intracityInr || 0),
    accommodation: Number(summary.accommodationInr || 0),
    food: Number(summary.foodInr || 0),
    activities: 0,
    shopping: 0,
    miscellaneous: 0,
  };
  const assigned = Object.values(planned).reduce((sum, value) => sum + value, 0);
  if (total > assigned) planned.miscellaneous += total - assigned;
  return planned;
}

async function getOwnedTrip(userId, tripId) {
  const trip = await Trip.findOne({
    _id: tripId,
    $or: [{ userId }, { 'groupMembers.userId': userId }],
  });
  if (!trip) throw ApiError.notFound('Trip not found or you do not have access to it.');
  return trip;
}

async function getBudget(userId, tripId) {
  const trip = await getOwnedTrip(userId, tripId);
  const expenses = await Expense.find({ tripId }).sort({ date: -1, createdAt: -1 }).lean();
  const plannedByCategory = categoryPlan(trip);
  const spentByCategory = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  expenses.forEach((expense) => { spentByCategory[expense.category] += expense.amount; });

  const plannedTotal = Number(trip.budget) || Number(trip.budgetSummary?.totalEstimatedInr) || 0;
  const spent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const remaining = plannedTotal - spent;
  const categories = CATEGORIES.map((category) => ({
    category,
    planned: plannedByCategory[category],
    actual: spentByCategory[category],
    difference: plannedByCategory[category] - spentByCategory[category],
    percentageUsed: plannedByCategory[category] ? Math.round((spentByCategory[category] / plannedByCategory[category]) * 100) : 0,
  }));

  const balances = trip.isGroupTrip ? computeGroupBalances(trip, expenses) : [];

  return {
    tripId: trip._id,
    plannedTotal,
    spent,
    remaining,
    percentageUsed: plannedTotal ? Math.round((spent / plannedTotal) * 100) : 0,
    status: remaining < 0 ? 'critical' : plannedTotal && remaining / plannedTotal <= 0.1 ? 'critical' : plannedTotal && remaining / plannedTotal <= 0.3 ? 'warning' : 'normal',
    categories,
    balances,
    expenses,
  };
}

function resolveExpenseShares(expense, participantIds) {
  const total = Number(expense.amount) || 0;
  const participantSet = participantIds.map(String);
  const shareByParticipant = new Map();

  if (!participantSet.length) return shareByParticipant;

  if (expense.splitType === 'custom') {
    const customAmounts = expense.customAmounts && typeof expense.customAmounts === 'object' ? expense.customAmounts : {};
    for (const participantId of participantSet) {
      shareByParticipant.set(participantId, Number(customAmounts[participantId] ?? customAmounts[String(participantId)] ?? 0));
    }
    return shareByParticipant;
  }

  if (expense.splitType === 'percentage') {
    const percentages = expense.percentages && typeof expense.percentages === 'object' ? expense.percentages : {};
    for (const participantId of participantSet) {
      const percent = Number(percentages[participantId] ?? percentages[String(participantId)] ?? 0);
      shareByParticipant.set(participantId, (total * percent) / 100);
    }
    return shareByParticipant;
  }

  const equalShare = total / participantSet.length;
  for (const participantId of participantSet) {
    shareByParticipant.set(participantId, equalShare);
  }
  return shareByParticipant;
}

function computeGroupBalances(trip, expenses) {
  const ownerMember = trip.userId ? { userId: String(trip.userId), name: 'Trip lead', role: 'owner', status: 'accepted' } : null;
  const members = [
    ...(ownerMember ? [ownerMember] : []),
    ...(trip.groupMembers || []).filter((member) => member && (member.userId || member.phoneNumber)),
  ];
  const uniqueMembers = [];
  const seenMembers = new Set();

  for (const member of members) {
    const memberId = member.userId ? String(member.userId) : member.phoneNumber ? `phone:${normalizePhoneNumber(member.phoneNumber)}` : null;
    if (!memberId || seenMembers.has(memberId)) continue;
    seenMembers.add(memberId);
    uniqueMembers.push({ ...member, userId: member.userId ? String(member.userId) : member.phoneNumber ? null : null });
  }

  const membersMap = new Map(uniqueMembers
    .filter((member) => member.userId)
    .map((member) => [String(member.userId), { ...member, userId: String(member.userId) }]));
  const totals = new Map();

  for (const member of uniqueMembers) {
    if (member.userId) totals.set(String(member.userId), 0);
  }

  for (const expense of expenses) {
    const payerId = String(expense.payerId || expense.userId || trip.userId);
    const participantIds = (expense.participants?.length ? expense.participants : [payerId]).map(String);
    const shares = resolveExpenseShares(expense, participantIds);
    const payerShare = Number(shares.get(payerId) || 0);

    totals.set(payerId, (totals.get(payerId) || 0) + (Number(expense.amount) || 0) - payerShare);

    for (const participantId of participantIds) {
      if (participantId === payerId) continue;
      totals.set(participantId, (totals.get(participantId) || 0) - (Number(shares.get(participantId) || 0)));
    }
  }

  return Array.from(totals.entries())
    .map(([userId, net]) => ({ userId, net: Number(net.toFixed(2)), name: membersMap.get(userId)?.name || 'Traveller', role: membersMap.get(userId)?.role || 'member' }))
    .filter((entry) => Number(entry.net) !== 0)
    .sort((a, b) => b.net - a.net);
}

async function listExpenses(userId, tripId) {
  await getOwnedTrip(userId, tripId);
  return Expense.find({ tripId }).sort({ date: -1, createdAt: -1 }).lean();
}

async function addExpense(userId, tripId, payload) {
  const trip = await getOwnedTrip(userId, tripId);
  const splitType = ['equal', 'custom', 'percentage'].includes(payload?.splitType) ? payload.splitType : 'equal';
  const defaultMembers = [
    ...(trip.userId ? [String(trip.userId)] : []),
    ...(trip.groupMembers?.filter((member) => member.userId).map((member) => String(member.userId)) || []),
  ];
  const participantIds = Array.isArray(payload.participants) && payload.participants.length
    ? payload.participants.map(String)
    : defaultMembers.length
      ? Array.from(new Set(defaultMembers))
      : [String(payload.payerId || userId)];

  const cleanCustomAmounts = {};
  const cleanPercentages = {};
  if (payload.customAmounts && typeof payload.customAmounts === 'object') {
    Object.entries(payload.customAmounts).forEach(([memberId, value]) => {
      if (memberId && participantIds.includes(String(memberId))) cleanCustomAmounts[String(memberId)] = Number(value) || 0;
    });
  }
  if (payload.percentages && typeof payload.percentages === 'object') {
    Object.entries(payload.percentages).forEach(([memberId, value]) => {
      if (memberId && participantIds.includes(String(memberId))) cleanPercentages[String(memberId)] = Number(value) || 0;
    });
  }

  const normalized = {
    ...payload,
    userId,
    tripId,
    payerId: String(payload.payerId || userId),
    date: new Date(payload.date || Date.now()),
    isGroupExpense: Boolean(payload.isGroupExpense || trip.isGroupTrip),
    splitType,
    participants: participantIds,
    customAmounts: cleanCustomAmounts,
    percentages: cleanPercentages,
    billImage: payload.billImage || null,
  };
  return Expense.create(normalized);
}

async function updateExpense(userId, expenseId, updates) {
  const expense = await Expense.findOne({ _id: expenseId, userId });
  if (!expense) throw ApiError.notFound('Expense not found.');
  Object.assign(expense, updates);
  if (updates.date) expense.date = new Date(updates.date);
  await expense.save();
  return expense;
}

async function deleteExpense(userId, expenseId) {
  const result = await Expense.deleteOne({ _id: expenseId, userId });
  if (!result.deletedCount) throw ApiError.notFound('Expense not found.');
}

async function getBudgetInsights(userId, tripId) {
  const budget = await getBudget(userId, tripId);
  const overBudget = budget.categories.filter((item) => item.difference < 0);
  const message = budget.remaining < 0
    ? `You are ₹${Math.abs(Math.round(budget.remaining)).toLocaleString()} over budget.`
    : overBudget.length
      ? `${overBudget[0].category} spending is ₹${Math.abs(Math.round(overBudget[0].difference)).toLocaleString()} above its planned amount.`
      : `You have ₹${Math.round(budget.remaining).toLocaleString()} remaining, with ${budget.percentageUsed}% of the budget recorded.`;
  return { message, budget };
}

module.exports = { CATEGORIES, computeGroupBalances, getBudget, getBudgetInsights, listExpenses, addExpense, updateExpense, deleteExpense };
