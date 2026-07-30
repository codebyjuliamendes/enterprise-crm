const { db, save } = require('../db/db');
const { runSql } = require('../db/db-helper');

const auditLog = (action, entityType) => {
  return (req, res, next) => {
    // We hook into the response finish event to capture the result
    const originalSend = res.json;
    res.json = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        // Find entity ID if possible
        let entityId = body.id || req.params.id || null;
        let newValue = (action !== 'DELETE') ? JSON.stringify(body) : null;
        
        try {
          runSql(db, `
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
            VALUES (?, ?, ?, ?, ?)
          `, [req.user.id, action, entityType, entityId, newValue]);
          save();
        } catch (err) {
          console.error('Failed to write audit log', err);
        }
      }
      originalSend.call(this, body);
    };
    next();
  };
};

module.exports = { auditLog };
