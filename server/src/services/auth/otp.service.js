/**
 * Dummy OTP provider (spec section 6). Every OTP is the fixed code "123456"
 * with a short-lived in-memory record per phone number, so:
 *   - the flow (send -> verify -> expire -> resend) behaves like a real
 *     provider from day one,
 *   - swapping in a real SMS gateway later only means changing sendOtp()'s
 *     internals - verifyOtp()'s interface and the rest of the app stay the
 *     same.
 *
 * NOTE: in-memory storage means OTP state resets on server restart and
 * doesn't work across multiple server instances - fine for a dummy
 * implementation, but flagged here so it isn't mistaken for production-ready.
 */

const DUMMY_OTP_CODE = '123456';
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

/** phoneNumber -> { code, expiresAt, attempts } */
const otpStore = new Map();

function sendOtp(phoneNumber) {
  const expiresAt = Date.now() + OTP_TTL_MS;
  otpStore.set(phoneNumber, { code: DUMMY_OTP_CODE, expiresAt, attempts: 0 });

  // In a real provider this would call the SMS API. For now we just log it
  // so developers can see it without needing an actual phone.
  // eslint-disable-next-line no-console
  console.log(`[otp.service] (DUMMY) OTP for ${phoneNumber}: ${DUMMY_OTP_CODE} (expires in 5 min)`);

  return { sent: true, expiresAt };
}

function verifyOtp(phoneNumber, code) {
  const record = otpStore.get(phoneNumber);

  if (!record) {
    return { valid: false, reason: 'OTP_NOT_REQUESTED' };
  }
  if (Date.now() > record.expiresAt) {
    otpStore.delete(phoneNumber);
    return { valid: false, reason: 'OTP_EXPIRED' };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(phoneNumber);
    return { valid: false, reason: 'TOO_MANY_ATTEMPTS' };
  }

  record.attempts += 1;

  if (record.code !== code) {
    return { valid: false, reason: 'INVALID_CODE' };
  }

  otpStore.delete(phoneNumber); // one-time use
  return { valid: true };
}

module.exports = { sendOtp, verifyOtp, DUMMY_OTP_CODE };