'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../validate');
const { apiNotFound } = require('../middleware/errors');
const schemas = require('../schemas');
const { READ_ROLES, WRITE_ROLES, ADMIN_ROLES } = require('../../domain/roles');

const limiter = (windowMs, limit, extra = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    ...extra,
  });

/**
 * @param {{ authService: ReturnType<import('../../services/authService').createAuthService>,
 *           crmService: ReturnType<import('../../services/crmService').createCrmService>,
 *           rateLimits: { windowMs: number, api: number, writes: number, login: number } }} deps
 */
function createApiRouter({ authService, crmService, rateLimits }) {
  const router = express.Router();
  const { windowMs } = rateLimits;

  router.use(limiter(windowMs, rateLimits.api));
  const writeLimiter = limiter(windowMs, rateLimits.writes);
  const loginLimiter = limiter(windowMs, rateLimits.login, { skipSuccessfulRequests: true });

  router.post('/login', loginLimiter, validate('body', schemas.loginBody), async (req, res) => {
    const { email, password } = req.valid.body;
    res.json(await authService.login(email, password));
  });

  router.use(authenticate(authService));

  router.get('/me', (req, res) => res.json({ user: req.user }));

  router.get('/stats', authorize(READ_ROLES), (req, res) => {
    res.json(crmService.stats(req.user));
  });

  router.get(
    '/contacts',
    authorize(READ_ROLES),
    validate('query', schemas.pagination),
    (req, res) => res.json(crmService.listContacts(req.user, req.valid.query)),
  );
  router.post(
    '/contacts',
    authorize(WRITE_ROLES),
    writeLimiter,
    validate('body', schemas.createContactBody),
    (req, res) => res.status(201).json(crmService.createContact(req.user, req.valid.body)),
  );

  router.get('/deals', authorize(READ_ROLES), validate('query', schemas.pagination), (req, res) =>
    res.json(crmService.listDeals(req.user, req.valid.query)),
  );
  router.post(
    '/deals',
    authorize(WRITE_ROLES),
    writeLimiter,
    validate('body', schemas.createDealBody),
    (req, res) => res.status(201).json(crmService.createDeal(req.user, req.valid.body)),
  );
  router.put(
    '/deals/:id/stage',
    authorize(WRITE_ROLES),
    writeLimiter,
    validate('params', schemas.idParams),
    validate('body', schemas.updateStageBody),
    (req, res) =>
      res.json(crmService.updateDealStage(req.user, req.valid.params.id, req.valid.body.stage)),
  );

  router.get(
    '/audit-logs',
    authorize(ADMIN_ROLES),
    validate('query', schemas.pagination),
    (req, res) => res.json(crmService.listAuditLogs(req.valid.query)),
  );

  router.post(
    '/lgpd/anonymize',
    authorize(ADMIN_ROLES),
    writeLimiter,
    validate('body', schemas.anonymizeBody),
    (req, res) => {
      const result = crmService.anonymize(req.user, req.valid.body.contact_id);
      res.json({ message: 'LGPD Anonymization complete.', ...result });
    },
  );

  router.use(apiNotFound);
  return router;
}

module.exports = { createApiRouter };
