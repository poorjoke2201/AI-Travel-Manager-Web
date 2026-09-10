const mongoose = require('mongoose');

/** A single scheduled activity within a day of the itinerary (spec section 28). */
const activitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['poi', 'restaurant', 'hotel', 'travel', 'break'], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null }, // POI/Hotel/Restaurant _id when dataset-backed
    name: { type: String, required: true },
    startTime: { type: String, default: null }, // "HH:mm"
    endTime: { type: String, default: null }, // "HH:mm"
    duration: { type: Number, default: null }, // minutes
    notes: { type: String, default: null },
    description: { type: String, default: null },
    website: { type: String, default: null },
    phone: { type: String, default: null },
    imageUrl: { type: String, default: null },
    sourceRef: { type: String, default: null },
    estimatedCostInr: { type: Number, default: null },
    estimatedCostIsEstimate: { type: Boolean, default: true },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    source: { type: String, enum: ['dataset', 'gemini', 'google_maps', 'geoapify'], default: 'dataset' },
  },
  { _id: false }
);

const daySchema = new mongoose.Schema(
  {
    day: { type: Number, required: true },
    date: { type: String, required: true }, // ISO date string
    summary: { type: String, default: null },
    weatherContext: { type: String, default: null },
    activities: { type: [activitySchema], default: [] },
  },
  { _id: false }
);

const preTripSchema = new mongoose.Schema(
  {
    packingChecklist: {
      essentials: { type: [String], default: [] },
      clothing: { type: [String], default: [] },
      destinationSpecific: { type: [String], default: [] },
    },
    weatherAdvice: { type: String, default: null },
    travelTips: { type: [String], default: [] },
    generatedBy: { type: String, enum: ['gemini', 'fallback'], default: null },
    isAiEstimate: { type: Boolean, default: true },
  },
  { _id: false }
);

const transportOptionSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['flight', 'train', 'bus', 'car', 'bike'], required: true },
    summary: { type: String, default: null },
    approxDurationHrs: { type: Number, default: null },
    approxPriceInr: { type: Number, default: null },
    distanceKm: { type: Number, default: null }, // from Google Maps, only for car
    isLiveAvailability: { type: Boolean, default: false }, // always false unless a real booking API exists
    source: { type: String, enum: ['gemini', 'google_maps', 'geoapify'], default: 'gemini' },
  },
  { _id: false }
);

const budgetSummarySchema = new mongoose.Schema(
  {
    accommodationInr: { type: Number, default: null },
    intercityInr: { type: Number, default: null },
    intracityInr: { type: Number, default: null },
    foodInr: { type: Number, default: null },
    totalEstimatedInr: { type: Number, default: null },
    perDayInr: { type: Number, default: null },
  },
  { _id: false }
);

const tripSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    tripName: { type: String, required: true, trim: true },
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    destinationLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    numberOfDays: { type: Number, required: true, min: 1 },
    budget: { type: Number, default: null },

    travellers: {
      adults: { type: Number, default: 1, min: 1 },
      children: { type: Number, default: 0, min: 0 },
    },

    transportPreference: {
      type: String,
      enum: ['flight', 'train', 'bus', 'car', 'bike', 'any'],
      default: 'any',
    },
    placePreferences: { type: [String], default: [] },
    foodPreferences: { type: [String], default: [] },

    travelStyle: { type: String, enum: ['budget', 'moderate', 'luxury'], default: 'moderate' },
    tripType: { type: String, enum: ['solo', 'couple', 'family', 'friends', 'business'], default: 'solo' },
    pace: { type: String, enum: ['relaxed', 'balanced', 'packed'], default: 'balanced' },
    accommodationPreference: {
      type: String,
      enum: ['hotel', 'hostel', 'resort', 'budget', 'luxury', 'any'],
      default: 'any',
    },
    dailyTravelToleranceKm: { type: Number, default: null },
    selectedHotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', default: null },
    selectedTransportMode: { type: String, enum: ['flight', 'train', 'bus', 'car', 'bike', null], default: null },
    selectedPlaces: {
      type: [{
        refId: { type: String, required: true },
        type: { type: String, enum: ['poi', 'hotel', 'restaurant'], required: true },
        name: { type: String, required: true },
        source: { type: String, enum: ['dataset', 'geoapify', 'gemini'], default: 'dataset' },
      }],
      default: [],
    },

    status: {
      type: String,
      enum: ['draft', 'generating', 'generated', 'failed'],
      default: 'draft',
      index: true,
    },
    generationError: { type: String, default: null },

    overview: { type: String, default: null },
    preTrip: { type: preTripSchema, default: () => ({}) },
    transport: { type: [transportOptionSchema], default: [] },
    intercityTransport: { type: [transportOptionSchema], default: [] },
    intracityTransport: { type: [transportOptionSchema], default: [] },
    itinerary: { type: [daySchema], default: [] },
    budgetSummary: { type: budgetSummarySchema, default: () => ({}) },

    recommendedHotel: {
      hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', default: null },
      label: { type: String, default: 'Recommended accommodation' },
      name: { type: String, default: null },
      googleRating: { type: Number, default: null },
      pricePerNightInr: { type: Number, default: null },
      conditionLabel: { type: String, default: null },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
    },

    isPublic: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

tripSchema.index({ userId: 1, createdAt: -1 });
tripSchema.index({ isPublic: 1, createdAt: -1 });

module.exports = mongoose.model('Trip', tripSchema);