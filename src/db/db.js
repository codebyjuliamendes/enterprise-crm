const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '../../crm.db');
let db;

const init = async () => {
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Define Schema
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'manager', 'sales', 'viewer')) NOT NULL,
      department TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      industry TEXT,
      size TEXT,
      revenue REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company_id INTEGER,
      tags TEXT,
      status TEXT,
      owner_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(company_id) REFERENCES companies(id),
      FOREIGN KEY(owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      value REAL DEFAULT 0,
      stage TEXT CHECK(stage IN ('Lead', 'Qualified', 'Proposal', 'Won', 'Lost')) DEFAULT 'Lead',
      contact_id INTEGER,
      owner_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(contact_id) REFERENCES contacts(id),
      FOREIGN KEY(owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT CHECK(type IN ('call', 'email', 'meeting')) NOT NULL,
      notes TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      contact_id INTEGER,
      deal_id INTEGER,
      user_id INTEGER,
      FOREIGN KEY(contact_id) REFERENCES contacts(id),
      FOREIGN KEY(deal_id) REFERENCES deals(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      old_value TEXT,
      new_value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Helper inside init to query
  const stmt = db.prepare('SELECT id FROM users WHERE email = $email');
  stmt.bind({$email: 'admin@crm.com'});
  const adminExists = stmt.step();
  stmt.free();

  if (!adminExists) {
    const hash = await bcrypt.hash('admin123', 12);
    db.run('INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)', [
      'System Admin', 'admin@crm.com', hash, 'admin', 'IT'
    ]);
    db.run('INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)', [
      'Sales Manager', 'manager@crm.com', hash, 'manager', 'Sales'
    ]);
    db.run('INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)', [
      'John Sales', 'sales@crm.com', hash, 'sales', 'Sales'
    ]);
    db.run('INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)', [
      'Jane Viewer', 'viewer@crm.com', hash, 'viewer', 'Analytics'
    ]);
    
    // Seed some data
    db.run('INSERT INTO companies (name, industry, size, revenue) VALUES (?, ?, ?, ?)', ['Acme Corp', 'Manufacturing', '1000-5000', 50000000]);
    const companyId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    
    db.run('INSERT INTO contacts (name, email, company_id, owner_id) VALUES (?, ?, ?, ?)', ['Alice Boss', 'alice@acme.com', companyId, 3]);
    const contactId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    
    db.run('INSERT INTO deals (title, value, stage, contact_id, owner_id) VALUES (?, ?, ?, ?, ?)', ['Acme Q3 Order', 150000, 'Qualified', contactId, 3]);
  }

  if (!fs.existsSync(dbPath) || !adminExists) {
    save();
  }
};

const save = () => {
  if (db) {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
};

module.exports = {
  get db() { return db; },
  init,
  save,
  transaction: (cb) => {
    db.run('BEGIN TRANSACTION');
    try {
      const result = cb();
      db.run('COMMIT');
      return result;
    } catch(err) {
      db.run('ROLLBACK');
      throw err;
    }
  }
};
