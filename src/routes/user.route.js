const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');

// All routes below require a valid JWT
router.use(authMiddleware);

// Admin only
router.post('/createUser', allowRoles('admin'), userController.createUser);
router.put('/updateUser/:id', allowRoles('admin'), userController.updateUser);
router.delete('/deleteUser/:id', allowRoles('admin'), userController.deleteUser);

// Admin + Manager
router.get('/getAllUsers', allowRoles('admin', 'manager'), userController.getAllUsers);
router.get('/getUser/:id', allowRoles('admin', 'manager'), userController.getUser);

module.exports = router;