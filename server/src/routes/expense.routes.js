const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const expenseController = require('../controllers/expense.controller');

const router = express.Router();
router.use(requireAuth);

router.get('/trips/:tripId/expenses', expenseController.getExpenses);
router.post('/trips/:tripId/expenses', expenseController.addExpense);
router.get('/trips/:tripId/budget', expenseController.getBudget);
router.get('/trips/:tripId/budget/insights', expenseController.getBudgetInsights);
router.put('/expenses/:id', expenseController.updateExpense);
router.delete('/expenses/:id', expenseController.deleteExpense);

module.exports = router;
