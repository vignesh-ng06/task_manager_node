const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const SALT_ROUNDS = 10;

const isValidEmail = (email) =>
  typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const signToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// ─────────────────────────────────────────────
// POST /auth/register
// Creates a Company + an admin User (transaction)
// body: { email, password, name?, companyName, industry?, website?, logoUrl? }
// ─────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const {
      email,
      password,
      name,
      companyName,
      industry,
      website,
      logoUrl,
    } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 chars' });
    }
    if (!companyName || companyName.trim().length < 2) {
      return res
        .status(400)
        .json({ error: 'companyName is required (min 2 chars)' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName.trim(),
          industry: industry?.trim() || null,
          website: website?.trim() || null,
          logoUrl: logoUrl?.trim() || null,
        },
      });

      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashed,
          name: name?.trim() || null,
          role: 'admin',
          companyId: company.id,
        },
      });

      return { company, user };
    });

    const token = signToken(result.user);

    res.status(201).json({
    //   token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        companyId: result.user.companyId,
      },
      company: {
        id: result.company.id,
        name: result.company.name,
        industry: result.company.industry,
        website: result.company.website,
        logoUrl: result.company.logoUrl,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// POST /auth/login
// body: { email, password }
// ─────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        company: {
          select: { id: true, name: true, industry: true, logoUrl: true },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated. Contact your admin.' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
      },
      company: user.company,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// GET /auth/me  (protected)
// ─────────────────────────────────────────────
exports.me = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            name: true,
            industry: true,
            website: true,
            logoUrl: true,
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
