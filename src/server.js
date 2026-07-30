const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const apiRoutes = require('./routes/api');
const db = require('./db/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: false // Disabled for simplicity in demo with inline scripts/styles if any
}));
app.use(cors());
app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api', apiRoutes);

// Fallback for HTML
app.get('*', (req, res) => {
  if (req.path === '/' || req.path === '/login') {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  } else {
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`[Error] ${err.message}`);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal Server Error' 
  });
});

// Initialize DB and Start Server
db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Enterprise CRM running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });
