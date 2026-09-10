const mongoose = require('mongoose');

/**
 * Mirrors the actual columns of data/master_pois.csv.
 * `location` is a GeoJSON Point derived from latitude/longitude at import
 * time and is what powers $near / $geoWithin queries; raw lat/lng are kept
 * too since a lot of app code (haversine, Gemini prompts) wants plain numbers.
 */
const poiSchema = new mongoose.Schema(
  {
    sourceId: { type: Number, required: true, unique: true, index: true }, // poi_id from CSV

    name: { type: String, required: true, trim: true },
    city: { type: String, index: true },
    state: { type: String, index: true },
    zone: { type: String },
    country: { type: String, default: 'India' },
    address: { type: String, default: null },

    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    location: {
      type: { type: String, enum: ['Point'], default: undefined },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },

    category: { type: String, index: true }, // e.g. "Cultural & Heritage Sites"
    poiType: { type: String, default: null }, // e.g. "Temple", "Tomb"
    significance: { type: String, default: null }, // e.g. "Historical", "Religious"
    characteristics: { type: String, default: null },
    tags: { type: [String], default: [] },

    entryFeeInr: { type: Number, default: null },
    visitDurationHrs: { type: Number, default: null },

    googleRating: { type: Number, default: null, min: 0, max: 5 },
    reviewCountLakhs: { type: Number, default: null },

    weeklyOff: { type: String, default: null },
    hasAirportNearby: { type: Boolean, default: null },
    dslrAllowed: { type: Boolean, default: null },
    bestTimeToVisit: { type: String, default: null }, // Morning/Afternoon/Evening
    indoorOutdoor: { type: String, enum: ['indoor', 'outdoor', null], default: null },

    openingTime: { type: String, default: null },
    closingTime: { type: String, default: null },
    establishmentYear: { type: String, default: null },

    description: { type: String, default: null },
    website: { type: String, default: null },
    phone: { type: String, default: null },
    wikipedia: { type: String, default: null },
    imageUrl: { type: String, default: null },
    source: { type: String, default: 'dataset' }, // dataset | gemini (fallback additions)
    sourceRef: { type: String, default: null }, // wikidata source_id etc.
    lastUpdated: { type: Date, default: null },
  },
  { timestamps: true }
);

poiSchema.index({ location: '2dsphere' });
poiSchema.index({ city: 1, category: 1 });
poiSchema.index({ city: 1, googleRating: -1 });
poiSchema.index({ name: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('POI', poiSchema);