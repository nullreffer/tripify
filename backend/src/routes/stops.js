const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();
const router = express.Router({ mergeParams: true });

// Helper: resolve trip access and return role
async function resolveAccess(tripId, userId, requireWrite = false) {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      OR: [
        { userId },
        { members: { some: { userId } } }
      ]
    },
    include: { members: { where: { userId } } }
  });
  if (!trip) return null;
  const isOwner = trip.userId === userId;
  const memberRole = trip.members[0]?.role;
  if (requireWrite && !isOwner && memberRole !== 'PLANNER') return null;
  return { trip, isOwner, memberRole };
}

// GET /api/trips/:tripId/stops
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const access = await resolveAccess(req.params.tripId, req.user.id);
    if (!access) return res.status(404).json({ error: 'Trip not found' });
    const stops = await prisma.stop.findMany({
      where: { tripId: req.params.tripId },
      orderBy: { order: 'asc' }
    });
    res.json(stops);
  } catch (err) { next(err); }
});

// POST /api/trips/:tripId/stops
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const access = await resolveAccess(req.params.tripId, req.user.id, true);
    if (!access) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { name, address, lat, lng, pinType, notes, targetDate, metadata } = req.body;
    if (!name || lat == null || lng == null) {
      return res.status(400).json({ error: 'name, lat, and lng are required' });
    }

    // Place at end
    const maxOrder = await prisma.stop.aggregate({
      where: { tripId: req.params.tripId },
      _max: { order: true }
    });
    const order = (maxOrder._max.order ?? -1) + 1;

    const stop = await prisma.stop.create({
      data: {
        tripId: req.params.tripId,
        name: name.trim(),
        address,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        order,
        pinType: pinType || 'GENERAL',
        notes,
        targetDate: targetDate ? new Date(targetDate) : null,
        metadata: metadata || undefined
      }
    });

    // Touch trip updatedAt
    await prisma.trip.update({ where: { id: req.params.tripId }, data: {} });
    res.status(201).json(stop);
  } catch (err) { next(err); }
});

// PUT /api/trips/:tripId/stops/reorder
router.put('/reorder', requireAuth, async (req, res, next) => {
  try {
    const access = await resolveAccess(req.params.tripId, req.user.id, true);
    if (!access) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { ids, baseDate } = req.body; // ordered array of stop IDs; optional baseDate for auto-dating
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });

    // Determine base date for sequential dating when requested
    let base = null;
    if (baseDate) {
      base = new Date(baseDate);
      if (isNaN(base.getTime())) base = null;
    }

    await prisma.$transaction(
      ids.map((id, idx) => {
        const data = { order: idx };
        if (base !== null) {
          const d = new Date(base);
          d.setDate(d.getDate() + idx);
          data.targetDate = d;
        }
        return prisma.stop.update({
          where: { id, tripId: req.params.tripId },
          data
        });
      })
    );
    await prisma.trip.update({ where: { id: req.params.tripId }, data: {} });
    // Return updated stops so frontend can sync
    const updated = await prisma.stop.findMany({
      where: { tripId: req.params.tripId },
      orderBy: { order: 'asc' }
    });
    res.json({ ok: true, stops: updated });
  } catch (err) { next(err); }
});

// PUT /api/trips/:tripId/stops/:stopId
router.put('/:stopId', requireAuth, async (req, res, next) => {
  try {
    const access = await resolveAccess(req.params.tripId, req.user.id, true);
    if (!access) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { name, address, lat, lng, pinType, notes, targetDate, metadata } = req.body;
    const stop = await prisma.stop.findFirst({
      where: { id: req.params.stopId, tripId: req.params.tripId }
    });
    if (!stop) return res.status(404).json({ error: 'Stop not found' });

    const updated = await prisma.stop.update({
      where: { id: req.params.stopId },
      data: {
        name: name?.trim() ?? stop.name,
        address: address !== undefined ? address : stop.address,
        lat: lat != null ? parseFloat(lat) : stop.lat,
        lng: lng != null ? parseFloat(lng) : stop.lng,
        pinType: pinType ?? stop.pinType,
        notes: notes !== undefined ? notes : stop.notes,
        targetDate: targetDate !== undefined ? (targetDate ? new Date(targetDate) : null) : stop.targetDate,
        metadata: metadata !== undefined ? metadata : stop.metadata
      }
    });
    await prisma.trip.update({ where: { id: req.params.tripId }, data: {} });
    res.json(updated);
  } catch (err) { next(err); }
});

// POST /api/trips/:tripId/stops/:stopId/reach
router.post('/:stopId/reach', requireAuth, async (req, res, next) => {
  try {
    const access = await resolveAccess(req.params.tripId, req.user.id, true);
    if (!access) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { reached } = req.body;
    const stop = await prisma.stop.findFirst({
      where: { id: req.params.stopId, tripId: req.params.tripId }
    });
    if (!stop) return res.status(404).json({ error: 'Stop not found' });

    const updated = await prisma.stop.update({
      where: { id: req.params.stopId },
      data: {
        reached: reached !== false,
        reachedAt: reached !== false ? new Date() : null
      }
    });
    await prisma.trip.update({ where: { id: req.params.tripId }, data: {} });
    res.json(updated);
  } catch (err) { next(err); }
});

// POST /api/trips/:tripId/stops/:stopId/photo
// Accepts { photo: "data:image/jpeg;base64,..." } — stores in stop.metadata and updates trip.coverImage
router.post('/:stopId/photo', requireAuth, async (req, res, next) => {
  try {
    const access = await resolveAccess(req.params.tripId, req.user.id, true);
    if (!access) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { photo } = req.body;
    if (!photo || !photo.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Valid base64 image required' });
    }

    // Rough size check — base64 of 600KB ≈ 820K chars
    if (photo.length > 900000) {
      return res.status(413).json({ error: 'Image too large. Max ~600 KB.' });
    }

    const stop = await prisma.stop.findFirst({
      where: { id: req.params.stopId, tripId: req.params.tripId }
    });
    if (!stop) return res.status(404).json({ error: 'Stop not found' });

    const existingMeta = (stop.metadata && typeof stop.metadata === 'object') ? stop.metadata : {};
    const updated = await prisma.stop.update({
      where: { id: req.params.stopId },
      data: { metadata: { ...existingMeta, photo } }
    });

    // Update trip coverImage to this photo (most recent reached stop wins)
    await prisma.trip.update({
      where: { id: req.params.tripId },
      data: { coverImage: photo }
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/trips/:tripId/stops/:stopId
router.delete('/:stopId', requireAuth, async (req, res, next) => {
  try {
    const access = await resolveAccess(req.params.tripId, req.user.id, true);
    if (!access) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const stop = await prisma.stop.findFirst({
      where: { id: req.params.stopId, tripId: req.params.tripId }
    });
    if (!stop) return res.status(404).json({ error: 'Stop not found' });

    await prisma.stop.delete({ where: { id: req.params.stopId } });

    // Re-normalize order
    const remaining = await prisma.stop.findMany({
      where: { tripId: req.params.tripId },
      orderBy: { order: 'asc' }
    });
    await prisma.$transaction(
      remaining.map((s, idx) =>
        prisma.stop.update({ where: { id: s.id }, data: { order: idx } })
      )
    );
    await prisma.trip.update({ where: { id: req.params.tripId }, data: {} });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
