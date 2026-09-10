const budgetService = require('../services/expenses/budget.service');

async function getExpenses(req, res, next) {
  try { res.json({ success: true, data: await budgetService.listExpenses(req.userId, req.params.tripId) }); } catch (err) { next(err); }
}

async function addExpense(req, res, next) {
  try { res.status(201).json({ success: true, data: await budgetService.addExpense(req.userId, req.params.tripId, req.body) }); } catch (err) { next(err); }
}

async function getBudget(req, res, next) {
  try { res.json({ success: true, data: await budgetService.getBudget(req.userId, req.params.tripId) }); } catch (err) { next(err); }
}

async function getBudgetInsights(req, res, next) {
  try { res.json({ success: true, data: await budgetService.getBudgetInsights(req.userId, req.params.tripId) }); } catch (err) { next(err); }
}

async function updateExpense(req, res, next) {
  try { res.json({ success: true, data: await budgetService.updateExpense(req.userId, req.params.id, req.body) }); } catch (err) { next(err); }
}

async function deleteExpense(req, res, next) {
  try { await budgetService.deleteExpense(req.userId, req.params.id); res.json({ success: true }); } catch (err) { next(err); }
}

module.exports = { getExpenses, addExpense, getBudget, getBudgetInsights, updateExpense, deleteExpense };
