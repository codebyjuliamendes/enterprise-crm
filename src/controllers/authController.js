const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/db');
const { queryOne } = require('../db/db-helper');
const { JWT_SECRET } = require('../middleware/auth');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = queryOne(db, 'SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    if (!user.active) return res.status(403).json({ error: 'Account disabled' });
    
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name }, 
      JWT_SECRET, 
      { expiresIn: '8h' }
    );
    
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
};

const me = (req, res) => {
  res.json({ user: req.user });
};

module.exports = { login, me };
