'use strict';

const { fromCents } = require('../domain/money');
const { sqliteUtcToIso } = require('../domain/dates');

const toDeal = (row) => {
  if (!row) return row;
  const { value_cents: valueCents, ...rest } = row;
  return { ...rest, value: fromCents(valueCents), created_at: sqliteUtcToIso(row.created_at) };
};

/** @param {import('../db/database').Database} db */
function createDealRepository(db) {
  return {
    /** @param {{ ownerId: number | null, limit: number, offset: number }} q */
    list({ ownerId, limit, offset }) {
      const where = ownerId === null ? '' : 'WHERE deals.owner_id = ?';
      const params = ownerId === null ? [] : [ownerId];
      return db
        .all(
          `SELECT deals.*, contacts.name AS contact_name
           FROM deals LEFT JOIN contacts ON deals.contact_id = contacts.id
           ${where} ORDER BY deals.id DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset],
        )
        .map(toDeal);
    },
    findById(id) {
      return toDeal(db.get('SELECT * FROM deals WHERE id = ?', [id]));
    },
    create({ title, valueCents, stage, contactId, ownerId }) {
      const { lastInsertRowid } = db.run(
        'INSERT INTO deals (title, value, value_cents, stage, contact_id, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
        [title, fromCents(valueCents), valueCents, stage, contactId, ownerId],
      );
      return lastInsertRowid;
    },
    updateStage(id, stage) {
      return db.run('UPDATE deals SET stage = ? WHERE id = ?', [stage, id]).changes;
    },
    /** @param {number | null} ownerId */
    stats(ownerId) {
      const where = ownerId === null ? '' : 'WHERE owner_id = ?';
      const params = ownerId === null ? [] : [ownerId];
      const row = db.get(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN stage NOT IN ('Won', 'Lost') THEN 1 ELSE 0 END), 0) AS open,
           COALESCE(SUM(CASE WHEN stage = 'Won' THEN value_cents ELSE 0 END), 0) AS won_cents,
           COALESCE(SUM(CASE WHEN stage NOT IN ('Won', 'Lost') THEN value_cents ELSE 0 END), 0) AS open_cents
         FROM deals ${where}`,
        params,
      );
      return {
        total: Number(row.total),
        open: Number(row.open),
        wonCents: Number(row.won_cents),
        openCents: Number(row.open_cents),
      };
    },
  };
}

module.exports = { createDealRepository };
