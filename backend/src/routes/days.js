const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();
const router = express.Router({ mergeParams: true });

async function requireTripAccess(tripId, userId, write = false) {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, OR: [{ userId }, { members: { some: { userId } } }] },
    include: { members: { where: { userId } } }
  });
  if (!trip) return null;
  const isOwner = trip.userId === userId;
  const role = trip.members[0]?.role;
  if (write && !isOwner && role !== 'PLANNER') return null;
  return trip;
}

// GET /api/trips/:tripId/days
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const days = await prisma.tripDay.findMany({
      where: { tripId: req.params.tripId },
      orderBy: { order: 'asc' },
      include: {
        entries: {
          orderBy: { order: 'asc' },
          include: { reservation: true, stop: { select: { id: true, name: true, lat: true, lng: true, pinType: true } } }
        }
      }
    });
    res.json(days);
  } catch (err) { next(err); }
});

// POST /api/trips/:tripId/days
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { date, title, location, notes, shower } = req.body;
    const max = await prisma.tripDay.aggregate({
      where: { tripId: req.params.tripId }, _max: { order: true }
    });
    const day = await prisma.tripDay.create({
      data: {
        tripId: req.params.tripId,
        date: date ? new Date(date) : null,
        title: title?.trim() || null,
        location: location?.trim() || null,
        notes: notes?.trim() || null,
        shower: shower || 'UNKNOWN',
        order: (max._max.order ?? -1) + 1
      },
      include: { entries: true }
    });
    res.status(201).json(day);
  } catch (err) { next(err); }
});

// PUT /api/trips/:tripId/days/:dayId
router.put('/:dayId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { date, title, location, notes, shower, order } = req.body;
    const data = {};
    if (date !== undefined) data.date = date ? new Date(date) : null;
    if (title !== undefined) data.title = title?.trim() || null;
    if (location !== undefined) data.location = location?.trim() || null;
    if (notes !== undefined) data.notes = notes?.trim() || null;
    if (shower !== undefined) data.shower = shower;
    if (order !== undefined) data.order = order;

    const day = await prisma.tripDay.update({
      where: { id: req.params.dayId },
      data,
      include: { entries: { orderBy: { order: 'asc' }, include: { reservation: true } } }
    });
    res.json(day);
  } catch (err) { next(err); }
});

// DELETE /api/trips/:tripId/days/:dayId
router.delete('/:dayId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    await prisma.tripDay.delete({ where: { id: req.params.dayId } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/trips/:tripId/days/reorder
router.post('/reorder', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { ids } = req.body; // ordered array of day ids
    await Promise.all(ids.map((id, order) => prisma.tripDay.update({ where: { id }, data: { order } })));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Entries ───────────────────────────────────────────────────────────────────

// POST /api/trips/:tripId/days/:dayId/entries
router.post('/:dayId/entries', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { type, title, description, startTime, endTime, durationMins, fromLocation, toLocation, stopId, metadata } = req.body;
    if (!type || !title?.trim()) return res.status(400).json({ error: 'type and title are required' });

    const max = await prisma.dayEntry.aggregate({
      where: { dayId: req.params.dayId }, _max: { order: true }
    });
    const entry = await prisma.dayEntry.create({
      data: {
        dayId: req.params.dayId,
        type,
        title: title.trim(),
        description: description?.trim() || null,
        startTime: startTime || null,
        endTime: endTime || null,
        durationMins: durationMins || null,
        order: (max._max.order ?? -1) + 1,
        fromLocation: fromLocation?.trim() || null,
        toLocation: toLocation?.trim() || null,
        stopId: stopId || null,
        metadata: metadata || null
      },
      include: { reservation: true, stop: { select: { id: true, name: true, lat: true, lng: true, pinType: true } } }
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

// PUT /api/trips/:tripId/days/:dayId/entries/:entryId
router.put('/:dayId/entries/:entryId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { type, title, description, startTime, endTime, durationMins, fromLocation, toLocation, stopId, metadata, order } = req.body;
    const data = {};
    if (type !== undefined) data.type = type;
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (startTime !== undefined) data.startTime = startTime || null;
    if (endTime !== undefined) data.endTime = endTime || null;
    if (durationMins !== undefined) data.durationMins = durationMins || null;
    if (fromLocation !== undefined) data.fromLocation = fromLocation?.trim() || null;
    if (toLocation !== undefined) data.toLocation = toLocation?.trim() || null;
    if (stopId !== undefined) data.stopId = stopId || null;
    if (metadata !== undefined) data.metadata = metadata || null;
    if (order !== undefined) data.order = order;

    const entry = await prisma.dayEntry.update({
      where: { id: req.params.entryId },
      data,
      include: { reservation: true, stop: { select: { id: true, name: true, lat: true, lng: true, pinType: true } } }
    });
    res.json(entry);
  } catch (err) { next(err); }
});

// DELETE /api/trips/:tripId/days/:dayId/entries/:entryId
router.delete('/:dayId/entries/:entryId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    await prisma.dayEntry.delete({ where: { id: req.params.entryId } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/trips/:tripId/days/:dayId/entries/reorder
router.post('/:dayId/entries/reorder', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { ids } = req.body;
    await Promise.all(ids.map((id, order) => prisma.dayEntry.update({ where: { id }, data: { order } })));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
