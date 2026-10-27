'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const initSqlJs = require('sql.js');
const { openDatabase } = require('../src/db/database');
const { LATEST_VERSION } = require('../src/db/migrations');
const { createTestApp, DEMO_PASSWORD } = require('./helpers');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'crm-test-'));

test('writes are persisted atomically and survive a restart', async () => {
  const dbPath = path.join(tmpDir(), 'nested', 'crm.db');
  const first = await createTestApp({ dbPath });
  const sales = await first.as('sales');
  await sales.post('/api/contacts').send({ name: 'Persisted', email: 'p@x.co' });
  first.db.close();

  assert.ok(fs.existsSync(dbPath));
  assert.deepEqual(
    fs.readdirSync(path.dirname(dbPath)).filter((f) => f.endsWith('.tmp')),
    [],
  );
  const second = await createTestApp({ dbPath });
  const row = second.db.get("SELECT COUNT(*) AS n FROM contacts WHERE name = 'Persisted'");
  assert.equal(row.n, 1);
  // Demo data is not seeded twice.
  assert.equal(second.db.get('SELECT COUNT(*) AS n FROM users').n, 4);
  second.db.close();
});

test('foreign keys stay enforced after a flush to disk', async () => {
  const dbPath = path.join(tmpDir(), 'crm.db');
  const db = await openDatabase(dbPath);
  db.transaction(() => db.run("INSERT INTO companies (name) VALUES ('c')"));
  assert.throws(() =>
    db.run('INSERT INTO contacts (name, company_id) VALUES (?, ?)', ['x', 12345]),
  );
  db.close();
});

test('databases from the original release are migrated in place', async () => {
  const SQL = await initSqlJs();
  const legacy = new SQL.Database();
  legacy.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, role TEXT NOT NULL, department TEXT, active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, phone TEXT,
      company_id INTEGER, tags TEXT, status TEXT, owner_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE deals (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, value REAL DEFAULT 0,
      stage TEXT DEFAULT 'Lead', contact_id INTEGER, owner_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users (name, email, password, role) VALUES ('Old', 'Old@Crm.com', 'x', 'admin');
    INSERT INTO contacts (name, email, owner_id) VALUES ('Legacy', 'l@x.co', 1);
    INSERT INTO deals (title, value, stage, contact_id, owner_id) VALUES ('Old deal', 19.99, 'Won', 1, 1);
  `);
  const dbPath = path.join(tmpDir(), 'legacy.db');
  fs.writeFileSync(dbPath, legacy.export());

  const db = await openDatabase(dbPath);
  assert.equal(db.get('PRAGMA user_version').user_version, LATEST_VERSION);
  assert.equal(db.get('SELECT value_cents FROM deals WHERE id = 1').value_cents, 1999);
  assert.equal(db.get('SELECT email FROM users WHERE id = 1').email, 'old@crm.com');
  assert.ok(db.get("SELECT name FROM sqlite_master WHERE name = 'audit_logs'"));
  db.close();

  // Re-opening is a no-op.
  const again = await openDatabase(dbPath);
  assert.equal(again.get('PRAGMA user_version').user_version, LATEST_VERSION);
  again.close();
});

test('bootstrap admin is created from the environment', async () => {
  const ctx = await createTestApp({
    env: {
      SEED_DEMO_DATA: 'false',
      ADMIN_EMAIL: 'owner@example.com',
      ADMIN_PASSWORD: 'correct-horse-battery',
    },
  });
  assert.equal(ctx.db.get('SELECT COUNT(*) AS n FROM users').n, 1);
  const res = await ctx
    .request()
    .post('/api/login')
    .send({ email: 'owner@example.com', password: 'correct-horse-battery' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'admin');
  const demo = await ctx
    .request()
    .post('/api/login')
    .send({ email: 'admin@crm.com', password: DEMO_PASSWORD });
  assert.equal(demo.status, 401);
});
