'use strict';

/** Error carrying an HTTP status and a message that is safe to show to clients. */
class AppError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {unknown} [details]
   */
  constructor(status, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
    this.expose = true;
  }
}

const badRequest = (message, details) => new AppError(400, message, details);
const unauthorized = (message = 'Authentication required') => new AppError(401, message);
const forbidden = (message = 'Forbidden: Insufficient permissions') => new AppError(403, message);
const notFound = (message = 'Not found') => new AppError(404, message);
const conflict = (message) => new AppError(409, message);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
