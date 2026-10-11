const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['trip_created', 'place_added', 'place_replaced', 'preferences_updated', '3d_view_opened'],
    required: true,
    index: true,
  },
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', default: null },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  dedupeKey: { type: String },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: false, updatedAt: false } });

activityLogSchema.index({ userId:  1, createdAt: -1 });
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
activityLogSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
