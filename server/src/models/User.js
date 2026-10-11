const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const travelOptions = require('../../../shared/travelPreferences.json');
const values = (options) => options.map(({ value }) => value);

/**
 * Phone + dummy-OTP auth (see services/auth/otp.service.js for the isolated
 * OTP provider that will be swapped for a real SMS service later).
 */
const userSchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\+?[0-9]{7,15}$/, 'Invalid phone number format'],
    },
    username: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      minlength: 3,
      maxlength: 30,
    },
    passwordHash: { type: String, default: null },
    avatar: { type: String, default: null }, // Generated private filename or legacy URL/preset key

    // Optional future fields (spec section 6) - not required at registration.
    name: { type: String, default: null },
    email: { type: String, default: null, lowercase: true, trim: true },
    location: {
      city: { type: String, trim: true, maxlength: 100, default: null },
      country: { type: String, trim: true, maxlength: 100, default: null },
    },
    tagline: { type: String, trim: true, maxlength: 80, default: null },
    travelPreferences: {
      placePreferences: { type: [{ type: String, enum: travelOptions.placeInterests }], default: [] },
      foodPreferences: { type: [{ type: String, enum: travelOptions.foodPreferences }], default: [] },
      travelStyle: { type: String, enum: values(travelOptions.travelStyles), default: 'moderate' },
      pace: { type: String, enum: values(travelOptions.paceOptions), default: 'balanced' },
      transportPreference: { type: String, enum: values(travelOptions.transportModes), default: 'any' },
      accommodationPreference: { type: String, enum: values(travelOptions.accommodationPreferences), default: 'any' },
    },

    isPhoneVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function ensurePasswordHash(next) {
  if (!this.isModified('passwordHash') || !this.passwordHash) {
    return next();
  }
  if (this.passwordHash.startsWith('$2')) {
    return next();
  }
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  next();
});

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    phoneNumber: this.phoneNumber,
    username: this.username,
    avatar: this.avatar,
    name: this.name,
    email: this.email,
    travelPreferences: this.travelPreferences,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);