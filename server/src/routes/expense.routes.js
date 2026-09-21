const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireTripAccess } = require('../middleware/tripAccess.middleware');
const expenseController = require('../controllers/expense.controller');

const router = express.Router();
router.use(requireAuth);

router.get('/trips/:tripId/expenses', requireTripAccess, expenseController.getExpenses);
router.post('/trips/:tripId/expenses', requireTripAccess, expenseController.addExpense);
router.get('/trips/:tripId/budget', requireTripAccess, expenseController.getBudget);
router.get('/trips/:tripId/budget/insights', requireTripAccess, expenseController.getBudgetInsights);
router.put('/expenses/:id', expenseController.updateExpense);
router.delete('/expenses/:id', expenseController.deleteExpense);

module.exports = router;
