const { z } = require('zod');
const travelOptions = require('../../../shared/travelPreferences.json');
const enumValues = (options) => options.map(({ value }) => value);

const phoneNumberSchema = z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'Enter a valid phone number.');
const profileLocationSchema = z.object({
  city: z.string().trim().max(100).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
}).strict();

const travelPreferencesSchema = z.object({
  placePreferences: z.array(z.enum(travelOptions.placeInterests)).optional(),
  foodPreferences: z.array(z.enum(travelOptions.foodPreferences)).optional(),
  travelStyle: z.enum(enumValues(travelOptions.travelStyles)).optional(),
  pace: z.enum(enumValues(travelOptions.paceOptions)).optional(),
  transportPreference: z.enum(enumValues(travelOptions.transportModes)).optional(),
  accommodationPreference: z.enum(enumValues(travelOptions.accommodationPreferences)).optional(),
}).strict().refine((preferences) => Object.keys(preferences).length > 0, 'At least one travel preference is required.');

const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).nullable().optional(),
  email: z.string().trim().email('Enter a valid email address.').nullable().optional(),
  location: profileLocationSchema.nullable().optional(),
  tagline: z.string().trim().max(80).nullable().optional(),
  preferences: travelPreferencesSchema.optional(),
}).strict().refine((profile) => Object.keys(profile).length > 0, 'At least one profile field is required.');

const phoneChangeSchema = z.object({ phoneNumber: phoneNumberSchema }).strict();
const verifyPhoneChangeSchema = z.object({
  phoneNumber: phoneNumberSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter the six-digit verification code.'),
}).strict();
const passwordChangeSchema = z.object({
  currentPassword: z.string().trim().min(8).max(72).optional(),
  newPassword: z.string().trim().min(8).max(72),
}).strict();

module.exports = {
  profileUpdateSchema,
  travelPreferencesSchema,
  phoneChangeSchema,
  verifyPhoneChangeSchema,
  passwordChangeSchema,
};
