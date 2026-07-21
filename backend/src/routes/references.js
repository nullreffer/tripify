const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();
const router = express.Router({ mergeParams: true });

async function requireTripAccess(tripId, userId, write = false) {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      OR: [{ userId }, { members: { some: { userId } } }]
    },
    include: { members: { where: { userId } } }
  });
  if (!trip) return null;
  const isOwner = trip.userId === userId;
  const role = trip.members[0]?.role;
  if (write && !isOwner && role !== 'PLANNER') return null;
  return trip;
}

// GET /api/trips/:tripId/references
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const refs = await prisma.externalReference.findMany({
      where: { tripId: req.params.tripId },
      orderBy: { createdAt: 'asc' }
    });
    res.json(refs);
  } catch (err) { next(err); }
});

// POST /api/trips/:tripId/references
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { name, url, refType } = req.body;
    if (!name?.trim() || !url?.trim()) {
      return res.status(400).json({ error: 'name and url are required' });
    }
    // Basic URL validation
    try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

    const ref = await prisma.externalReference.create({
      data: { tripId: req.params.tripId, name: name.trim(), url: url.trim(), refType: refType || 'LINK' }
    });
    res.status(201).json(ref);
  } catch (err) { next(err); }
});

// PUT /api/trips/:tripId/references/:refId
router.put('/:refId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { name, url, refType } = req.body;
    const ref = await prisma.externalReference.update({
      where: { id: req.params.refId },
      data: {
        name: name?.trim(),
        url: url?.trim(),
        refType: refType || undefined
      }
    });
    res.json(ref);
  } catch (err) { next(err); }
});

// DELETE /api/trips/:tripId/references/:refId
router.delete('/:refId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });
    await prisma.externalReference.delete({ where: { id: req.params.refId } });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
