'use strict';

/** JSON 404 for unknown API routes. */
const apiNotFound = (req, res) => {
  res.status(404).json({ error: 'Route not found', requestId: req.id });
};

/**
 * Central error handler. Client errors (4xx) keep their message; server errors are
 * logged with the stack trace and answered with a generic message so internals never leak.
 */
const errorHandler = (err, req, res, _next) => {
  let status = Number(err.status || err.statusCode) || 500;
  if (status < 400 || status > 599) status = 500;

  const body = { error: 'Internal Server Error', requestId: req.id };
  if (status < 500) {
    if (err.type === 'entity.parse.failed') body.error = 'Malformed JSON body';
    else if (err.type === 'entity.too.large') body.error = 'Request body too large';
    else body.error = err.expose === false ? 'Bad request' : err.message;
    if (err.details) body.details = err.details;
    req.log?.info({ err: { message: err.message, status } }, 'request rejected');
  } else {
    req.log?.error({ err }, 'unhandled error');
  }
  res.status(status).json(body);
};

module.exports = { apiNotFound, errorHandler };
