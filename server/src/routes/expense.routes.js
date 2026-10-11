const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireTripAccess } = require('../middleware/tripAccess.middleware');
const expenseController = require('../controllers/expense.controller');
const { receiveReceiptUpload } = require('../middleware/receiptUpload.middleware');
const validate = require('../middleware/validation.middleware');
const {
  expenseCreateSchema,
  expenseUpdateSchema,
  expenseSplitPreviewSchema,
  settlementCreateSchema,
  settlementUpdateSchema,
  tripIdParamSchema,
  expenseIdParamSchema,
  expenseListQuerySchema,
  reportQuerySchema,
  reportTripIdParamSchema,
  receiptParamsSchema,
} = require('../validators/expense.validator');

const router = express.Router();
router.use(requireAuth);

router.get('/trips/:tripId/expenses', validate(tripIdParamSchema, 'params'), requireTripAccess, validate(expenseListQuerySchema, 'query'), expenseController.getExpenses);
router.post('/trips/:tripId/expenses', validate(tripIdParamSchema, 'params'), requireTripAccess, validate(expenseCreateSchema), expenseController.addExpense);
router.post('/trips/:tripId/receipts', validate(tripIdParamSchema, 'params'), requireTripAccess, receiveReceiptUpload, expenseController.uploadReceipt);
router.get('/trips/:tripId/receipts/:receiptId', validate(receiptParamsSchema, 'params'), requireTripAccess, expenseController.getReceipt);
router.delete('/trips/:tripId/receipts/:receiptId', validate(receiptParamsSchema, 'params'), requireTripAccess, expenseController.discardReceipt);
router.post('/trips/:tripId/expenses/preview-split', validate(tripIdParamSchema, 'params'), requireTripAccess, validate(expenseSplitPreviewSchema), expenseController.previewExpenseSplit);
router.get('/trips/:tripId/budget', validate(tripIdParamSchema, 'params'), requireTripAccess, expenseController.getBudget);
router.get('/trips/:tripId/budget/insights', validate(tripIdParamSchema, 'params'), requireTripAccess, expenseController.getBudgetInsights);
router.get('/trips/:tripId/balances', validate(tripIdParamSchema, 'params'), requireTripAccess, expenseController.getBalances);
router.get('/trips/:id/expenses/report.pdf', validate(reportTripIdParamSchema, 'params'), requireTripAccess, validate(reportQuerySchema, 'query'), expenseController.getExpenseReportPdf);
router.get('/trips/:tripId/settlements', validate(tripIdParamSchema, 'params'), requireTripAccess, expenseController.getSettlements);
router.post('/trips/:tripId/settlements', validate(tripIdParamSchema, 'params'), requireTripAccess, validate(settlementCreateSchema), expenseController.addSettlement);
router.put('/expenses/:id', validate(expenseIdParamSchema, 'params'), validate(expenseUpdateSchema), expenseController.updateExpense);
router.delete('/expenses/:id', validate(expenseIdParamSchema, 'params'), expenseController.deleteExpense);
router.put('/settlements/:id', validate(expenseIdParamSchema, 'params'), validate(settlementUpdateSchema), expenseController.updateSettlement);
router.delete('/settlements/:id', validate(expenseIdParamSchema, 'params'), expenseController.deleteSettlement);

module.exports = router;
