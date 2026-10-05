const prisma = require('../config/prisma');

const findTaskInCompany = (taskId, companyId) =>
  prisma.task.findFirst({
    where: { id: taskId, project: { companyId } },
  });

const findCommentInCompany = (commentId, companyId) =>
  prisma.comment.findFirst({
    where: { id: commentId, task: { project: { companyId } } },
  });

// POST /tasks/:taskId/comments
exports.createComment = async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const { id: userId, companyId } = req.user;
    const { message } = req.body;

    if (Number.isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task id' });
    }
    if (!message || typeof message !== 'string' || message.trim().length < 1) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message too long (max 2000 chars)' });
    }

    const task = await findTaskInCompany(taskId, companyId);
    if (!task || !task.isActive) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const comment = await prisma.comment.create({
      data: { taskId, userId, message: message.trim() },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
};

// GET /tasks/:taskId/comments
exports.getComments = async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const { companyId } = req.user;

    if (Number.isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task id' });
    }

    const task = await findTaskInCompany(taskId, companyId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const where = { taskId, isActive: true };

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      prisma.comment.count({ where }),
    ]);

    res.json({
      data: comments,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// PUT /comments/:id — author only
exports.updateComment = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { id: userId, companyId } = req.user;
    const { message } = req.body;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid comment id' });
    }
    if (!message || typeof message !== 'string' || message.trim().length < 1) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const existing = await findCommentInCompany(id, companyId);
    if (!existing || !existing.isActive) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'You can only edit your own comments' });
    }

    const comment = await prisma.comment.update({
      where: { id },
      data: { message: message.trim() },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    res.json(comment);
  } catch (err) {
    next(err);
  }
};

// DELETE /comments/:id — author or admin → soft delete
exports.deleteComment = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { id: userId, role, companyId } = req.user;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid comment id' });
    }

    const existing = await findCommentInCompany(id, companyId);
    if (!existing || !existing.isActive) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const isAuthor = existing.userId === userId;
    const isAdmin = role === 'admin';
    if (!isAuthor && !isAdmin) {
      return res
        .status(403)
        .json({ error: 'Only the author or an admin can delete this comment' });
    }

    await prisma.comment.update({ where: { id }, data: { isActive: false } });

    return res.status(200).json({
      success: true,
      message: 'deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};
