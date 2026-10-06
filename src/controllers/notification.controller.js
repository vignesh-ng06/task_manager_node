const prisma = require('../config/prisma');

// ─────────────────────────────────────────────
// GET /notifications?page=1&limit=20&unreadOnly=true
// ─────────────────────────────────────────────
exports.getNotifications = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const where = {
      userId,
      isActive: true,
      ...(req.query.unreadOnly === 'true' ? { isRead: false } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// GET /notifications/unread-count
// ─────────────────────────────────────────────
exports.getUnreadCount = async (req, res, next) => {
  try {
    const { id: userId } = req.user;

    const count = await prisma.notification.count({
      where: { userId, isRead: false, isActive: true },
    });

    res.json({ unread: count });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// PATCH /notifications/:id/read
// ─────────────────────────────────────────────
exports.markAsRead = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { id: userId } = req.user;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid notification id' });
    }

    const existing = await prisma.notification.findFirst({
      where: { id, userId, isActive: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// PATCH /notifications/read-all
// ─────────────────────────────────────────────
exports.markAllAsRead = async (req, res, next) => {
  try {
    const { id: userId } = req.user;

    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false, isActive: true },
      data: { isRead: true },
    });

    res.json({ updated: result.count });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// DELETE /notifications/:id  → soft delete
// ─────────────────────────────────────────────
exports.deleteNotification = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { id: userId } = req.user;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid notification id' });
    }

    const existing = await prisma.notification.findFirst({
      where: { id, userId, isActive: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await prisma.notification.update({
      where: { id },
      data: { isActive: false },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
