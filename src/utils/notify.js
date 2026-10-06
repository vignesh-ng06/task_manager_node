const prisma = require('../config/prisma');

/**
 * Create one notification.
 * @param {object} opts
 * @param {number} opts.userId     - recipient
 * @param {string} opts.type       - e.g. "TASK_ASSIGNED"
 * @param {string} opts.title      - short heading
 * @param {string} opts.message    - body text
 * @param {string} [opts.linkType] - "task" | "project"
 * @param {number} [opts.linkId]
 */
exports.createNotification = async ({
  userId,
  type,
  title,
  message,
  linkType,
  linkId,
}) => {
  return prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      linkType: linkType || null,
      linkId: linkId || null,
    },
  });
};

/**
 * Create the same notification for multiple users.
 * Silently ignores errors — a failed notification should never
 * break the main API response.
 */
exports.notifyMany = async (userIds, payload) => {
  if (!userIds || userIds.length === 0) return;
  const unique = [...new Set(userIds)];
  try {
    await prisma.notification.createMany({
      data: unique.map((userId) => ({ ...payload, userId })),
    });
  } catch (err) {
    console.error('[notifyMany] Failed:', err.message);
  }
};
