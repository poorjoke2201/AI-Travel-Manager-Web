const mongoose = require('mongoose');
const { normalizeDateOnly, isValidDateOnly } = require('../utils/dateOnly');

const expenseSplitSchema = new mongoose.Schema(
  {
    memberId: { type: String, required: true, trim: true },
    value: { type: String, default: null },
    sharePaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    category: {
      type: String,
      enum: ['transport', 'accommodation', 'food', 'activities', 'shopping', 'miscellaneous'],
      required: true,
    },
    description: { type: String, trim: true, maxlength: 300, default: null },
    date: {
      type: String,
      required: true,
      set: normalizeDateOnly,
      validate: { validator: isValidDateOnly, message: 'date must be a valid YYYY-MM-DD date.' },
    },
    paidBy: { type: String, required: true, trim: true },
    paymentMethod: {
      type: String,
      enum: ['UPI', 'Cash', 'Card', 'Net banking', 'Other'],
      required: true,
    },
    splitType: { type: String, enum: ['equal', 'exact', 'percent', 'shares'], required: true, default: 'equal' },
    splits: { type: [expenseSplitSchema], default: [] },
    receipt: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

expenseSchema.index({ tripId: 1, category: 1 });
expenseSchema.index({ tripId: 1, date: -1, createdAt: -1 });
expenseSchema.index({ tripId: 1, 'splits.memberId': 1, date: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
