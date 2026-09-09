const mongoose = require('mongoose');

/**
 * Mirrors data/master_hotels.csv. NOTE: the dataset has no lat/lng.
 * `location` starts null and is populated lazily by
 * services/maps/geocoding.service.js only for the small candidate set
 * actually shortlisted for a trip (see section 32 of the spec) - never
 * geocode the whole collection.
 */
const hotelSchema = new mongoose.Schema(
  {
    sourceId: { type: Number, required: true, unique: true, index: true }, // hotel_id from CSV

    name: { type: String, required: true, trim: true },
    city: { type: String, index: true },

    googleRating: { type: Number, default: null, min: 0, max: 5 },
    totalReviews: { type: Number, default: null },
    pricePerNightInr: { type: Number, default: null },
    conditionLabel: { type: String, default: null }, // e.g. "Very good"

    amenities: { type: [String], default: [] },
    description: { type: String, default: null },
    source: { type: String, default: null }, // booking | google | ...

    // Populated lazily via geocoding, not at import time.
    location: {
      type: { type: String, enum: ['Point'], default: undefined },
      coordinates: { type: [Number], default: undefined },
    },
    geocodedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

hotelSchema.index({ location: '2dsphere' });
hotelSchema.index({ city: 1, pricePerNightInr: 1 });
hotelSchema.index({ city: 1, googleRating: -1 });
hotelSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Hotel', hotelSchema);