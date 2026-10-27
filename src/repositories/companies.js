'use strict';

/** @param {import('../db/database').Database} db */
function createCompanyRepository(db) {
  return {
    exists(id) {
      return db.get('SELECT 1 AS ok FROM companies WHERE id = ?', [id]) !== null;
    },
  };
}

module.exports = { createCompanyRepository };
