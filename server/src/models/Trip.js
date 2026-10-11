const mongoose = require('mongoose');

const activityPhotoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    pageUrl: { type: String, default: null },
    license: { type: String, default: null },
    artist: { type: String, default: null },
  },
  { _id: false }
);

/** A single scheduled activity within a day of the itinerary (spec section 28). */
const activitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['poi', 'restaurant', 'hotel', 'travel', 'break'], required: true },
    refId: { type: String, default: null }, // Dataset IDs may be Mongo ObjectIds or Overture/string IDs.
    name: { type: String, required: true },
    startTime: { type: String, default: null }, // "HH:mm"
    endTime: { type: String, default: null }, // "HH:mm"
    duration: { type: Number, default: null }, // minutes
    distanceKm: { type: Number, default: null },
    travelMode: { type: String, default: null },
    isEstimated: { type: Boolean, default: true },
    openingTime: { type: String, default: null },
    closingTime: { type: String, default: null },
    weeklyOff: { type: String, default: null },
    mealType: { type: String, default: null },
    notes: { type: String, default: null },
    description: { type: String, default: null },
    wikipediaUrl: { type: String, default: null },
    website: { type: String, default: null },
    phone: { type: String, default: null },
    imageUrl: { type: String, default: null },
    photos: { type: [activityPhotoSchema], default: [] },
    sourceRef: { type: String, default: null },
    category: { type: String, default: null },
    poiType: { type: String, default: null },
    significance: { type: String, default: null },
    characteristics: { type: String, default: null },
    tags: { type: [String], default: [] },
    estimatedCostInr: { type: Number, default: null },
    estimatedCostIsEstimate: { type: Boolean, default: true },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    source: { type: String, enum: ['dataset', 'gemini', 'google_maps', 'geoapify', 'overpass', 'overture', 'web-discovery'], default: 'dataset' },
  },
  { _id: false }
);

const dailyWeatherSchema = new mongoose.Schema(
  {
    date: { type: String, default: null },
    maxC: { type: Number, default: null },
    minC: { type: Number, default: null },
    rainChance: { type: Number, default: null },
    weather: { type: String, default: null },
    windKmh: { type: Number, default: null },
    uv: { type: Number, default: null },
    source: { type: String, default: null },
  },
  { _id: false }
);

const daySchema = new mongoose.Schema(
  {
    day: { type: Number, required: true },
    date: { type: String, required: true }, // ISO date string
    summary: { type: String, default: null },
    weatherContext: { type: String, default: null },
    weather: { type: dailyWeatherSchema, default: null },
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
    distanceKm: { type: Number, default: null }, // road distance for car/bike when available
    isLiveAvailability: { type: Boolean, default: false }, // always false unless a real booking API exists
    source: { type: String, enum: ['gemini', 'google_maps', 'geoapify', 'overture'], default: 'gemini' },
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
    coverImageUrl: { type: String, default: null },
    coverImageResolvedAt: { type: Date, default: null },

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
    selectedHotelId: { type: String, default: null },
    selectedTransportMode: { type: String, enum: ['flight', 'train', 'bus', 'car', 'bike', null], default: null },
    selectedPlaces: {
      type: [{
        refId: { type: String, required: true },
        type: { type: String, enum: ['poi', 'hotel', 'restaurant'], required: true },
        name: { type: String, required: true },
        source: { type: String, enum: ['dataset', 'geoapify', 'gemini', 'overture', 'overpass', 'web-discovery'], default: 'dataset' },
      }],
      default: [],
    },
    discoveredCandidates: {
      places: { type: [mongoose.Schema.Types.Mixed], default: [] },
      stays: { type: [mongoose.Schema.Types.Mixed], default: [] },
      restaurants: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },

    isGroupTrip: { type: Boolean, default: false, index: true },
    inviteCode: { type: String, default: null },
    groupMembers: {
      type: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        phoneNumber: { type: String, default: null },
        name: { type: String, default: null },
        email: { type: String, default: null },
        role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
        status: { type: String, enum: ['accepted', 'pending', 'invited'], default: 'pending' },
        joinedAt: { type: Date, default: null },
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
    itineraryImagesEnrichedAt: { type: Date, default: null },
    itineraryContentEnrichedAt: { type: Date, default: null },
    itineraryContentVersion: { type: Number, default: 0 },
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