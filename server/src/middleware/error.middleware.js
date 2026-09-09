const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');
const { env } = require('../config/env');

/**
 * Single place where every thrown/rejected error in the app ends up.
 * Operational errors (ApiError) are surfaced with their real message;
 * anything unexpected is logged in full server-side but only ever
 * returned to the client as a generic message, per spec section 41
 * ("Never display raw stack traces to users").
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : 500;

  if (!isApiError || statusCode >= 500) {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, err);
  }

  const body = {
    success: false,
    message: isApiError ? err.message : 'Something went wrong. Please try again.',
  };

  if (isApiError && err.details) body.details = err.details;
  if (!env.isProduction && !isApiError) body.debug = { message: err.message, stack: err.stack };

  res.status(statusCode).json(body);
}

module.exports = errorHandler;