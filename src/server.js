'use strict';

const { loadConfig } = require('./config');
const { createLogger } = require('./logger');
const { openDatabase } = require('./db/database');
const { createRepositories } = require('./repositories');
const { seed } = require('./db/seed');
const { createApp } = require('./app');

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    // Logger depends on config, so report configuration errors directly.
    console.error(JSON.stringify({ level: 'fatal', msg: err.message }));
    process.exit(1);
  }
  const logger = createLogger(config);
  config.warnings.forEach((w) => logger.warn(w));

  const db = await openDatabase(config.dbPath);
  await seed({ db, repos: createRepositories(db), config, logger });
  const app = createApp({ db, config, logger });

  const server = app.listen(config.port, config.host, () => {
    logger.info(
      { port: config.port, env: config.env, db: config.dbPath },
      'Enterprise CRM listening',
    );
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    const timer = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      db.close();
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();
    server.close((err) => {
      try {
        db.close();
      } catch (closeErr) {
        logger.error({ err: closeErr }, 'Failed to flush database on shutdown');
      }
      if (err) logger.error({ err }, 'Error while closing HTTP server');
      process.exit(err ? 1 : 0);
    });
    server.closeIdleConnections?.();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
}

main().catch((err) => {
  console.error(
    JSON.stringify({ level: 'fatal', msg: 'Failed to start', err: String(err?.stack || err) }),
  );
  process.exit(1);
});
