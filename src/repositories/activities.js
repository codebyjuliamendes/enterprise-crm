'use strict';

/** @param {import('../db/database').Database} db */
function createActivityRepository(db) {
  return {
    create({ type, notes, contactId, dealId, userId }) {
      return db.run(
        'INSERT INTO activities (type, notes, contact_id, deal_id, user_id) VALUES (?, ?, ?, ?, ?)',
        [type, notes, contactId, dealId, userId],
      ).lastInsertRowid;
    },
  };
}

module.exports = { createActivityRepository };
