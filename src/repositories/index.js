'use strict';

const { createUserRepository } = require('./users');
const { createContactRepository } = require('./contacts');
const { createCompanyRepository } = require('./companies');
const { createDealRepository } = require('./deals');
const { createActivityRepository } = require('./activities');
const { createAuditRepository } = require('./audit');

/** @param {import('../db/database').Database} db */
function createRepositories(db) {
  return {
    users: createUserRepository(db),
    contacts: createContactRepository(db),
    companies: createCompanyRepository(db),
    deals: createDealRepository(db),
    activities: createActivityRepository(db),
    audit: createAuditRepository(db),
  };
}

module.exports = { createRepositories };
