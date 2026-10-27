'use strict';

/**
 * Ordered schema migrations, tracked with SQLite's `PRAGMA user_version`.
 * Migration 1 is idempotent so databases created by earlier releases (which had
 * no version tracking) are upgraded in place without data loss.
 */
const migrations = [
  // 1 - base schema (identical to the original release)
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin', 'manager', 'sales', 'viewer')) NOT NULL,
        department TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        industry TEXT,
        size TEXT,
        revenue REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company_id INTEGER,
        tags TEXT,
        status TEXT,
        owner_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(company_id) REFERENCES companies(id),
        FOREIGN KEY(owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS deals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        value REAL DEFAULT 0,
        stage TEXT CHECK(stage IN ('Lead', 'Qualified', 'Proposal', 'Won', 'Lost')) DEFAULT 'Lead',
        contact_id INTEGER,
        owner_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(contact_id) REFERENCES contacts(id),
        FOREIGN KEY(owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT CHECK(type IN ('call', 'email', 'meeting')) NOT NULL,
        notes TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        contact_id INTEGER,
        deal_id INTEGER,
        user_id INTEGER,
        FOREIGN KEY(contact_id) REFERENCES contacts(id),
        FOREIGN KEY(deal_id) REFERENCES deals(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        old_value TEXT,
        new_value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_owner_id ON contacts(owner_id);
      CREATE INDEX IF NOT EXISTS idx_deals_contact_id ON deals(contact_id);
      CREATE INDEX IF NOT EXISTS idx_deals_owner_id ON deals(owner_id);
      CREATE INDEX IF NOT EXISTS idx_activities_contact_id ON activities(contact_id);
      CREATE INDEX IF NOT EXISTS idx_activities_deal_id ON activities(deal_id);
      CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
    `);
  },

  // 2 - money stored as integer cents, anonymization marker, audit ordering index
  (db) => {
    db.exec(`
      ALTER TABLE deals ADD COLUMN value_cents INTEGER NOT NULL DEFAULT 0;
      UPDATE deals SET value_cents = CAST(ROUND(COALESCE(value, 0) * 100) AS INTEGER);
      ALTER TABLE contacts ADD COLUMN anonymized_at DATETIME;
      UPDATE users SET email = lower(trim(email))
        WHERE NOT EXISTS (
          SELECT 1 FROM users other
          WHERE other.id <> users.id AND other.email = lower(trim(users.email))
        );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
    `);
  },
];

/**
 * Applies every pending migration inside a single transaction.
 * @param {import('./database').Database} db
 * @returns {number} number of migrations applied
 */
function migrate(db) {
  const current = Number(db.get('PRAGMA user_version')?.user_version ?? 0);
  if (current > migrations.length) {
    throw new Error(
      `Database schema version ${current} is newer than this release supports (${migrations.length})`,
    );
  }
  const pending = migrations.slice(current);
  if (pending.length === 0) return 0;

  db.raw.run('BEGIN');
  try {
    pending.forEach((m, i) => {
      m(db);
      db.raw.run(`PRAGMA user_version = ${current + i + 1}`);
    });
    db.raw.run('COMMIT');
  } catch (err) {
    db.raw.run('ROLLBACK');
    throw err;
  }
  return pending.length;
}

module.exports = { migrate, LATEST_VERSION: migrations.length };
