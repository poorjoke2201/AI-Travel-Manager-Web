const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 12000 },
    sources: {
      type: [{ title: String, url: String }],
      default: [],
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const chatConversationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', default: null, index: true },
    contextType: { type: String, enum: ['app', 'trip', 'explore', 'budget', 'itinerary'], default: 'app' },
    summary: { type: String, default: null, maxlength: 6000 },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true }
);

chatConversationSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('ChatConversation', chatConversationSchema);
