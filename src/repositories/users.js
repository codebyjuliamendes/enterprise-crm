'use strict';

/** @param {import('../db/database').Database} db */
function createUserRepository(db) {
  return {
    findByEmail(email) {
      return db.get('SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1', [email]);
    },
    findById(id) {
      return db.get(
        'SELECT id, name, email, role, department, active, created_at FROM users WHERE id = ?',
        [id],
      );
    },
    count() {
      return Number(db.get('SELECT COUNT(*) AS n FROM users').n);
    },
    create({ name, email, passwordHash, role, department = null }) {
      const { lastInsertRowid } = db.run(
        'INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)',
        [name, email.toLowerCase(), passwordHash, role, department],
      );
      return lastInsertRowid;
    },
    setPassword(id, passwordHash) {
      return db.run('UPDATE users SET password = ? WHERE id = ?', [passwordHash, id]).changes;
    },
  };
}

module.exports = { createUserRepository };
