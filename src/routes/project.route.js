const express = require('express');
const router = express.Router();
const projectController = require('../controllers/project.controller');
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');

router.use(authMiddleware);

// Admin + Manager
router.post('/create', allowRoles('admin', 'manager'), projectController.createProject);
router.put('/update/:id', allowRoles('admin', 'manager'), projectController.updateProject);

// Admin only
router.delete('/delete/:id', allowRoles('admin'), projectController.deleteProject);
router.patch('/activate/:id', allowRoles('admin'), projectController.activateProject);

// Any authenticated role
router.get('/getAll', projectController.getAllProjects);
router.get('/getById/:id', projectController.getProject);


//project membership routes
router.post('/:id/members', allowRoles('admin', 'manager'), projectController.addMembers);
router.delete('/:id/members/:userId', allowRoles('admin', 'manager'), projectController.removeMember);

module.exports = router;
