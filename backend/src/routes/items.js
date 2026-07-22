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

// GET /api/trips/:tripId/items  →  categories with nested items
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const categories = await prisma.itemCategory.findMany({
      where: { tripId: req.params.tripId },
      orderBy: { order: 'asc' },
      include: { items: { orderBy: { order: 'asc' } } }
    });
    res.json(categories);
  } catch (err) { next(err); }
});

// POST /api/trips/:tripId/categories
router.post('/categories', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const max = await prisma.itemCategory.aggregate({
      where: { tripId: req.params.tripId }, _max: { order: true }
    });
    const cat = await prisma.itemCategory.create({
      data: { tripId: req.params.tripId, name: name.trim(), order: (max._max.order ?? -1) + 1 },
      include: { items: true }
    });
    res.status(201).json(cat);
  } catch (err) { next(err); }
});

// PUT /api/trips/:tripId/categories/:catId
router.put('/categories/:catId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { name } = req.body;
    const cat = await prisma.itemCategory.update({
      where: { id: req.params.catId },
      data: { name: name?.trim() },
      include: { items: true }
    });
    res.json(cat);
  } catch (err) { next(err); }
});

// DELETE /api/trips/:tripId/categories/:catId
router.delete('/categories/:catId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    await prisma.itemCategory.delete({ where: { id: req.params.catId } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /api/trips/:tripId/categories/:catId/items
router.post('/categories/:catId/items', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { name, color, quantity, unit, notes: itemNotes, required, status } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const max = await prisma.tripItem.aggregate({
      where: { categoryId: req.params.catId }, _max: { order: true }
    });
    const item = await prisma.tripItem.create({
      data: {
        categoryId: req.params.catId,
        name: name.trim(),
        color: color || null,
        quantity: quantity != null ? Number(quantity) : null,
        unit: unit?.trim() || null,
        notes: itemNotes?.trim() || null,
        required: required === true,
        status: status || 'have',
        order: (max._max.order ?? -1) + 1
      }
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

// PUT /api/trips/:tripId/items/:itemId
router.put('/items/:itemId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { name, done, color, quantity, unit, notes: itemNotes, required, status } = req.body;
    const item = await prisma.tripItem.update({
      where: { id: req.params.itemId },
      data: {
        name: name?.trim(),
        done: done !== undefined ? Boolean(done) : undefined,
        color: color !== undefined ? color : undefined,
        quantity: quantity !== undefined ? (quantity != null ? Number(quantity) : null) : undefined,
        unit: unit !== undefined ? (unit?.trim() || null) : undefined,
        notes: itemNotes !== undefined ? (itemNotes?.trim() || null) : undefined,
        required: required !== undefined ? Boolean(required) : undefined,
        status: status !== undefined ? status : undefined
      }
    });
    res.json(item);
  } catch (err) { next(err); }
});

// DELETE /api/trips/:tripId/items/:itemId
router.delete('/items/:itemId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    await prisma.tripItem.delete({ where: { id: req.params.itemId } });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
