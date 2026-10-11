const mongoose = require('mongoose');
const { normalizeDateOnly, isValidDateOnly } = require('../utils/dateOnly');

const settlementSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    fromMember: { type: String, required: true, trim: true },
    toMember: { type: String, required: true, trim: true },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },
    date: {
      type: String,
      required: true,
      set: normalizeDateOnly,
      validate: { validator: isValidDateOnly, message: 'date must be a valid YYYY-MM-DD date.' },
    },
    method: {
      type: String,
      enum: ['UPI', 'Cash', 'Card', 'Net banking', 'Other'],
      required: true,
    },
    note: { type: String, trim: true, maxlength: 300, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

settlementSchema.path('toMember').validate(function toMemberDiffersFromPayer(value) {
  return value !== this.fromMember;
}, 'fromMember and toMember must be different members.');

settlementSchema.index({ tripId: 1, date: -1, createdAt: -1 });

module.exports = mongoose.model('Settlement', settlementSchema);
