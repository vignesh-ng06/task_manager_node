const prisma = require('../config/prisma');

/**
 * Log a task activity.
 * Silently swallows errors so logging never breaks the main request.
 */
exports.logActivity = async ({
  taskId,
  userId,
  type,
  message,
  metadata = null,
}) => {
  try {
    await prisma.taskActivity.create({
      data: { taskId, userId, type, message, metadata },
    });
  } catch (err) {
    console.error('[logActivity] Failed:', err.message);
  }
};