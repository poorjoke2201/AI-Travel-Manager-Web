const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    payerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    amount: { type: Number, required: true, min: 1 },
    category: {
      type: String,
      enum: ['transport', 'accommodation', 'food', 'activities', 'shopping', 'miscellaneous'],
      required: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 300 },
    date: { type: Date, required: true },
    paymentMethod: { type: String, trim: true, maxlength: 40, default: null },
    itineraryItemId: { type: String, default: null },
    isGroupExpense: { type: Boolean, default: false, index: true },
    splitType: { type: String, enum: ['equal', 'custom', 'percentage'], default: 'equal' },
    participants: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    customAmounts: { type: Object, default: {} },
    percentages: { type: Object, default: {} },
    billImage: { type: String, default: null },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

expenseSchema.index({ userId: 1, tripId: 1, date: -1 });
expenseSchema.index({ tripId: 1, category: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
