const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');

const SALT_ROUNDS = 10;

const isValidEmail = (email) =>
  typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Roles an admin can assign when creating users (never 'admin')
const CREATABLE_ROLES = ['manager', 'employee'];

// ─────────────────────────────────────────────
// POST /users   (admin only)
// Creates a manager or employee inside the admin's own company
// body: { email, password, name?, role }
// ─────────────────────────────────────────────
exports.createUser = async (req, res, next) => {
  try {
    const { email, password, name, role } = req.body;
    const companyId = req.user.companyId; // from JWT

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 chars' });
    }
    if (!role || !CREATABLE_ROLES.includes(role)) {
      return res.status(400).json({
        error: `Role must be one of: ${CREATABLE_ROLES.join(', ')}`,
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashed,
        name: name?.trim() || null,
        role,
        companyId, // forced to the admin's company — cannot be spoofed
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        createdAt: true,
      },
    });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// GET /users?page=1&limit=20   (admin + manager)
// Lists only users from the caller's company
// ─────────────────────────────────────────────
exports.getAllUsers = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const where = { companyId };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// GET /users/:id   (admin + manager)
// Only users from the caller's company
// ─────────────────────────────────────────────
exports.getUser = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.user.companyId;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const user = await prisma.user.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        isActive: true,
        projectsCreated: {
          select: { id: true, name: true, createdAt: true },
        },
        tasksAssigned: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// PUT /users/:id   (admin only)
// Only users from the caller's company
// body: { name?, role?, password? }
// ─────────────────────────────────────────────
exports.updateUser = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.user.companyId;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const target = await prisma.user.findFirst({ where: { id, companyId } });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { name, role, password } = req.body;
    const data = {};

    if (name !== undefined) {
      if (name !== null && typeof name !== 'string') {
        return res.status(400).json({ error: 'Name must be a string' });
      }
      data.name = name ? name.trim() : null;
    }

    if (role !== undefined) {
      if (!CREATABLE_ROLES.includes(role)) {
        return res.status(400).json({
          error: `Role must be one of: ${CREATABLE_ROLES.join(', ')}`,
        });
      }
      data.role = role;
    }

    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 chars' });
      }
      data.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided' });
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// DELETE /users/:id   (admin only)
// Can't delete yourself; only same-company users
// ─────────────────────────────────────────────
exports.deleteUser = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.user.companyId;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    if (id === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate yourself' });
    }

    const target = await prisma.user.findFirst({ where: { id, companyId } });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!target.isActive) {
      return res.status(400).json({ error: 'User is already inactive' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    res.json({ success: true, message: 'User deactivated', user });
  } catch (err) {
    next(err);
  }
};
