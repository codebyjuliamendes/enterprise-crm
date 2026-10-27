'use strict';

const pino = require('pino');

/**
 * Structured JSON logger. Authorization headers, cookies and passwords are redacted.
 * @param {{ logLevel: string }} config
 */
function createLogger(config) {
  return pino({
    level: config.logLevel,
    base: { service: 'enterprise-crm' },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'password', '*.password', 'token'],
      censor: '[REDACTED]',
    },
  });
}

module.exports = { createLogger };
