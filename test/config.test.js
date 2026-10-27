'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');

const SECRET = 'x'.repeat(32);

test('defaults are sensible for development', () => {
  const c = loadConfig({});
  assert.equal(c.port, 3004);
  assert.equal(c.env, 'development');
  assert.equal(c.seedDemoData, true);
  assert.ok(c.jwt.secret.length >= 32);
  assert.match(c.warnings.join(' '), /JWT_SECRET not set/);
  assert.deepEqual(c.corsOrigins, []);
});

test('production requires a strong JWT secret and disables demo data', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /JWT_SECRET is required/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'short' }), /at least 32/);
  const c = loadConfig({ NODE_ENV: 'production', JWT_SECRET: SECRET });
  assert.equal(c.seedDemoData, false);
  assert.equal(c.isProduction, true);
});

test('invalid values are reported', () => {
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
  assert.throws(() => loadConfig({ SEED_DEMO_DATA: 'yes' }), /SEED_DEMO_DATA/);
  assert.throws(() => loadConfig({ JWT_EXPIRES_IN: 'forever' }), /JWT_EXPIRES_IN/);
});

test('bootstrap admin needs both variables and a long password', () => {
  assert.throws(() => loadConfig({ ADMIN_EMAIL: 'a@b.co' }), /set together/);
  assert.throws(
    () => loadConfig({ ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'short' }),
    /at least 12/,
  );
  const c = loadConfig({ ADMIN_EMAIL: 'Boss@Example.com', ADMIN_PASSWORD: 'a-very-long-password' });
  assert.deepEqual(c.bootstrapAdmin, {
    email: 'boss@example.com',
    password: 'a-very-long-password',
  });
});

test('CORS origins and trust proxy are parsed', () => {
  const c = loadConfig({ CORS_ORIGIN: 'https://a.com, https://b.com', TRUST_PROXY: '1' });
  assert.deepEqual(c.corsOrigins, ['https://a.com', 'https://b.com']);
  assert.equal(c.trustProxy, 1);
});

test('empty variables are treated as unset', () => {
  const c = loadConfig({ JWT_SECRET: '', ADMIN_EMAIL: '', ADMIN_PASSWORD: '', PORT: '' });
  assert.equal(c.port, 3004);
  assert.equal(c.bootstrapAdmin, null);
});
