'use strict';

const { sqliteUtcToIso } = require('../domain/dates');

const toContact = (row) => row && { ...row, created_at: sqliteUtcToIso(row.created_at) };

/** @param {import('../db/database').Database} db */
function createContactRepository(db) {
  return {
    /** @param {{ ownerId: number | null, limit: number, offset: number }} q */
    list({ ownerId, limit, offset }) {
      const where = ownerId === null ? '' : 'WHERE owner_id = ?';
      const params = ownerId === null ? [] : [ownerId];
      return db
        .all(`SELECT * FROM contacts ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [
          ...params,
          limit,
          offset,
        ])
        .map(toContact);
    },
    findById(id) {
      return toContact(db.get('SELECT * FROM contacts WHERE id = ?', [id]));
    },
    count(ownerId) {
      const row =
        ownerId === null
          ? db.get('SELECT COUNT(*) AS n FROM contacts')
          : db.get('SELECT COUNT(*) AS n FROM contacts WHERE owner_id = ?', [ownerId]);
      return Number(row.n);
    },
    create({ name, email, phone, companyId, tags, ownerId }) {
      const { lastInsertRowid } = db.run(
        'INSERT INTO contacts (name, email, phone, company_id, tags, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
        [name, email, phone ?? null, companyId ?? null, tags ?? null, ownerId],
      );
      return lastInsertRowid;
    },
    listIdsForAnonymization(contactId) {
      const rows =
        contactId === undefined
          ? db.all('SELECT id FROM contacts WHERE anonymized_at IS NULL')
          : db.all('SELECT id FROM contacts WHERE id = ? AND anonymized_at IS NULL', [contactId]);
      return rows.map((r) => Number(r.id));
    },
    anonymize(id, { name, email, phone, tags }) {
      db.run(
        `UPDATE contacts SET name = ?, email = ?, phone = ?, tags = ?, anonymized_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [name, email, phone, tags, id],
      );
      // Free-text activity notes about the person may also contain personal data.
      db.run('UPDATE activities SET notes = NULL WHERE contact_id = ?', [id]);
    },
  };
}

module.exports = { createContactRepository };
