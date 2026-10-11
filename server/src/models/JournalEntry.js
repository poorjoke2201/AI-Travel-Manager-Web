const mongoose = require('mongoose');

const journalPhotoSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  mimeType: { type: String, enum: ['image/jpeg', 'image/png'], required: true },
}, { _id: false });

const journalEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', default: null, index: true },
  placeName: { type: String, required: true, trim: true, maxlength: 120 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  state: { type: String, default: null, trim: true, maxlength: 100 },
  photos: {
    type: [journalPhotoSchema],
    default: [],
    validate: {
      validator: (photos) => photos.length <= 5,
      message: 'A journal entry can contain at most five photos.',
    },
  },
  note: { type: String, default: '', trim: true, maxlength: 5000 },
  visitedOn: { type: Date, required: true },
}, { timestamps: true });

journalEntrySchema.index({ userId: 1, visitedOn: -1, createdAt: -1 });

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
