'use strict';

const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');
const { migrate } = require('./migrations');

/**
 * Thin wrapper around a sql.js (SQLite compiled to WebAssembly) database.
 *
 * sql.js keeps the whole database in memory; every committed write transaction is
 * flushed to `filePath` with an atomic write (temp file + rename) so a crash during
 * the flush never leaves a truncated database behind.
 *
 * Node.js runs JavaScript on a single thread and every sql.js call is synchronous,
 * so a transaction can never interleave with another request.
 */
class Database {
  /**
   * @param {import('sql.js').Database} raw
   * @param {string} filePath  ':memory:' disables persistence
   */
  constructor(raw, filePath) {
    this.raw = raw;
    this.filePath = filePath;
    this.inTransaction = false;
    this.closed = false;
    this.applyPragmas();
  }

  applyPragmas() {
    // sql.js resets pragmas whenever the database is exported, so this runs after every flush.
    this.raw.run('PRAGMA foreign_keys = ON');
  }

  /** @returns {Record<string, unknown>[]} */
  all(sql, params = []) {
    const stmt = this.raw.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  /** @returns {Record<string, unknown> | null} */
  get(sql, params = []) {
    return this.all(sql, params)[0] ?? null;
  }

  /** @returns {{ changes: number, lastInsertRowid: number }} */
  run(sql, params = []) {
    this.raw.run(sql, params);
    const changes = this.raw.getRowsModified();
    const lastInsertRowid = Number(this.raw.exec('SELECT last_insert_rowid()')[0].values[0][0]);
    return { changes, lastInsertRowid };
  }

  exec(sql) {
    this.raw.exec(sql);
  }

  /**
   * Runs `fn` inside BEGIN/COMMIT; rolls back and rethrows on error.
   * The database is persisted to disk after a successful commit.
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  transaction(fn) {
    if (this.inTransaction) return fn();
    this.raw.run('BEGIN IMMEDIATE');
    this.inTransaction = true;
    let result;
    try {
      result = fn();
      this.raw.run('COMMIT');
    } catch (err) {
      this.raw.run('ROLLBACK');
      throw err;
    } finally {
      this.inTransaction = false;
    }
    this.persist();
    return result;
  }

  persist() {
    if (this.filePath === ':memory:' || this.closed) return;
    const data = this.raw.export();
    this.applyPragmas();
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
  }

  /** Simple liveness query used by the health check. */
  ping() {
    return this.get('SELECT 1 AS ok')?.ok === 1;
  }

  close() {
    if (this.closed) return;
    this.persist();
    this.raw.close();
    this.closed = true;
  }
}

let sqlPromise;
function loadSqlJs() {
  sqlPromise ??= initSqlJs();
  return sqlPromise;
}

/**
 * Opens (or creates) the database file and applies pending migrations.
 * @param {string} filePath  absolute path or ':memory:'
 */
async function openDatabase(filePath) {
  const SQL = await loadSqlJs();
  let raw;
  if (filePath !== ':memory:' && fs.existsSync(filePath)) {
    raw = new SQL.Database(fs.readFileSync(filePath));
  } else {
    raw = new SQL.Database();
  }
  const db = new Database(raw, filePath);
  const applied = migrate(db);
  if (applied > 0 || (filePath !== ':memory:' && !fs.existsSync(filePath))) db.persist();
  return db;
}

module.exports = { openDatabase, Database };
