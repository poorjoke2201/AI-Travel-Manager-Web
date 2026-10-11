const fs = require('node:fs');
const budgetService = require('../services/expenses/budget.service');
const budgetReportService = require('../services/expenses/budgetReport.service');
const receiptStorage = require('../services/expenses/receiptStorage.service');
const ApiError = require('../utils/apiError');

async function getExpenses(req, res, next) {
  try { res.json({ success: true, data: await budgetService.listExpenses(req.userId, req.params.tripId, req.query) }); } catch (err) { next(err); }
}

async function addExpense(req, res, next) {
  try { res.status(201).json({ success: true, data: await budgetService.addExpense(req.userId, req.params.tripId, req.body) }); } catch (err) { next(err); }
}

async function uploadReceipt(req, res, next) {
  try {
    const receipt = await receiptStorage.saveReceipt(req.userId, req.params.tripId, req.file);
    res.status(201).json({ success: true, data: receipt });
  } catch (err) {
    next(err);
  }
}

async function getReceipt(req, res, next) {
  try {
    const receipt = await receiptStorage.getReceipt(req.params.tripId, req.params.receiptId);
    res.setHeader('Content-Type', receipt.mimeType);
    res.setHeader('Content-Disposition', 'inline; filename="receipt"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = fs.createReadStream(receipt.path);
    stream.on('error', (error) => {
      if (res.headersSent) res.destroy(error);
      else next(error);
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

async function discardReceipt(req, res, next) {
  try {
    await receiptStorage.discardUnattachedReceipt(req.userId, req.params.tripId, req.params.receiptId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function previewExpenseSplit(req, res, next) {
  try { res.json({ success: true, data: await budgetService.previewExpenseSplit(req.userId, req.params.tripId, req.body) }); } catch (err) { next(err); }
}

async function getBudget(req, res, next) {
  try { res.json({ success: true, data: await budgetService.getBudget(req.userId, req.params.tripId) }); } catch (err) { next(err); }
}

async function getBalances(req, res, next) {
  try { res.json({ success: true, data: await budgetService.getBalances(req.userId, req.params.tripId) }); } catch (err) { next(err); }
}

async function getExpenseReportPdf(req, res, next) {
  try {
    const filters = req.query;
    const data = await budgetService.getTripExpenseReport(req.userId, req.params.id, filters);
    let personName = null;
    if (filters.type === 'person' && filters.personId) {
      const person = data.aggregation.perPerson.find((entry) => entry.memberId === filters.personId);
      if (!person) throw ApiError.badRequest('The selected person is not part of this trip ledger.');
      personName = person.name;
    }
    const filename = budgetReportService.buildReportFilename(data.trip, filters, personName);
    const stream = await budgetReportService.createReportStream(data.trip, data, filters);
    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.on('error', (error) => {
      if (res.headersSent) res.destroy(error);
      else next(error);
    });
    stream.pipe(res);
    stream.end();
  } catch (err) {
    next(err);
  }
}

async function getBudgetInsights(req, res, next) {
  try { res.json({ success: true, data: await budgetService.getBudgetInsights(req.userId, req.params.tripId) }); } catch (err) { next(err); }
}

async function getSettlements(req, res, next) {
  try { res.json({ success: true, data: await budgetService.listSettlements(req.userId, req.params.tripId) }); } catch (err) { next(err); }
}

async function addSettlement(req, res, next) {
  try { res.status(201).json({ success: true, data: await budgetService.addSettlement(req.userId, req.params.tripId, req.body) }); } catch (err) { next(err); }
}

async function updateExpense(req, res, next) {
  try { res.json({ success: true, data: await budgetService.updateExpense(req.userId, req.params.id, req.body) }); } catch (err) { next(err); }
}

async function deleteExpense(req, res, next) {
  try { await budgetService.deleteExpense(req.userId, req.params.id); res.json({ success: true }); } catch (err) { next(err); }
}

async function updateSettlement(req, res, next) {
  try { res.json({ success: true, data: await budgetService.updateSettlement(req.userId, req.params.id, req.body) }); } catch (err) { next(err); }
}

async function deleteSettlement(req, res, next) {
  try { await budgetService.deleteSettlement(req.userId, req.params.id); res.json({ success: true }); } catch (err) { next(err); }
}

module.exports = {
  getExpenses,
  addExpense,
  uploadReceipt,
  getReceipt,
  discardReceipt,
  previewExpenseSplit,
  getBudget,
  getBalances,
  getExpenseReportPdf,
  getBudgetInsights,
  getSettlements,
  addSettlement,
  updateExpense,
  deleteExpense,
  updateSettlement,
  deleteSettlement,
};
