/**
 * Standard application error. Route handlers/services should throw this
 * (or subclasses) instead of raw Error so the error middleware can produce
 * consistent, user-friendly responses without leaking stack traces.
 */
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // distinguishes expected errors from programmer bugs
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }
  static conflict(message) {
    return new ApiError(409, message);
  }
  static internal(message = 'Internal server error', details) {
    return new ApiError(500, message, details);
  }
  static serviceUnavailable(message = 'Upstream service unavailable') {
    return new ApiError(503, message);
  }
}

module.exports = ApiError;