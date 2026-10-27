'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const pinoHttp = require('pino-http');
const swaggerUiDist = require('swagger-ui-dist');

const { createRepositories } = require('./repositories');
const { createAuthService } = require('./services/authService');
const { createCrmService } = require('./services/crmService');
const { createApiRouter } = require('./http/routes/api');
const { errorHandler } = require('./http/middleware/errors');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * Builds the Express application. Kept free of side effects (no listen, no DB open)
 * so tests can create isolated instances.
 *
 * @param {{ db: import('./db/database').Database,
 *           config: ReturnType<import('./config').loadConfig>,
 *           logger: import('pino').Logger }} deps
 */
function createApp({ db, config, logger }) {
  const repos = createRepositories(db);
  const authService = createAuthService({ repos, jwt: config.jwt });
  const crmService = createCrmService({ db, repos });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.locals.services = { authService, crmService, repos };

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && /^[\w-]{1,64}$/.test(incoming)
            ? incoming
            : crypto.randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'font-src': ["'self'"],
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'form-action': ["'self'"],
          'base-uri': ["'self'"],
          // Allow plain-HTTP deployments (e.g. an internal ingress); HTTPS is enforced by HSTS.
          'upgrade-insecure-requests': null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.isProduction,
    }),
  );
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }));
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    const ok = db.ping();
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'unavailable' });
  });

  app.use('/api', createApiRouter({ authService, crmService, rateLimits: config.rateLimits }));

  // Pages
  const sendPage = (file) => (_req, res) => res.sendFile(path.join(PUBLIC_DIR, file));
  app.get(['/', '/login', '/index.html'], sendPage('index.html'));
  app.get(['/dashboard', '/dashboard.html'], sendPage('dashboard.html'));
  app.get(['/api-docs', '/api-docs.html'], sendPage('api-docs.html'));

  app.use(
    '/vendor/swagger-ui',
    express.static(swaggerUiDist.getAbsoluteFSPath(), { maxAge: '7d', index: false }),
  );
  app.use(express.static(PUBLIC_DIR, { index: false, maxAge: config.isProduction ? '1h' : 0 }));

  app.use((_req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
