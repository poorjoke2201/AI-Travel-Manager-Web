const ApiError = require('../utils/apiError');

/** Mounted after all routes - converts unmatched routes into a clean 404. */
function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = notFound;