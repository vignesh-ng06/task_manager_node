const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');

router.use(authMiddleware);

// Must be before /:id so it's not treated as an id
router.get('/me', taskController.getMyTasks);

// Admin + Manager
router.post('/create', allowRoles('admin', 'manager'), taskController.createTask);
router.put('/update/:id', allowRoles('admin', 'manager'), taskController.updateTask);
router.delete('/delete/:id', allowRoles('admin', 'manager'), taskController.deleteTask);

// Any authenticated role (assignee check inside controller)
router.patch('/updateTaskStatus/:id/status', taskController.updateTaskStatus);

// Any authenticated role
router.get('/getAllTasks', taskController.getAllTasks);
router.get('/:id', taskController.getTask);

module.exports = router;
