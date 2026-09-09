const { z } = require('zod');

/**
 * Structural contracts for every Gemini JSON response the app relies on.
 * These are intentionally strict on shape but lenient on content (e.g. we
 * don't try to validate that a packing item "makes sense") - business-rule
 * checks (dataset IDs exist, dates fall in range, etc.) happen separately
 * in geminiValidator.js, which has DB/trip context these schemas don't.
 */

const preTripResponseSchema = z.object({
  packingChecklist: z.object({
    essentials: z.array(z.string()).default([]),
    clothing: z.array(z.string()).default([]),
    destinationSpecific: z.array(z.string()).default([]),
  }),
  weatherAdvice: z.string().nullable().default(null),
  travelTips: z.array(z.string()).default([]),
});

const transportOptionResponseSchema = z.object({
  mode: z.enum(['flight', 'train', 'bus', 'car', 'bike']),
  summary: z.string(),
  approxDurationHrs: z.number().nullable().optional(),
  approxPriceInr: z.number().nullable().optional(),
  isLiveAvailability: z.literal(false).default(false),
});

const transportResponseSchema = z.object({
  options: z.array(transportOptionResponseSchema).min(1),
});

const activityResponseSchema = z.object({
  type: z.enum(['poi', 'restaurant', 'hotel', 'travel', 'break']),
  datasetId: z.union([z.string(), z.number()]).nullable().optional(), // must match a candidate id if not AI-generated
  name: z.string(),
  startTime: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: z.enum(['dataset', 'gemini']).default('dataset'),
});

const dayResponseSchema = z.object({
  day: z.number().int().min(1),
  date: z.string(), // validated as a real date within trip range in geminiValidator.js
  summary: z.string().nullable().optional(),
  weatherContext: z.string().nullable().optional(),
  activities: z.array(activityResponseSchema).min(1),
});

const itineraryResponseSchema = z.object({
  days: z.array(dayResponseSchema).min(1),
});

module.exports = {
  preTripResponseSchema,
  transportResponseSchema,
  transportOptionResponseSchema,
  itineraryResponseSchema,
  dayResponseSchema,
  activityResponseSchema,
};