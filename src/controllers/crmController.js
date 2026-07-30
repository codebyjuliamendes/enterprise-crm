const { db, transaction, save } = require('../db/db');
const { queryAll, queryOne, runSql } = require('../db/db-helper');

// --- CONTACTS ---
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

const createContact = (req, res) => {
  const { name, email, phone, company_id, tags } = req.body;
  const owner_id = req.user.id;
  
  runSql(db, 'INSERT INTO contacts (name, email, phone, company_id, tags, owner_id) VALUES (?, ?, ?, ?, ?, ?)', [name, email, phone, company_id, tags, owner_id]);
  save();
  const result = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
  
  res.json({ id: result, name, email, phone });
};

// --- DEALS ---
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

const createDealWithActivity = (req, res) => {
  const { title, value, stage, contact_id, activity_notes } = req.body;
  const owner_id = req.user.id;
  
  try {
    const result = transaction(() => {
      runSql(db, 'INSERT INTO deals (title, value, stage, contact_id, owner_id) VALUES (?, ?, ?, ?, ?)', [title, value, stage || 'Lead', contact_id, owner_id]);
      const dealId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
      
      if (activity_notes) {
        runSql(db, 'INSERT INTO activities (type, notes, contact_id, deal_id, user_id) VALUES (?, ?, ?, ?, ?)', ['meeting', activity_notes, contact_id, dealId, owner_id]);
      }
      return { id: dealId, title, value, stage };
    });
    save();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Transaction failed', details: err.message });
  }
};

const updateDealStage = (req, res) => {
  const { id } = req.params;
  const { stage } = req.body;
  
  runSql(db, 'UPDATE deals SET stage = ? WHERE id = ?', [stage, id]);
  save();
  res.json({ id, stage });
};

// --- DASHBOARD STATS ---
const getStats = (req, res) => {
  const contactsCount = queryOne(db, 'SELECT COUNT(*) as count FROM contacts').count;
  const dealsCount = queryOne(db, 'SELECT COUNT(*) as count FROM deals').count;
  const totalRevenueRow = queryOne(db, 'SELECT SUM(value) as total FROM deals WHERE stage="Won"');
  const totalRevenue = totalRevenueRow ? (totalRevenueRow.total || 0) : 0;
  
  res.json({ contactsCount, dealsCount, totalRevenue });
};

// --- ADMIN / AUDIT ---
const getAuditLogs = (req, res) => {
  const logs = queryAll(db, 'SELECT audit_logs.*, users.name as user_name FROM audit_logs LEFT JOIN users ON audit_logs.user_id = users.id ORDER BY created_at DESC LIMIT 100');
  res.json(logs);
};

module.exports = {
  getContacts, createContact,
  getDeals, createDealWithActivity, updateDealStage,
  getStats, getAuditLogs
};
