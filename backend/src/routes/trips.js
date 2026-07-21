const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();
const router = express.Router();

router.use(requireAuth);

// List all trips the user owns OR is a member of
router.get('/', async (req, res, next) => {
  try {
    const include = {
      members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      _count: { select: { stops: true } },
      stops: { where: { reached: true }, select: { id: true } }
    };

    const [owned, membered] = await Promise.all([
      prisma.trip.findMany({
        where: { userId: req.user.id },
        include,
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.tripMember.findMany({
        where: { userId: req.user.id },
        include: { trip: { include } },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const ownedIds = new Set(owned.map(t => t.id));
    const memberTrips = membered
      .filter(m => !ownedIds.has(m.trip.id))
      .map(m => ({ ...m.trip, memberRole: m.role }));

    const format = (t, role) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      coverImage: t.coverImage,
      startDate: t.startDate,
      endDate: t.endDate,
      stopCount: t._count.stops,
      reachedCount: t.stops.length,
      members: t.members,
      memberRole: role,
      updatedAt: t.updatedAt,
      createdAt: t.createdAt
    });

    const result = [
      ...owned.map(t => format(t, 'OWNER')),
      ...memberTrips.map(t => format(t, t.memberRole))
    ];
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Trip title is required' });
    }
    const trip = await prisma.trip.create({
      data: {
        title: title.trim(),
        userId: req.user.id
      }
    });
    res.status(201).json(trip);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const trip = await prisma.trip.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { userId: req.user.id },
          { members: { some: { userId: req.user.id } } }
        ]
      },
      include: { members: { include: { user: { select: { id: true, name: true, avatar: true } } } } }
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const memberRole = trip.userId === req.user.id
      ? 'OWNER'
      : trip.members.find(m => m.userId === req.user.id)?.role;
    res.json({ ...trip, memberRole });
  } catch (err) {
    next(err);
  }
});

// Only owner or PLANNER members can edit
router.put('/:id', async (req, res, next) => {
  try {
    const { title, description, coverImage, startDate, endDate } = req.body;
    const trip = await prisma.trip.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { userId: req.user.id },
          { members: { some: { userId: req.user.id, role: 'PLANNER' } } }
        ]
      }
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found or insufficient permissions' });
    const updated = await prisma.trip.update({
      where: { id: req.params.id },
      data: {
        title: title?.trim() ?? trip.title,
        description: description !== undefined ? description : trip.description,
        coverImage: coverImage !== undefined ? coverImage : trip.coverImage,
        startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : trip.startDate,
        endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : trip.endDate,
      }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Only owner can delete
router.delete('/:id', async (req, res, next) => {
  try {
    const trip = await prisma.trip.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    await prisma.trip.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
