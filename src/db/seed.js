'use strict';

const { hashPassword } = require('../services/authService');

/** Public demo password; only ever used when SEED_DEMO_DATA is enabled. */
const DEMO_PASSWORD = 'admin123';

const DEMO_USERS = [
  { name: 'System Admin', email: 'admin@crm.com', role: 'admin', department: 'IT' },
  { name: 'Sales Manager', email: 'manager@crm.com', role: 'manager', department: 'Sales' },
  { name: 'John Sales', email: 'sales@crm.com', role: 'sales', department: 'Sales' },
  { name: 'Jane Viewer', email: 'viewer@crm.com', role: 'viewer', department: 'Analytics' },
];

/**
 * Seeds the database on first boot.
 * - demo data (four accounts sharing a public password) when `seedDemoData` is on
 *   and the users table is empty;
 * - a bootstrap admin from ADMIN_EMAIL / ADMIN_PASSWORD when that e-mail does not exist yet.
 *
 * @param {{ db: import('./database').Database,
 *           repos: ReturnType<import('../repositories').createRepositories>,
 *           config: { seedDemoData: boolean, bootstrapAdmin: { email: string, password: string } | null },
 *           logger: import('pino').Logger }} deps
 */
async function seed({ db, repos, config, logger }) {
  if (config.seedDemoData && repos.users.count() === 0) {
    const hash = await hashPassword(DEMO_PASSWORD);
    db.transaction(() => {
      const ids = DEMO_USERS.map((u) => repos.users.create({ ...u, passwordHash: hash }));
      const salesId = ids[2];
      const { lastInsertRowid: companyId } = db.run(
        'INSERT INTO companies (name, industry, size, revenue) VALUES (?, ?, ?, ?)',
        ['Acme Corp', 'Manufacturing', '1000-5000', 50000000],
      );
      const contactId = repos.contacts.create({
        name: 'Alice Boss',
        email: 'alice@acme.com',
        companyId,
        ownerId: salesId,
      });
      repos.deals.create({
        title: 'Acme Q3 Order',
        valueCents: 15_000_000,
        stage: 'Qualified',
        contactId,
        ownerId: salesId,
      });
    });
    logger.warn(
      'Seeded demo accounts with a public password; disable SEED_DEMO_DATA in production',
    );
  }

  const admin = config.bootstrapAdmin;
  if (admin && !repos.users.findByEmail(admin.email)) {
    const hash = await hashPassword(admin.password);
    db.transaction(() =>
      repos.users.create({
        name: 'Administrator',
        email: admin.email,
        passwordHash: hash,
        role: 'admin',
        department: 'IT',
      }),
    );
    logger.info({ email: admin.email }, 'Created bootstrap admin account');
  }
}

module.exports = { seed, DEMO_USERS, DEMO_PASSWORD };
