const Expense = require('../../models/Expense');
const Trip = require('../../models/Trip');
const ApiError = require('../../utils/apiError');

const CATEGORIES = ['transport', 'accommodation', 'food', 'activities', 'shopping', 'miscellaneous'];

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
  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) throw ApiError.notFound('Trip not found or you do not have access to it.');
  return trip;
}

async function getBudget(userId, tripId) {
  const trip = await getOwnedTrip(userId, tripId);
  const expenses = await Expense.find({ userId, tripId }).sort({ date: -1, createdAt: -1 }).lean();
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

  return {
    tripId: trip._id,
    plannedTotal,
    spent,
    remaining,
    percentageUsed: plannedTotal ? Math.round((spent / plannedTotal) * 100) : 0,
    status: remaining < 0 ? 'critical' : plannedTotal && remaining / plannedTotal <= 0.1 ? 'critical' : plannedTotal && remaining / plannedTotal <= 0.3 ? 'warning' : 'normal',
    categories,
    expenses,
  };
}

async function listExpenses(userId, tripId) {
  await getOwnedTrip(userId, tripId);
  return Expense.find({ userId, tripId }).sort({ date: -1, createdAt: -1 }).lean();
}

async function addExpense(userId, tripId, payload) {
  await getOwnedTrip(userId, tripId);
  return Expense.create({ ...payload, userId, tripId, date: new Date(payload.date) });
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

module.exports = { CATEGORIES, getBudget, getBudgetInsights, listExpenses, addExpense, updateExpense, deleteExpense };
