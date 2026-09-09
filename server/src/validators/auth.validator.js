const { z } = require('zod');

const phoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, 'Enter a valid phone number (7-15 digits, optional leading +)');

const registerSchema = z.object({
  phoneNumber: phoneNumberSchema,
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(30),
  avatar: z.string().trim().optional().nullable(),
});

const sendOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

const verifyOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
  code: z.string().trim().length(6, 'OTP must be 6 digits'),
  // Present only on the registration path (first-time verify creates the user).
  pendingProfile: z
    .object({
      username: z.string().trim().min(3).max(30),
      avatar: z.string().trim().optional().nullable(),
    })
    .optional(),
});

const loginSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

module.exports = { registerSchema, sendOtpSchema, verifyOtpSchema, loginSchema };