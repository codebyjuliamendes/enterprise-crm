const { db, save } = require('../db/db');
const { runSql } = require('../db/db-helper');

const auditLog = (action, entityType) => {
  return (req, res, next) => {
    req.auditEvent = { action, entityType };
    next();
  };
};

module.exports = { auditLog };
