const { z } = require('zod');

const threeDViewSchema = z.object({
  placeName: z.string().trim().min(1).max(120),
  city: z.string().trim().max(100).optional(),
  placeRefId: z.string().trim().min(1).max(120).nullable().optional(),
}).strict();

module.exports = { threeDViewSchema };
