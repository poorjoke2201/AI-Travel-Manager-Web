const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');

function signToken(payload) {
  if (!env.jwtSecret) throw new Error('JWT secret is not configured.');
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

/** Returns decoded payload, or null if invalid/expired (never throws). */
function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch (err) {
    return null;
  }
}

module.exports = { signToken, verifyToken };