const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier.');
const photoFilename = z.string().regex(/^[a-f\d-]{36}\.(?:jpg|png)$/i, 'Invalid journal photo reference.');

function isDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const visitedOn = z.string().refine(isDateOnly, 'Enter a valid visit date.');
const journalFields = {
  tripId: objectId.nullable().optional(),
  placeName: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().max(100).nullable().optional(),
  note: z.string().trim().max(5000).optional(),
  visitedOn,
  removePhotos: z.array(photoFilename).max(5).optional(),
};

const journalCreateSchema = z.object({
  ...journalFields,
  tripId: journalFields.tripId,
  placeName: journalFields.placeName,
  city: journalFields.city,
  state: journalFields.state,
  note: journalFields.note,
  visitedOn: journalFields.visitedOn,
}).strict();

const journalUpdateSchema = z.object(journalFields).partial().strict();
const journalIdParamSchema = z.object({ id: objectId });
const journalPhotoParamSchema = journalIdParamSchema.extend({ filename: photoFilename });

module.exports = {
  journalCreateSchema,
  journalUpdateSchema,
  journalIdParamSchema,
  journalPhotoParamSchema,
};
