'use strict';

const { badRequest } = require('../domain/errors');

/**
 * Parses `req[source]` with a zod schema and stores the result in `req.valid[source]`.
 * @param {'body' | 'params' | 'query'} source
 * @param {import('zod').ZodType} schema
 */
const validate = (source, schema) => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || source,
      message: i.message,
    }));
    return next(badRequest('Validation failed', details));
  }
  req.valid = { ...req.valid, [source]: result.data };
  return next();
};

module.exports = { validate };
