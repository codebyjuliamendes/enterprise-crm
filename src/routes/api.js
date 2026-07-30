const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const crmController = require('../controllers/crmController');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// Public auth
router.post('/login', authController.login);

// Secure routes
router.use(authenticate);
router.get('/me', authController.me);
router.get('/stats', authorize(['admin', 'manager', 'sales', 'viewer']), crmController.getStats);

// Contacts
router.get('/contacts', authorize(['admin', 'manager', 'sales', 'viewer']), crmController.getContacts);
router.post('/contacts', authorize(['admin', 'manager', 'sales']), auditLog('CREATE', 'CONTACT'), crmController.createContact);

// Deals
router.get('/deals', authorize(['admin', 'manager', 'sales', 'viewer']), crmController.getDeals);
router.post('/deals', authorize(['admin', 'manager', 'sales']), auditLog('CREATE', 'DEAL'), crmController.createDealWithActivity);
router.put('/deals/:id/stage', authorize(['admin', 'manager', 'sales']), auditLog('UPDATE_STAGE', 'DEAL'), crmController.updateDealStage);

// Audit (Admin only)
router.get('/audit-logs', authorize(['admin']), crmController.getAuditLogs);

module.exports = router;
