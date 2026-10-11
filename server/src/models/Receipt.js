const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    filename: { type: String, required: true, unique: true },
    mimeType: { type: String, enum: ['image/jpeg', 'image/png'], required: true },
    size: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024 },
  },
  { timestamps: true }
);

receiptSchema.index({ tripId: 1, uploadedBy: 1 });

module.exports = mongoose.model('Receipt', receiptSchema);
