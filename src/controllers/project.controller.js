const prisma = require('../config/prisma');


// Flatten members[] → array of user objects
const shapeProject = (p) => {
  if (!p) return p;
  if (Array.isArray(p)) return p.map(shapeProject);
  const shaped = { ...p };
  if (shaped.members) {
    shaped.members = shaped.members.map((m) => m.user);
  }
  return shaped;
};
// ─────────────────────────────────────────────
// POST /projects   (admin + manager)
// body: { name, description? }
// companyId + createdBy come from the JWT
// ─────────────────────────────────────────────
exports.createProject = async (req, res, next) => {
  try {
    const { name, description, memberIds } = req.body;
    const { id: userId, companyId } = req.user;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name is required (min 2 chars)' });
    }

    // Validate members if provided
    let validMemberIds = [];
    if (Array.isArray(memberIds) && memberIds.length > 0) {
      validMemberIds = [...new Set(memberIds.map(Number))];
      if (validMemberIds.some(Number.isNaN)) {
        return res.status(400).json({ error: 'Invalid memberIds' });
      }
      const users = await prisma.user.findMany({
        where: {
          id: { in: validMemberIds },
          companyId,
          isActive: true,
        },
        select: { id: true },
      });
      if (users.length !== validMemberIds.length) {
        return res
          .status(400)
          .json({ error: 'All members must be active users in your company' });
      }
    }

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        companyId,
        createdBy: userId,
        members: {
          create: validMemberIds.map((uid) => ({ userId: uid })),
        },
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });

    res.status(201).json(shapeProject(project));
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// GET /projects?page=1&limit=20&includeInactive=false
// All roles — only their company's projects
// ─────────────────────────────────────────────
exports.getAllProjects = async (req, res, next) => {
  try {
    const { companyId } = req.user;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const includeInactive = req.query.includeInactive === 'true';

    const where = {
      companyId,
      ...(includeInactive ? {} : { isActive: true }),
    };

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          creator: { select: { id: true, name: true, email: true } },
          _count: { select: { tasks: true } },
          members: {                                 
            include: {                             
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          },
        },
      }),
      prisma.project.count({ where }),
    ]);

    res.json({
      data: projects.map(shapeProject),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// GET /projects/:id  —  one project + its tasks
// ─────────────────────────────────────────────
exports.getProject = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { companyId } = req.user;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const project = await prisma.project.findFirst({
      where: { id, companyId },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            creator: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(shapeProject(project));
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// PUT /projects/:id   (admin + manager)
// body: { name?, description? }
// ─────────────────────────────────────────────
exports.updateProject = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { companyId } = req.user;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const existing = await prisma.project.findFirst({ where: { id, companyId } });
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { name, description, memberIds } = req.body;
    const data = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 chars' });
      }
      data.name = name.trim();
    }
    if (description !== undefined) {
      if (description !== null && typeof description !== 'string') {
        return res.status(400).json({ error: 'Description must be a string' });
      }
      data.description = description ? description.trim() : null;
    }

    // Validate members if provided
    let validMemberIds = null;
    if (Array.isArray(memberIds)) {
      validMemberIds = [...new Set(memberIds.map(Number))];
      if (validMemberIds.some(Number.isNaN)) {
        return res.status(400).json({ error: 'Invalid memberIds' });
      }
      if (validMemberIds.length > 0) {
        const users = await prisma.user.findMany({
          where: { id: { in: validMemberIds }, companyId, isActive: true },
          select: { id: true },
        });
        if (users.length !== validMemberIds.length) {
          return res
            .status(400)
            .json({ error: 'All members must be active users in your company' });
        }
      }
    }

    if (Object.keys(data).length === 0 && validMemberIds === null) {
      return res.status(400).json({ error: 'No valid fields provided' });
    }

    // Transaction: update project + replace members
    const project = await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.project.update({ where: { id }, data });
      }

      if (validMemberIds !== null) {
        await tx.projectMember.deleteMany({ where: { projectId: id } });
        if (validMemberIds.length > 0) {
          await tx.projectMember.createMany({
            data: validMemberIds.map((uid) => ({ projectId: id, userId: uid })),
          });
        }
      }

      return tx.project.findUnique({
        where: { id },
        include: {
          creator: { select: { id: true, name: true, email: true } },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          },
        },
      });
    });

    res.json(shapeProject(project));
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// DELETE /projects/:id   (admin only)  →  soft delete
// ─────────────────────────────────────────────
exports.deleteProject = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { companyId } = req.user;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const existing = await prisma.project.findFirst({ where: { id, companyId } });
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (!existing.isActive) {
      return res.status(400).json({ error: 'Project is already inactive' });
    }

    const project = await prisma.project.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, name: true, isActive: true },
    });

    res.json({ message: 'Project deactivated', project });
  } catch (err) {
    next(err);
  }
};



// POST /projects/:id/members  body: { userIds: [1,2,3] }
exports.addMembers = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { companyId } = req.user;
    const { userIds } = req.body;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }

    const project = await prisma.project.findFirst({ where: { id, companyId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const ids = [...new Set(userIds.map(Number))];
    const validUsers = await prisma.user.findMany({
      where: { id: { in: ids }, companyId, isActive: true },
      select: { id: true },
    });
    if (validUsers.length !== ids.length) {
      return res
        .status(400)
        .json({ error: 'All users must be active members of your company' });
    }

    await prisma.projectMember.createMany({
      data: ids.map((uid) => ({ projectId: id, userId: uid })),
      skipDuplicates: true,
    });

    const updated = await prisma.project.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });

    res.json(shapeProject(updated));
  } catch (err) {
    next(err);
  }
};

// DELETE /projects/:id/members/:userId
exports.removeMember = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const userId = Number(req.params.userId);
    const { companyId } = req.user;

    if (Number.isNaN(id) || Number.isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid ids' });
    }

    const project = await prisma.project.findFirst({ where: { id, companyId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Option C: leave tasks assigned, just stop future assignment
    await prisma.projectMember.deleteMany({
      where: { projectId: id, userId },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
