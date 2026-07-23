const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();
const router = express.Router();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'iamjaydesai@gmail.com').trim().toLowerCase();

function requireAdmin(req, res, next) {
  const email = req.user?.email?.toLowerCase();
  if (email === ADMIN_EMAIL) return next();
  return res.status(403).json({ error: 'Admin access required' });
}

router.use(requireAuth);
router.use(requireAdmin);

router.get('/reports', async (_req, res, next) => {
  try {
    const [
      totalUsers,
      approvedUsers,
      pendingUsers,
      totalTrips,
      totalInvites,
      usedInvites,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isApproved: true } }),
      prisma.user.count({ where: { isApproved: false } }),
      prisma.trip.count(),
      prisma.invite.count(),
      prisma.invite.count({ where: { usedAt: { not: null } } }),
    ]);

    res.json({
      totalUsers,
      approvedUsers,
      pendingUsers,
      totalTrips,
      totalInvites,
      usedInvites,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/approvals', async (_req, res, next) => {
  try {
    const pending = await prisma.user.findMany({
      where: { isApproved: false },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    res.json(pending);
  } catch (err) {
    next(err);
  }
});

router.post('/approvals/:userId/approve', async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: {
        isApproved: true,
        approvedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        isApproved: true,
        approvedAt: true,
      },
    });

    res.json(user);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    next(err);
  }
});

module.exports = router;
