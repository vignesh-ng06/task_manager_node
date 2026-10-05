const prisma = require('../config/prisma');

// ─────────────────────────────────────────────
// POST /projects   (admin + manager)
// body: { name, description? }
// companyId + createdBy come from the JWT
// ─────────────────────────────────────────────
exports.createProject = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const { id: userId, companyId } = req.user;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name is required (min 2 chars)' });
    }

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        companyId,
        createdBy: userId,
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json(project);
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
        },
      }),
      prisma.project.count({ where }),
    ]);

    res.json({
      data: projects,
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

    res.json(project);
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

    const { name, description } = req.body;
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

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided' });
    }

    const project = await prisma.project.update({
      where: { id },
      data,
      include: { creator: { select: { id: true, name: true, email: true } } },
    });

    res.json(project);
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
