const { db, transaction, save } = require('../db/db');
const { queryAll, queryOne, runSql } = require('../db/db-helper');

/**
 * Wraps async controller functions to catch errors and pass them to Express error middleware.
 * @param {Function} fn - The controller function.
 * @returns {Function} Express middleware function.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Retrieve contacts based on user role.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const getContacts = async (req, res) => {
  let query = 'SELECT * FROM contacts';
  const params = [];
  
  if (req.user.role === 'sales') {
    query += ' WHERE owner_id = ?';
    params.push(req.user.id);
  }
  
  const contacts = queryAll(db, query, params);
  res.json(contacts);
};

/**
 * Create a new contact.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const createContact = async (req, res) => {
  const { name, email, phone, company_id, tags } = req.body;
  if (!name || !email) {
    const error = new Error('Name and email are required');
    error.status = 400;
    throw error;
  }
  const owner_id = req.user.id;
  
  let resultId;
  transaction(() => {
    runSql(db, 'INSERT INTO contacts (name, email, phone, company_id, tags, owner_id) VALUES (?, ?, ?, ?, ?, ?)', [name, email, phone, company_id, tags, owner_id]);
    resultId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    
    if (req.auditEvent) {
      runSql(db, 'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value) VALUES (?, ?, ?, ?, ?)', 
        [req.user.id, req.auditEvent.action, req.auditEvent.entityType, resultId, JSON.stringify({ id: resultId, name, email, phone })]);
    }
  });
  save();
  
  res.status(201).json({ id: resultId, name, email, phone });
};

/**
 * Retrieve deals based on user role.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const getDeals = async (req, res) => {
  let query = 'SELECT deals.*, contacts.name as contact_name FROM deals LEFT JOIN contacts ON deals.contact_id = contacts.id';
  const params = [];
  
  if (req.user.role === 'sales') {
    query += ' WHERE deals.owner_id = ?';
    params.push(req.user.id);
  }
  
  const deals = queryAll(db, query, params);
  res.json(deals);
};

/**
 * Create a new deal and associated activity in an ACID transaction.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const createDealWithActivity = async (req, res) => {
  const { title, value, stage, contact_id, activity_notes } = req.body;
  if (!title || value == null || !contact_id) {
    const error = new Error('Title, value, and contact_id are required');
    error.status = 400;
    throw error;
  }
  const owner_id = req.user.id;
  
  const result = transaction(() => {
    runSql(db, 'INSERT INTO deals (title, value, stage, contact_id, owner_id) VALUES (?, ?, ?, ?, ?)', [title, value, stage || 'Lead', contact_id, owner_id]);
    const dealId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    
    if (activity_notes) {
      runSql(db, 'INSERT INTO activities (type, notes, contact_id, deal_id, user_id) VALUES (?, ?, ?, ?, ?)', ['meeting', activity_notes, contact_id, dealId, owner_id]);
    }
    
    const dealResult = { id: dealId, title, value, stage };
    
    if (req.auditEvent) {
      runSql(db, 'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value) VALUES (?, ?, ?, ?, ?)', 
        [req.user.id, req.auditEvent.action, req.auditEvent.entityType, dealId, JSON.stringify(dealResult)]);
    }
    return dealResult;
  });
  save();
  res.status(201).json(result);
};

/**
 * Update the stage of a deal.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const updateDealStage = async (req, res) => {
  const { id } = req.params;
  const { stage } = req.body;
  if (!stage) {
    const error = new Error('Stage is required');
    error.status = 400;
    throw error;
  }
  
  transaction(() => {
    runSql(db, 'UPDATE deals SET stage = ? WHERE id = ?', [stage, id]);
    
    if (req.auditEvent) {
      runSql(db, 'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value) VALUES (?, ?, ?, ?, ?)', 
        [req.user.id, req.auditEvent.action, req.auditEvent.entityType, id, JSON.stringify({ id, stage })]);
    }
  });
  save();
  res.json({ id, stage });
};

/**
 * Retrieve dashboard statistics.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const getStats = async (req, res) => {
  const contactsCountRow = queryOne(db, 'SELECT COUNT(*) as count FROM contacts');
  const contactsCount = contactsCountRow ? contactsCountRow.count : 0;
  const dealsCountRow = queryOne(db, 'SELECT COUNT(*) as count FROM deals');
  const dealsCount = dealsCountRow ? dealsCountRow.count : 0;
  const totalRevenueRow = queryOne(db, 'SELECT SUM(value) as total FROM deals WHERE stage="Won"');
  const totalRevenue = totalRevenueRow ? (totalRevenueRow.total || 0) : 0;
  
  res.json({ contactsCount, dealsCount, totalRevenue });
};

/**
 * Retrieve audit logs (Admin only).
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const getAuditLogs = async (req, res) => {
  const logs = queryAll(db, 'SELECT audit_logs.*, users.name as user_name FROM audit_logs LEFT JOIN users ON audit_logs.user_id = users.id ORDER BY created_at DESC LIMIT 100');
  res.json(logs);
};

/**
 * LGPD Kill Switch: Anonymize PII.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const lgpdAnonymize = async (req, res) => {
  const crypto = require('crypto');
  const hash = (str) => crypto.createHash('sha256').update(str || '').digest('hex');
  
  transaction(() => {
    const contacts = queryAll(db, 'SELECT id, name, email, phone FROM contacts');
    for (const c of contacts) {
      const hashedName = c.name ? hash(c.name) : null;
      const hashedEmail = c.email ? hash(c.email) : null;
      const hashedPhone = c.phone ? hash(c.phone) : null;
      runSql(db, 'UPDATE contacts SET name = ?, email = ?, phone = ? WHERE id = ?', [hashedName, hashedEmail, hashedPhone, c.id]);
    }
    
    runSql(db, 'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value) VALUES (?, ?, ?, ?, ?)', 
      [req.user.id, 'ANONYMIZE', 'SYSTEM', null, 'LGPD Kill Switch Executed']);
  });
  save();
  res.json({ message: 'LGPD Anonymization complete.' });
};

module.exports = {
  getContacts: asyncHandler(getContacts), 
  createContact: asyncHandler(createContact),
  getDeals: asyncHandler(getDeals), 
  createDealWithActivity: asyncHandler(createDealWithActivity), 
  updateDealStage: asyncHandler(updateDealStage),
  getStats: asyncHandler(getStats), 
  getAuditLogs: asyncHandler(getAuditLogs),
  lgpdAnonymize: asyncHandler(lgpdAnonymize)
};
