const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/db');
const { queryOne } = require('../db/db-helper');
const { JWT_SECRET } = require('../middleware/auth');

/**
 * Wraps asynchronous controller functions to catch errors and pass them to Express error middleware.
 * @param {Function} fn - The controller function.
 * @returns {Function} Express middleware function.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Authenticate a user and issue a JWT.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    const error = new Error('Email and password are required');
    error.status = 400;
    throw error;
  }
  
  const user = queryOne(db, 'SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }
  
  if (!user.active) {
    const error = new Error('Account disabled');
    error.status = 403;
    throw error;
  }
  
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }
  
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name }, 
    JWT_SECRET, 
    { expiresIn: '8h' }
  );
  
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
};

/**
 * Retrieve the current authenticated user's profile.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
const me = (req, res) => {
  res.json({ user: req.user });
};

module.exports = { 
  login: asyncHandler(login), 
  me: asyncHandler(me) 
};
