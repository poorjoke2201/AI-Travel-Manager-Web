const mongoose = require('mongoose');

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
    avatar: { type: String, default: null }, // URL or preset avatar key

    // Optional future fields (spec section 6) - not required at registration.
    name: { type: String, default: null },
    email: { type: String, default: null, lowercase: true, trim: true },

    isPhoneVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    phoneNumber: this.phoneNumber,
    username: this.username,
    avatar: this.avatar,
    name: this.name,
    email: this.email,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);