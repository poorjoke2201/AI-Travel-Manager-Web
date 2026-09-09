const express = require('express');
const rateLimit = require('express-rate-limit');

const validate = require('../middleware/validation.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const authController = require('../controllers/auth.controller');
const {
  registerSchema,
  sendOtpSchema,
  verifyOtpSchema,
  loginSchema,
} = require('../validators/auth.validator');

const router = express.Router();

// OTP endpoints get a tighter limit than the general /api limiter, since
// they're the most abuse-prone (SMS-bombing / brute force) even with a
// dummy provider in place.
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests. Please try again later.' },
});

router.post('/register', otpLimiter, validate(registerSchema), authController.register);
router.post('/login', otpLimiter, validate(loginSchema), authController.login);
router.post('/send-otp', otpLimiter, validate(sendOtpSchema), authController.sendOtp);
router.post('/verify-otp', validate(verifyOtpSchema), authController.verifyOtp);
router.get('/me', requireAuth, authController.me);

module.exports = router;