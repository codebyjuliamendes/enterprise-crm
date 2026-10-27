'use strict';

const ROLES = Object.freeze(['admin', 'manager', 'sales', 'viewer']);
const READ_ROLES = ROLES;
const WRITE_ROLES = Object.freeze(['admin', 'manager', 'sales']);
const ADMIN_ROLES = Object.freeze(['admin']);

/**
 * Sales reps only see the records they own; every other role sees the whole book.
 * @param {{ id: number, role: string }} user
 * @returns {number | null} owner id to filter by, or null for no filter
 */
function ownerScope(user) {
  return user.role === 'sales' ? user.id : null;
}

module.exports = { ROLES, READ_ROLES, WRITE_ROLES, ADMIN_ROLES, ownerScope };
