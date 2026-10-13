const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');

// Public
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected
router.get('/me', authMiddleware, authController.me);

router.patch('/update/me', authMiddleware, authController.updateMe);
router.patch(
  '/update/company',
  authMiddleware,
  allowRoles('admin'),
  authController.updateCompany
);

module.exports = router;