const prisma = require('../config/prisma');
const { createNotification, notifyMany } = require('../utils/notify');

const VALID_STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED'];

// Client sends 1 / 2 / 3 / 4, DB stores the corresponding status string
const STATUS_MAP = {
  1: 'TODO',
  2: 'IN_PROGRESS',
  3: 'REVIEW',
  4: 'COMPLETED',
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  REVIEW: 'REVIEW',
  COMPLETED: 'COMPLETED',
};

const normalizeStatus = (input) => {
  const key = typeof input === 'string' ? input.trim().toUpperCase() : input;
  return STATUS_MAP[key] || null;
};

// Priority: client sends 1 / 2 / 3, DB stores HIGH / MEDIUM / LOW
const PRIORITY_MAP = {
  1: 'HIGH',
  2: 'MEDIUM',
  3: 'LOW',
  // also accept strings for convenience
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

const PRIORITY_LEVEL = { HIGH: 1, MEDIUM: 2, LOW: 3 };

// Returns normalized string ('HIGH' | 'MEDIUM' | 'LOW') or null if invalid
const normalizePriority = (input) => {
  if (input === undefined || input === null || input === '') return 'MEDIUM';
  const key = typeof input === 'string' ? input.toUpperCase() : input;
  return PRIORITY_MAP[key] || null;
};

// Adds priorityLevel to a task object for client-side sorting
const withPriorityLevel = (task) => {
  if (!task) return task;
  if (Array.isArray(task)) {
    return task.map((t) => ({ ...t, priorityLevel: PRIORITY_LEVEL[t.priority] }));
  }
  return { ...task, priorityLevel: PRIORITY_LEVEL[task.priority] };
};

// Helpers
const findProjectInCompany = (projectId, companyId) =>
  prisma.project.findFirst({ where: { id: projectId, companyId } });

const findUserInCompany = (userId, companyId) =>
  prisma.user.findFirst({ where: { id: userId, companyId, isActive: true } });

// ─────────────────────────────────────────────
// POST /tasks   (admin + manager)
// body: { title, description?, projectId, assignedTo?, priority? (1|2|3), dueDate? }
// ─────────────────────────────────────────────
exports.createTask = async (req, res, next) => {
  try {
    const { title, description, projectId, assignedTo, priority, dueDate } = req.body;
    const { id: userId, companyId } = req.user;

    if (!title || typeof title !== 'string' || title.trim().length < 2) {
      return res.status(400).json({ error: 'Title is required (min 2 chars)' });
    }

    const pId = Number(projectId);
    if (Number.isNaN(pId)) {
      return res.status(400).json({ error: 'Valid projectId is required' });
    }

    const project = await findProjectInCompany(pId, companyId);
    if (!project || !project.isActive) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const normalizedPriority = normalizePriority(priority);
    if (normalizedPriority === null) {
      return res.status(400).json({
        error: 'Priority must be 1 (HIGH), 2 (MEDIUM) or 3 (LOW)',
      });
    }

    let assigneeId = null;
    if (assignedTo !== undefined && assignedTo !== null) {
      const aId = Number(assignedTo);
      if (Number.isNaN(aId)) {
        return res.status(400).json({ error: 'Invalid assignedTo' });
      }
      const assignee = await findUserInCompany(aId, companyId);
      if (!assignee) {
        return res.status(400).json({
          error: 'Assignee must be an active user in your company',
        });
      }
      assigneeId = aId;
    }

    let parsedDueDate = null;
    if (dueDate) {
      const d = new Date(dueDate);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Invalid dueDate' });
      }
      parsedDueDate = d;
    }

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        projectId: pId,
        assignedTo: assigneeId,
        createdBy: userId,
        priority: normalizedPriority,
        dueDate: parsedDueDate,
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });

    // Notify the assignee (don't notify yourself)
    if (assigneeId && assigneeId !== userId) {
      await createNotification({
        userId: assigneeId,
        type: 'TASK_ASSIGNED',
        title: 'New task assigned',
        message: `You were assigned "${task.title}"`,
        linkType: 'task',
        linkId: task.id,
      });
    }
    

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: withPriorityLevel(task),
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// GET /tasks
// filters: status, priority (1|2|3), assignedTo, projectId, includeInactive
// ─────────────────────────────────────────────
exports.getAllTasks = async (req, res, next) => {
  try {
    const { companyId } = req.user;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const where = {
      project: { companyId },
      ...(req.query.includeInactive === 'true' ? {} : { isActive: true }),
    };

    if (req.query.status) {
      if (!VALID_STATUSES.includes(req.query.status)) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
      where.status = req.query.status;
    }

    if (req.query.priority) {
      const normalized = normalizePriority(req.query.priority);
      if (!normalized) {
        return res.status(400).json({ error: 'Invalid priority filter' });
      }
      where.priority = normalized;
    }

    if (req.query.assignedTo) {
      where.assignedTo = Number(req.query.assignedTo);
    }

    if (req.query.projectId) {
      where.projectId = Number(req.query.projectId);
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          creator: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      data: withPriorityLevel(tasks),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// GET /tasks/me   → tasks assigned to current user
// ─────────────────────────────────────────────
exports.getMyTasks = async (req, res, next) => {
  try {
    const { id: userId, companyId } = req.user;

    const tasks = await prisma.task.findMany({
      where: {
        assignedTo: userId,
        isActive: true,
        project: { companyId },
      },
      orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
      include: {
        project: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    });

    res.json({ data: withPriorityLevel(tasks) });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// GET /tasks/:id   → single task + comments
// ─────────────────────────────────────────────
exports.getTask = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { companyId } = req.user;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid task id' });
    }

    const task = await prisma.task.findFirst({
      where: { id, project: { companyId } },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(withPriorityLevel(task));
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// PUT /tasks/:id   (admin + manager)
// body: { title?, description?, priority?, dueDate?, assignedTo? }
// ─────────────────────────────────────────────
exports.updateTask = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { companyId } = req.user;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid task id' });
    }

    const existing = await prisma.task.findFirst({
      where: { id, project: { companyId } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { title, description, priority, dueDate, assignedTo } = req.body;
    const data = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length < 2) {
        return res.status(400).json({ error: 'Title must be at least 2 chars' });
      }
      data.title = title.trim();
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== 'string') {
        return res.status(400).json({ error: 'Description must be a string' });
      }
      data.description = description ? description.trim() : null;
    }

    if (priority !== undefined) {
      const normalized = normalizePriority(priority);
      if (!normalized) {
        return res.status(400).json({
          error: 'Priority must be 1 (HIGH), 2 (MEDIUM) or 3 (LOW)',
        });
      }
      data.priority = normalized;
    }

    if (dueDate !== undefined) {
      if (dueDate === null) {
        data.dueDate = null;
      } else {
        const d = new Date(dueDate);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ error: 'Invalid dueDate' });
        }
        data.dueDate = d;
      }
    }

    if (assignedTo !== undefined) {
      if (assignedTo === null) {
        data.assignedTo = null;
      } else {
        const aId = Number(assignedTo);
        const assignee = await findUserInCompany(aId, companyId);
        if (!assignee) {
          return res.status(400).json({
            error: 'Assignee must be an active user in your company',
          });
        }
        data.assignedTo = aId;
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided' });
    }

    const task = await prisma.task.update({
      where: { id },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });

    res.json(withPriorityLevel({
      success: true,
      message: 'Task updated successfully',
      data:task
    }));
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// PATCH /tasks/:id/status
// Allowed: assignee, admin, manager
// body: { status }
// ─────────────────────────────────────────────
exports.updateTaskStatus = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { id: userId, role, companyId } = req.user;
    const { status } = req.body;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid task id' });
    }
    const normalizedStatus = normalizeStatus(status);
    if (!normalizedStatus) {
      return res.status(400).json({
        error: `Status must be 1 (TODO), 2 (IN_PROGRESS), 3 (REVIEW), 4 (COMPLETED) or one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const task = await prisma.task.findFirst({
      where: { id, project: { companyId } },
    });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const isAssignee = task.assignedTo === userId;
    const isPrivileged = role === 'admin' || role === 'manager';

    if (!isAssignee && !isPrivileged) {
      return res.status(403).json({
        error: 'Only the assignee, admin or manager can change status',
      });
    }

    const updated = await prisma.task.update({
      where: { id },
      data: { status: normalizedStatus },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });

        // Notify the creator and assignee — except whoever made the change
    const recipients = [];
    if (task.createdBy && task.createdBy !== userId) recipients.push(task.createdBy);
    if (task.assignedTo && task.assignedTo !== userId) recipients.push(task.assignedTo);

    if (recipients.length > 0) {
      await notifyMany(recipients, {
        type: 'STATUS_CHANGED',
        title: 'Task status changed',
        message: `"${updated.title}" is now ${updated.status}`,
        linkType: 'task',
        linkId: updated.id,
      });
    }

    res.json(withPriorityLevel(updated));
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// DELETE /tasks/:id   (admin + manager)  →  soft delete
// ─────────────────────────────────────────────
exports.deleteTask = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { companyId } = req.user;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid task id' });
    }

    const existing = await prisma.task.findFirst({
      where: { id, project: { companyId } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!existing.isActive) {
      return res.status(400).json({ error: 'Task is already inactive' });
    }

    const task = await prisma.task.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, title: true, isActive: true },
    });

    res.json({ message: 'Task deactivated', task });
  } catch (err) {
    next(err);
  }
};




