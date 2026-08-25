const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');
const { sendPushToTripMembers } = require('./notifications');

const prisma = new PrismaClient();
const router = express.Router();

router.use(requireAuth);

// List all trips the user owns OR is a member of
router.get('/', async (req, res, next) => {
  try {
    const include = {
      members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      // Fetch all stops with metadata so we can exclude saved-for-later when
      // computing stopCount / reachedCount (saved-for-later stops cannot be
      // "reached" so they must not inflate the total against which we compare).
      stops: { select: { id: true, reached: true, metadata: true } }
    };

    const dbStart = Date.now();
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
    const dbMs = Date.now() - dbStart;
    if (dbMs > 500) {
      console.warn(`[db-slow] GET /api/trips db query ${dbMs}ms (owned=${owned.length}, membered=${membered.length})`);
    } else {
      console.log(`[db] GET /api/trips db query ${dbMs}ms (owned=${owned.length}, membered=${membered.length})`);
    }

    const ownedIds = new Set(owned.map(t => t.id));
    const memberTrips = membered
      .filter(m => !ownedIds.has(m.trip.id))
      .map(m => ({ ...m.trip, memberRole: m.role }));

    const format = (t, role) => {
      // Exclude saved-for-later stops from the completion calculation — only
      // route stops can be marked reached, so the denominator must match.
      const routeStops = t.stops.filter(s => !s.metadata?.savedForLater);
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        coverImage: t.coverImage,
        coverImagePosition: t.coverImagePosition,
        startDate: t.startDate,
        endDate: t.endDate,
        stopCount: routeStops.length,
        reachedCount: routeStops.filter(s => s.reached).length,
        members: t.members,
        memberRole: role,
        updatedAt: t.updatedAt,
        createdAt: t.createdAt
      };
    };

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
    const { title, description } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Trip title is required' });
    }
    const trip = await prisma.trip.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
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
    const dbStart = Date.now();
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
    const dbMs = Date.now() - dbStart;
    if (dbMs > 500) console.warn(`[db-slow] GET /api/trips/:id db query ${dbMs}ms`);
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
    const { title, description, coverImage, coverImagePosition, startDate, endDate } = req.body;
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
    const parsedCoverPosition = coverImagePosition !== undefined ? Number(coverImagePosition) : null;
    const clampedCoverPosition = Number.isFinite(parsedCoverPosition)
      ? Math.max(0, Math.min(100, Math.round(parsedCoverPosition)))
      : trip.coverImagePosition;
    const updated = await prisma.trip.update({
      where: { id: req.params.id },
      data: {
        title: title?.trim() ?? trip.title,
        description: description !== undefined ? description : trip.description,
        coverImage: coverImage !== undefined ? coverImage : trip.coverImage,
        coverImagePosition: coverImagePosition !== undefined ? clampedCoverPosition : trip.coverImagePosition,
        startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : trip.startDate,
        endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : trip.endDate,
      }
    });
    // Notify members when trip details (not just cover image) are updated
    if (title !== undefined || description !== undefined || startDate !== undefined || endDate !== undefined) {
      sendPushToTripMembers(req.params.id, req.user.id, 'Trip updated', `${req.user.name} updated trip details.`);
    }
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
