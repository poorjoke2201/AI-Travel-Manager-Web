const mongoose = require('mongoose');

/**
 * Mirrors data/master_restaurants.csv. This is the largest dataset - see
 * scripts/importDatasets.js for batched streaming import, and
 * services/recommendation/candidate.service.js for the rule that this
 * collection must NEVER be fully loaded into memory or sent to Gemini
 * wholesale. Like hotels, coordinates are absent and geocoded lazily.
 */
const restaurantSchema = new mongoose.Schema(
  {
    sourceId: { type: Number, required: true, unique: true, index: true }, // restaurant_id from CSV

    name: { type: String, required: true, trim: true },
    city: { type: String, index: true },
    area: { type: String, index: true },

    cuisine: { type: [String], default: [] },
    rating: { type: Number, default: null, min: 0, max: 5 },
    isPureVeg: { type: Boolean, default: null },

    avgPriceForTwo: { type: Number, default: null },
    avgDeliveryTimeMins: { type: Number, default: null },

    source: { type: String, default: null }, // swiggy | zomato | ...

    location: {
      type: { type: String, enum: ['Point'], default: undefined },
      coordinates: { type: [Number], default: undefined },
    },
    geocodedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

restaurantSchema.index({ location: '2dsphere' });
restaurantSchema.index({ city: 1, area: 1 });
restaurantSchema.index({ city: 1, cuisine: 1 });
restaurantSchema.index({ city: 1, rating: -1 });
restaurantSchema.index({ isPureVeg: 1, city: 1 });

module.exports = mongoose.model('Restaurant', restaurantSchema);