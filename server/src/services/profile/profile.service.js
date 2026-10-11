const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const Expense = require('../../models/Expense');
const User = require('../../models/User');
const ApiError = require('../../utils/apiError');
const otpService = require('../auth/otp.service');
const budgetService = require('../expenses/budget.service');
const tripService = require('../trip/trip.service');
const { validateImageFile } = require('../media/imageValidation.service');
const activityService = require('../activity/activity.service');

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_DIRECTORY = path.resolve(__dirname, '../../../uploads/avatars');

function dateOnly(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function inclusiveTripDays(startDate, endDate) {
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);
  if (!start || !end || end < start) return 0;
  return Math.floor((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000) + 1;
}

function normalizePlaceText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isCompletedTrip(trip, today) {
  const endDate = dateOnly(trip.endDate);
  return trip.status === 'generated' && Boolean(endDate) && endDate < today;
}

function calculateProfileSummary(trips = [], expenses = [], { today = new Date().toISOString().slice(0, 10) } = {}) {
  const plannedTrips = trips.filter((trip) => trip.status !== 'failed');
  let totalTravelDays = 0;
  const places = new Set();

  for (const trip of trips) {
    if (isCompletedTrip(trip, today)) {
      totalTravelDays += inclusiveTripDays(trip.startDate, trip.endDate);
    }
    if (trip.status !== 'generated') continue;
    const cityKey = normalizePlaceText(trip.destination);
    for (const day of trip.itinerary || []) {
      for (const activity of day.activities || []) {
        if (activity.type !== 'poi') continue;
        const reference = String(activity.refId || '').trim();
        const nameKey = normalizePlaceText(activity.name);
        if (reference) places.add(`ref:${reference}`);
        else if (nameKey && cityKey) places.add(`place:${nameKey}:${cityKey}`);
      }
    }
  }

  let expenditurePaise = 0n;
  for (const expense of expenses) {
    const amount = Number(expense.amountPaise);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw ApiError.conflict('An expense has an invalid paise amount and cannot be included in the profile summary.');
    }
    expenditurePaise += BigInt(amount);
  }
  if (expenditurePaise > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw ApiError.conflict('The profile expenditure total exceeds the supported safe-integer range.');
  }

  return {
    totalTripsPlanned: plannedTrips.length,
    placesExplored: places.size,
    totalTravelDays,
    totalExpenditurePaise: Number(expenditurePaise),
  };
}

function isStoredAvatar(value) {
  return typeof value === 'string' && /^[a-f\d-]{36}\.(?:jpg|png)$/.test(value);
}

function avatarPath(filename) {
  if (!isStoredAvatar(filename)) throw ApiError.notFound('No uploaded profile image was found.');
  const resolved = path.resolve(AVATAR_DIRECTORY, filename);
  if (path.dirname(resolved) !== AVATAR_DIRECTORY) throw ApiError.badRequest('Invalid profile image reference.');
  return resolved;
}

function serializeProfile(user) {
  const preferences = user.travelPreferences || {};
  return {
    username: user.username,
    displayName: user.name || user.username,
    name: user.name,
    email: user.email || null,
    phoneNumber: user.phoneNumber,
    location: {
      city: user.location?.city || null,
      country: user.location?.country || null,
    },
    tagline: user.tagline || null,
    preferences: {
      placePreferences: preferences.placePreferences || [],
      foodPreferences: preferences.foodPreferences || [],
      travelStyle: preferences.travelStyle || 'moderate',
      pace: preferences.pace || 'balanced',
      transportPreference: preferences.transportPreference || 'any',
      accommodationPreference: preferences.accommodationPreference || 'any',
    },
    avatarUrl: isStoredAvatar(user.avatar) ? '/api/profile/avatar' : null,
    createdAt: user.createdAt,
  };
}

async function getRequiredUser(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found.');
  return user;
}

async function getProfile(userId) {
  return serializeProfile(await getRequiredUser(userId));
}

async function updateProfile(userId, updates) {
  const user = await getRequiredUser(userId);
  if (Object.hasOwn(updates, 'name')) user.name = updates.name?.trim() || null;
  if (Object.hasOwn(updates, 'email')) user.email = updates.email ? updates.email.trim().toLowerCase() : null;
  if (Object.hasOwn(updates, 'tagline')) user.tagline = updates.tagline?.trim() || null;
  if (Object.hasOwn(updates, 'location')) {
    const city = updates.location?.city?.trim() || null;
    const country = updates.location?.country?.trim() || null;
    user.location = city || country ? { city, country } : { city: null, country: null };
  }
  if (Object.hasOwn(updates, 'preferences')) {
    const currentPreferences = user.travelPreferences || {};
    user.travelPreferences = {
      placePreferences: currentPreferences.placePreferences || [],
      foodPreferences: currentPreferences.foodPreferences || [],
      travelStyle: currentPreferences.travelStyle || 'moderate',
      pace: currentPreferences.pace || 'balanced',
      transportPreference: currentPreferences.transportPreference || 'any',
      accommodationPreference: currentPreferences.accommodationPreference || 'any',
      ...updates.preferences,
    };
  }
  await user.save();
  if (Object.hasOwn(updates, 'preferences')) {
    await activityService.recordBestEffort(userId, 'preferences_updated', {
      meta: { preferenceCount: Object.keys(updates.preferences).length },
    });
  }
  return serializeProfile(user);
}

async function changePassword(userId, payload) {
  const user = await getRequiredUser(userId);
  const { currentPassword, newPassword } = payload || {};
  if (typeof newPassword !== 'string' || newPassword.trim().length < 8 || newPassword.length > 72) {
    throw ApiError.badRequest('Password must be 8-72 characters long.');
  }

  if (user.passwordHash) {
    if (typeof currentPassword !== 'string' || currentPassword.trim().length < 8) {
      throw ApiError.unauthorized('Your current password is required to change it.');
    }
    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw ApiError.unauthorized('Current password is incorrect.');
    }
  }

  user.passwordHash = newPassword;
  await user.save();
  return serializeProfile(user);
}

function phoneOtpError(result) {
  const messages = {
    OTP_NOT_REQUESTED: 'No OTP was requested for this number. Request a new verification code.',
    OTP_EXPIRED: 'The phone verification code has expired. Request a new code.',
    TOO_MANY_ATTEMPTS: 'Too many incorrect verification attempts. Request a new code.',
    INVALID_CODE: 'The phone verification code is incorrect.',
  };
  return ApiError.unauthorized(messages[result.reason] || 'Phone verification failed.');
}

async function requestPhoneChange(userId, phoneNumber) {
  const user = await getRequiredUser(userId);
  if (user.phoneNumber === phoneNumber) throw ApiError.badRequest('That is already the phone number on this account.');
  const existing = await User.findOne({ phoneNumber }).select('_id').lean();
  if (existing && String(existing._id) !== String(userId)) {
    throw ApiError.conflict('An account with this phone number already exists.');
  }
  const result = otpService.sendOtp(phoneNumber);
  return { phoneNumber, expiresAt: result.expiresAt };
}

async function verifyPhoneChange(userId, phoneNumber, code) {
  const verification = otpService.verifyOtp(phoneNumber, code);
  if (!verification.valid) throw phoneOtpError(verification);
  const user = await getRequiredUser(userId);
  if (user.phoneNumber === phoneNumber) throw ApiError.badRequest('That is already the phone number on this account.');
  const existing = await User.findOne({ phoneNumber }).select('_id').lean();
  if (existing && String(existing._id) !== String(userId)) {
    throw ApiError.conflict('An account with this phone number already exists.');
  }
  user.phoneNumber = phoneNumber;
  user.isPhoneVerified = true;
  try {
    await user.save();
  } catch (error) {
    if (error.code === 11000) throw ApiError.conflict('An account with this phone number already exists.');
    throw error;
  }
  return serializeProfile(user);
}

async function updateAvatar(userId, file) {
  const extension = validateImageFile({ file, maxBytes: MAX_AVATAR_BYTES, label: 'Avatar' });
  const user = await getRequiredUser(userId);
  const filename = `${randomUUID()}${extension}`;
  const targetPath = avatarPath(filename);
  await fs.mkdir(AVATAR_DIRECTORY, { recursive: true });
  await fs.writeFile(targetPath, file.buffer, { flag: 'wx', mode: 0o600 });

  const previousAvatar = user.avatar;
  user.avatar = filename;
  try {
    await user.save();
  } catch (error) {
    await fs.unlink(targetPath);
    throw error;
  }
  if (isStoredAvatar(previousAvatar)) {
    try {
      await fs.unlink(avatarPath(previousAvatar));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return serializeProfile(user);
}

async function getAvatar(userId) {
  const user = await getRequiredUser(userId);
  const filename = user.avatar;
  const filePath = avatarPath(filename);
  const stat = await fs.stat(filePath).catch((error) => {
    if (error.code === 'ENOENT') throw ApiError.notFound('The uploaded profile image is missing.');
    throw error;
  });
  return {
    path: filePath,
    mimeType: filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
    size: stat.size,
  };
}

async function removeAvatar(userId) {
  const user = await getRequiredUser(userId);
  const previousAvatar = user.avatar;
  user.avatar = null;
  await user.save();
  if (isStoredAvatar(previousAvatar)) {
    try {
      await fs.unlink(avatarPath(previousAvatar));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return serializeProfile(user);
}

async function getProfileSummary(userId, options) {
  const trips = await tripService.listUserTrips(userId);
  for (const trip of trips) await budgetService.migrateLegacyExpenses(trip);
  const tripIds = trips.map((trip) => trip._id);
  const expenses = tripIds.length
    ? await Expense.find({ tripId: { $in: tripIds } }).select('amountPaise').lean()
    : [];
  const summary = calculateProfileSummary(trips, expenses, options);
  return summary;
}

module.exports = {
  MAX_AVATAR_BYTES,
  dateOnly,
  inclusiveTripDays,
  calculateProfileSummary,
  isStoredAvatar,
  avatarPath,
  serializeProfile,
  getProfile,
  updateProfile,
  changePassword,
  requestPhoneChange,
  verifyPhoneChange,
  updateAvatar,
  getAvatar,
  removeAvatar,
  getProfileSummary,
};
