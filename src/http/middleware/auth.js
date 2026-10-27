'use strict';

const { unauthorized, forbidden } = require('../../domain/errors');

/** @param {ReturnType<import('../../services/authService').createAuthService>} authService */
const authenticate = (authService) => (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header) return next(unauthorized('No token provided'));
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return next(unauthorized('Malformed token'));
  req.user = authService.authenticate(token);
  return next();
};

/** @param {readonly string[]} roles */
const authorize = (roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
  return next();
};

module.exports = { authenticate, authorize };
