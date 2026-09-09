const ApiError = require('../utils/apiError');

/**
 * Wraps a Zod schema into Express middleware. Validators in
 * server/src/validators/*.js export plain Zod schemas; this is the only
 * place that knows how to turn a failed parse into an ApiError, keeping
 * that concern out of every controller.
 *
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} [source='body']
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }
    req[source] = result.data; // use the parsed/coerced value downstream
    next();
  };
}

module.exports = validate;