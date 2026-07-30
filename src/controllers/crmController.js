const { db, transaction, save } = require('../db/db');
const { queryAll, queryOne, runSql } = require('../db/db-helper');

/**
 * Wraps synchronous controller functions to catch errors and pass them to Express error middleware.
 * @param {Function} fn - The controller function.
 * @returns {Function} Express middleware function.
 */
const syncHandler = (fn) => (req, res, next) => {
  try {
    fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve contacts based on user role.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const getContacts = (req, res) => {
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
const createContact = (req, res) => {
  const { name, email, phone, company_id, tags } = req.body;
  if (!name || !email) {
    const error = new Error('Name and email are required');
    error.status = 400;
    throw error;
  }
  const owner_id = req.user.id;
  
  transaction(() => {
    runSql(db, 'INSERT INTO contacts (name, email, phone, company_id, tags, owner_id) VALUES (?, ?, ?, ?, ?, ?)', [name, email, phone, company_id, tags, owner_id]);
  });
  save();
  const result = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
  
  res.status(201).json({ id: result, name, email, phone });
};

/**
 * Retrieve deals based on user role.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const getDeals = (req, res) => {
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
const createDealWithActivity = (req, res) => {
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
    return { id: dealId, title, value, stage };
  });
  save();
  res.status(201).json(result);
};

/**
 * Update the stage of a deal.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const updateDealStage = (req, res) => {
  const { id } = req.params;
  const { stage } = req.body;
  if (!stage) {
    const error = new Error('Stage is required');
    error.status = 400;
    throw error;
  }
  
  transaction(() => {
    runSql(db, 'UPDATE deals SET stage = ? WHERE id = ?', [stage, id]);
  });
  save();
  res.json({ id, stage });
};

/**
 * Retrieve dashboard statistics.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const getStats = (req, res) => {
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
const getAuditLogs = (req, res) => {
  const logs = queryAll(db, 'SELECT audit_logs.*, users.name as user_name FROM audit_logs LEFT JOIN users ON audit_logs.user_id = users.id ORDER BY created_at DESC LIMIT 100');
  res.json(logs);
};

module.exports = {
  getContacts: syncHandler(getContacts), 
  createContact: syncHandler(createContact),
  getDeals: syncHandler(getDeals), 
  createDealWithActivity: syncHandler(createDealWithActivity), 
  updateDealStage: syncHandler(updateDealStage),
  getStats: syncHandler(getStats), 
  getAuditLogs: syncHandler(getAuditLogs)
};
