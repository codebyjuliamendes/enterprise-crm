'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { z } = require('zod');

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3004),
  DB_PATH: z.string().min(1).default('data/crm.db'),
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'use a duration such as 15m, 8h or 1d')
    .default('8h'),
  CORS_ORIGIN: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
  SEED_DEMO_DATA: booleanFromEnv.optional(),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
});

function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value; // e.g. "loopback, 10.0.0.0/8"
}

/**
 * Builds and validates the runtime configuration from environment variables.
 * Throws an Error listing every invalid variable so the process fails fast at boot.
 *
 * @param {NodeJS.ProcessEnv} env
 */
function loadConfig(env = process.env) {
  // Treat empty variables (e.g. `JWT_SECRET=` in a compose file) as unset.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  const warnings = [];

  let jwtSecret = e.JWT_SECRET;
  if (jwtSecret !== undefined && jwtSecret.length < 32) {
    throw new Error('Invalid configuration: JWT_SECRET must have at least 32 characters');
  }
  if (!jwtSecret) {
    if (isProduction) {
      throw new Error('Invalid configuration: JWT_SECRET is required when NODE_ENV=production');
    }
    jwtSecret = crypto.randomBytes(48).toString('hex');
    warnings.push('JWT_SECRET not set: using an ephemeral random secret (sessions end on restart)');
  }

  if ((e.ADMIN_EMAIL && !e.ADMIN_PASSWORD) || (!e.ADMIN_EMAIL && e.ADMIN_PASSWORD)) {
    throw new Error('Invalid configuration: ADMIN_EMAIL and ADMIN_PASSWORD must be set together');
  }
  if (e.ADMIN_PASSWORD !== undefined && e.ADMIN_PASSWORD.length < 12) {
    throw new Error('Invalid configuration: ADMIN_PASSWORD must have at least 12 characters');
  }

  const seedDemoData = e.SEED_DEMO_DATA ?? !isProduction;
  if (seedDemoData && isProduction) {
    warnings.push('SEED_DEMO_DATA=true in production: demo accounts use a public password');
  }

  return {
    env: e.NODE_ENV,
    isProduction,
    host: e.HOST,
    port: e.PORT,
    dbPath: e.DB_PATH === ':memory:' ? ':memory:' : path.resolve(e.DB_PATH),
    jwt: { secret: jwtSecret, expiresIn: e.JWT_EXPIRES_IN },
    corsOrigins: e.CORS_ORIGIN
      ? e.CORS_ORIGIN.split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : [],
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    seedDemoData,
    bootstrapAdmin: e.ADMIN_EMAIL
      ? { email: e.ADMIN_EMAIL.toLowerCase(), password: e.ADMIN_PASSWORD }
      : null,
    logLevel: e.LOG_LEVEL ?? (e.NODE_ENV === 'test' ? 'silent' : 'info'),
    rateLimits: {
      windowMs: 15 * 60 * 1000,
      api: 300,
      writes: 60,
      login: 10,
    },
    warnings,
  };
}

module.exports = { loadConfig };
