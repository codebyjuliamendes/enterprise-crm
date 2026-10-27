'use strict';

const request = require('supertest');
const pino = require('pino');
const { loadConfig } = require('../src/config');
const { openDatabase } = require('../src/db/database');
const { createRepositories } = require('../src/repositories');
const { seed, DEMO_PASSWORD } = require('../src/db/seed');
const { createApp } = require('../src/app');

/**
 * Creates an isolated app backed by an in-memory database seeded with demo data.
 * @param {{ env?: Record<string, string>, rateLimits?: object, dbPath?: string }} [options]
 */
async function createTestApp(options = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    DB_PATH: options.dbPath ?? ':memory:',
    JWT_SECRET: 'test-secret-that-is-long-enough-1234567890',
    SEED_DEMO_DATA: 'true',
    ...options.env,
  });
  config.rateLimits = {
    ...config.rateLimits,
    api: 10_000,
    writes: 10_000,
    login: 10_000,
    ...options.rateLimits,
  };
  const logger = pino({ level: 'silent' });
  const db = await openDatabase(config.dbPath);
  await seed({ db, repos: createRepositories(db), config, logger });
  const app = createApp({ db, config, logger });

  const tokens = {};
  const login = async (role) => {
    if (tokens[role]) return tokens[role];
    const res = await request(app)
      .post('/api/login')
      .send({ email: `${role}@crm.com`, password: DEMO_PASSWORD });
    if (res.status !== 200) throw new Error(`login failed for ${role}: ${res.status}`);
    tokens[role] = res.body.token;
    return tokens[role];
  };
  const as = async (role) => {
    const token = await login(role);
    const auth = (r) => r.set('Authorization', `Bearer ${token}`);
    return {
      get: (url) => auth(request(app).get(url)),
      post: (url) => auth(request(app).post(url)),
      put: (url) => auth(request(app).put(url)),
    };
  };
  return { app, db, config, as, login, request: () => request(app) };
}

module.exports = { createTestApp, DEMO_PASSWORD };
