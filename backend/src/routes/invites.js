const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();

// ── Trip-scoped routes (mounted at /api/trips) ──────────────────────────────

const tripRouter = express.Router();

// Create an invite link — owner or PLANNER only
tripRouter.post('/:tripId/invites', requireAuth, async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['PLANNER', 'VIEWER'].includes(role)) {
      return res.status(400).json({ error: 'role must be PLANNER or VIEWER' });
    }

    const trip = await prisma.trip.findFirst({
      where: {
        id: req.params.tripId,
        OR: [
          { userId: req.user.id },
          { members: { some: { userId: req.user.id, role: 'PLANNER' } } }
        ]
      }
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found or insufficient permissions' });

    const invite = await prisma.invite.create({
      data: { tripId: req.params.tripId, role, createdById: req.user.id }
    });

    const baseUrl = process.env.FRONTEND_URL.split(',')[0];
    const link = `${baseUrl}/invite/${invite.token}`;
    res.status(201).json({ token: invite.token, link, role });
  } catch (err) {
    next(err);
  }
});

// List members
tripRouter.get('/:tripId/members', requireAuth, async (req, res, next) => {
  try {
    const trip = await prisma.trip.findFirst({
      where: {
        id: req.params.tripId,
        OR: [
          { userId: req.user.id },
          { members: { some: { userId: req.user.id } } }
        ]
      },
      include: {
        user: { select: { id: true, name: true, avatar: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, avatar: true, email: true } } } }
      }
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const members = [
      { user: trip.user, role: 'OWNER' },
      ...trip.members.map(m => ({ user: m.user, role: m.role, memberId: m.id }))
    ];
    res.json(members);
  } catch (err) {
    next(err);
  }
});

// Remove a member (owner only)
tripRouter.delete('/:tripId/members/:userId', requireAuth, async (req, res, next) => {
  try {
    const trip = await prisma.trip.findFirst({
      where: { id: req.params.tripId, userId: req.user.id }
    });
    if (!trip) return res.status(403).json({ error: 'Only the trip owner can remove members' });

    await prisma.tripMember.deleteMany({
      where: { tripId: req.params.tripId, userId: req.params.userId }
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── Standalone invite routes (mounted at /api/invites) ───────────────────────

const inviteRouter = express.Router();

// Preview an invite — no auth so unauthenticated users see trip name before logging in
inviteRouter.get('/:token', async (req, res, next) => {
  try {
    const invite = await prisma.invite.findUnique({
      where: { token: req.params.token },
      include: {
        trip: { select: { id: true, title: true } },
        createdBy: { select: { name: true } }
      }
    });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.usedAt) return res.status(410).json({ error: 'This invite link has already been used' });

    res.json({
      tripId: invite.trip.id,
      tripTitle: invite.trip.title,
      role: invite.role,
      invitedBy: invite.createdBy.name
    });
  } catch (err) {
    next(err);
  }
});

// Accept an invite
inviteRouter.post('/:token/accept', requireAuth, async (req, res, next) => {
  try {
    const invite = await prisma.invite.findUnique({
      where: { token: req.params.token },
      include: { trip: true }
    });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.usedAt) return res.status(410).json({ error: 'This invite link has already been used' });

    if (invite.trip.userId === req.user.id) {
      return res.status(400).json({ error: 'You already own this trip' });
    }

    const existing = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId: invite.tripId, userId: req.user.id } }
    });
    if (existing) {
      return res.status(400).json({ error: 'You are already a member of this trip' });
    }

    const [, member] = await prisma.$transaction([
      prisma.invite.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedById: req.user.id }
      }),
      prisma.tripMember.create({
        data: { tripId: invite.tripId, userId: req.user.id, role: invite.role }
      })
    ]);

    res.json({ tripId: invite.tripId, role: member.role });
  } catch (err) {
    next(err);
  }
});

module.exports = { tripRouter, inviteRouter };

