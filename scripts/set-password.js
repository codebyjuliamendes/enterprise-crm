'use strict';

/**
 * Sets the password of an existing user.
 *   NEW_PASSWORD='a-long-password' npm run user:set-password -- user@example.com
 * Reads DB_PATH like the server. Stop the server first: sql.js keeps the database in
 * memory, so a running instance would overwrite this change on its next write.
 */
const { loadConfig } = require('../src/config');
const { openDatabase } = require('../src/db/database');
const { createRepositories } = require('../src/repositories');
const { hashPassword } = require('../src/services/authService');

async function run() {
  const email = process.argv[2];
  const password = process.env.NEW_PASSWORD;
  if (!email || !password) {
    throw new Error('usage: NEW_PASSWORD=... node scripts/set-password.js <email>');
  }
  if (password.length < 12) throw new Error('NEW_PASSWORD must have at least 12 characters');

  const config = loadConfig({
    ...process.env,
    JWT_SECRET: process.env.JWT_SECRET || 'x'.repeat(32),
  });
  const db = await openDatabase(config.dbPath);
  const repos = createRepositories(db);
  const user = repos.users.findByEmail(email);
  if (!user) throw new Error(`user ${email} not found in ${config.dbPath}`);
  const hash = await hashPassword(password);
  db.transaction(() => repos.users.setPassword(user.id, hash));
  db.close();
  console.log(`Password updated for ${user.email}`);
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
