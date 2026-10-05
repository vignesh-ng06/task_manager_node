const express = require('express');
const router = express.Router();
const commentController = require('../controllers/comment.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.use(authMiddleware);

// Comments under a task
router.post('/create/:taskId', commentController.createComment);
router.get('/get/:taskId', commentController.getComments);

router.put('/update/:id', commentController.updateComment);
router.delete('/delete/:id', commentController.deleteComment);

module.exports = router;
