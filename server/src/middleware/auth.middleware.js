const ApiError = require('../utils/apiError');
const { verifyToken } = require('../services/auth/jwt.service');
const User = require('../models/User');

/** Requires a valid Bearer JWT; attaches the authenticated user's id/doc to req. */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Missing or malformed Authorization header.');
    }

    const payload = verifyToken(token);
    if (!payload || !payload.sub) {
      throw ApiError.unauthorized('Invalid or expired token.');
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      throw ApiError.unauthorized('User for this token no longer exists.');
    }

    req.userId = user._id.toString();
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Like requireAuth but doesn't fail if no/invalid token - just leaves req.user unset. */
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next();

  const payload = verifyToken(token);
  if (!payload || !payload.sub) return next();

  const user = await User.findById(payload.sub);
  if (user) {
    req.userId = user._id.toString();
    req.user = user;
  }
  next();
}

module.exports = { requireAuth, optionalAuth };