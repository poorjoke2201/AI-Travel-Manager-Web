const authService = require('../services/auth/auth.service');

/** POST /api/auth/register - validates uniqueness + sends OTP. Does not create the user yet. */
async function register(req, res, next) {
  try {
    const { phoneNumber, username, avatar } = req.body;
    const result = await authService.startRegistration({ phoneNumber, username, avatar });
    res.status(200).json({
      success: true,
      message: 'OTP sent. Verify to complete registration.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/login - sends OTP for an existing account. */
async function login(req, res, next) {
  try {
    const { phoneNumber } = req.body;
    const result = await authService.startLogin({ phoneNumber });
    res.status(200).json({ success: true, message: 'OTP sent.', data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/send-otp - generic resend, used by both flows. */
async function sendOtp(req, res, next) {
  try {
    const { phoneNumber } = req.body;
    const result = authService.sendOtp(phoneNumber);
    res.status(200).json({ success: true, message: 'OTP sent.', data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/verify-otp - completes registration or login, returns a JWT. */
async function verifyOtp(req, res, next) {
  try {
    const { phoneNumber, code, pendingProfile } = req.body;
    const { user, token } = await authService.verifyOtpAndAuthenticate({ phoneNumber, code, pendingProfile });
    res.status(200).json({ success: true, message: 'Authenticated.', data: { user, token } });
  } catch (err) {
    next(err);
  }
}

/** GET /api/auth/me - returns the authenticated user's profile. */
async function me(req, res, next) {
  try {
    res.status(200).json({ success: true, data: req.user.toPublicJSON() });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, sendOtp, verifyOtp, me };