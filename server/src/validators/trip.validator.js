const { z } = require('zod');
const { TRANSPORT_MODES } = require('../constants/transport');
const { TRAVEL_STYLES, TRIP_TYPES, PACE_OPTIONS, ACCOMMODATION_PREFERENCES } = require('../constants/trip');

const isoDate = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), 'Must be a valid date');

const baseTripSchema = z.object({
  tripName: z.string().trim().min(2).max(100),
  origin: z.string().trim().min(2),
  destination: z.string().trim().min(2),
  startDate: isoDate,
  endDate: isoDate,
  budget: z.number().positive().nullable().optional(),

  travellers: z
    .object({
      adults: z.number().int().min(1).default(1),
      children: z.number().int().min(0).default(0),
    })
    .default({ adults: 1, children: 0 }),

  transportPreference: z.enum(TRANSPORT_MODES).default('any'),
  placePreferences: z.array(z.string()).default([]),
  foodPreferences: z.array(z.string()).default([]),

  travelStyle: z.enum(TRAVEL_STYLES).default('moderate'),
  tripType: z.enum(TRIP_TYPES).default('solo'),
  pace: z.enum(PACE_OPTIONS).default('balanced'),
  accommodationPreference: z.enum(ACCOMMODATION_PREFERENCES).default('any'),
  dailyTravelToleranceKm: z.number().positive().nullable().optional(),
  selectedHotelId: z.string().min(1).nullable().optional(),
  selectedTransportMode: z.enum(['flight', 'train', 'bus', 'car', 'bike']).nullable().optional(),
  selectedPlaces: z
    .array(
      z.object({
        refId: z.string().min(1),
        type: z.enum(['poi', 'hotel', 'restaurant']),
        name: z.string().min(1),
        source: z.enum(['dataset', 'geoapify', 'gemini', 'overture', 'overpass', 'web-discovery']).default('dataset').optional(),
      })
    )
    .default([]),
  discoveredCandidates: z.object({
    places: z.array(z.record(z.any())).default([]),
    stays: z.array(z.record(z.any())).default([]),
    restaurants: z.array(z.record(z.any())).default([]),
  }).optional(),

  isPublic: z.boolean().default(false),
  isGroupTrip: z.boolean().default(false),
  inviteCode: z.string().trim().min(4).max(12).nullable().optional(),
  groupMembers: z
    .array(
      z.union([
        z.string().trim().min(7),
        z.object({
          userId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
          phoneNumber: z.string().trim().min(7).nullable().optional(),
          name: z.string().trim().max(80).nullable().optional(),
          email: z.string().email().nullable().optional(),
          role: z.enum(['owner', 'admin', 'member']).default('member'),
          status: z.enum(['accepted', 'pending', 'invited']).default('pending'),
          joinedAt: z.string().datetime({ offset: true }).nullable().optional(),
        }),
      ])
    )
    .default([]),
});

// Only checks order when both dates are actually present, so it also works
// applied to the partial (update) schema where either date may be omitted.
const dateOrderRefinement = (data) =>
  !data.startDate || !data.endDate || new Date(data.endDate).getTime() >= new Date(data.startDate).getTime();

const createTripSchema = baseTripSchema.refine(dateOrderRefinement, {
  message: 'endDate must be on or after startDate',
  path: ['endDate'],
});

// .partial() must be called on the plain ZodObject, before any .refine()
// wraps it in a ZodEffects (which has no .partial() method).
const updateTripSchema = baseTripSchema.partial().refine(dateOrderRefinement, {
  message: 'endDate must be on or after startDate',
  path: ['endDate'],
});

const tripIdParamSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid trip id'),
});

const replaceItineraryParamsSchema = tripIdParamSchema.extend({
  day: z.string().regex(/^\d+$/, 'Invalid day number'),
  activity: z.string().regex(/^\d+$/, 'Invalid activity index'),
});

module.exports = { createTripSchema, updateTripSchema, tripIdParamSchema, replaceItineraryParamsSchema };