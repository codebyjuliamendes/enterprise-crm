'use strict';

const { sqliteUtcToIso } = require('../domain/dates');

/** @param {import('../db/database').Database} db */
function createAuditRepository(db) {
  return {
    record({ userId, action, entityType, entityId = null, oldValue = null, newValue = null }) {
      const serialize = (v) => (v === null || typeof v === 'string' ? v : JSON.stringify(v));
      db.run(
        'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, action, entityType, entityId, serialize(oldValue), serialize(newValue)],
      );
    },
    list({ limit, offset }) {
      return db
        .all(
          `SELECT audit_logs.*, users.name AS user_name
           FROM audit_logs LEFT JOIN users ON audit_logs.user_id = users.id
           ORDER BY audit_logs.created_at DESC, audit_logs.id DESC LIMIT ? OFFSET ?`,
          [limit, offset],
        )
        .map((row) => ({ ...row, created_at: sqliteUtcToIso(row.created_at) }));
    },
  };
}

module.exports = { createAuditRepository };
