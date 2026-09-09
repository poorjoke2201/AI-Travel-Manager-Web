const User = require('../../models/User');
const ApiError = require('../../utils/apiError');
const otpService = require('./otp.service');
const { signToken } = require('./jwt.service');

/** Kicks off registration: validates uniqueness, sends OTP. User is NOT created yet. */
async function startRegistration({ phoneNumber, username, avatar }) {
  const existing = await User.findOne({ $or: [{ phoneNumber }, { username }] });
  if (existing) {
    if (existing.phoneNumber === phoneNumber) {
      throw ApiError.conflict('An account with this phone number already exists.');
    }
    throw ApiError.conflict('This username is already taken.');
  }

  otpService.sendOtp(phoneNumber);
  return { phoneNumber, username, avatar };
}

/** Sends an OTP for an existing user attempting to log in. */
async function startLogin({ phoneNumber }) {
  const user = await User.findOne({ phoneNumber });
  if (!user) {
    throw ApiError.notFound('No account found for this phone number.');
  }
  otpService.sendOtp(phoneNumber);
  return { phoneNumber };
}

/** Generic OTP send, used by both register and login flows via the same endpoint contract. */
function sendOtp(phoneNumber) {
  return otpService.sendOtp(phoneNumber);
}

/**
 * Verifies OTP and either creates the user (registration) or logs them in
 * (login), depending on whether pendingProfile is supplied.
 */
async function verifyOtpAndAuthenticate({ phoneNumber, code, pendingProfile }) {
  const result = otpService.verifyOtp(phoneNumber, code);
  if (!result.valid) {
    const messages = {
      OTP_NOT_REQUESTED: 'No OTP was requested for this number. Please request one first.',
      OTP_EXPIRED: 'This OTP has expired. Please request a new one.',
      TOO_MANY_ATTEMPTS: 'Too many incorrect attempts. Please request a new OTP.',
      INVALID_CODE: 'Incorrect OTP. Please try again.',
    };
    throw ApiError.unauthorized(messages[result.reason] || 'OTP verification failed.');
  }

  let user = await User.findOne({ phoneNumber });

  if (!user) {
    if (!pendingProfile || !pendingProfile.username) {
      throw ApiError.badRequest('No account exists for this number and no registration details were provided.');
    }
    user = await User.create({
      phoneNumber,
      username: pendingProfile.username,
      avatar: pendingProfile.avatar || null,
      isPhoneVerified: true,
    });
  } else if (!user.isPhoneVerified) {
    user.isPhoneVerified = true;
    await user.save();
  }

  const token = signToken({ sub: user._id.toString() });
  return { user: user.toPublicJSON(), token };
}

async function getUserById(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found.');
  return user;
}

module.exports = { startRegistration, startLogin, sendOtp, verifyOtpAndAuthenticate, getUserById };