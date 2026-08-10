const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');
const { sendPushToTripMembers } = require('./notifications');

const prisma = new PrismaClient();
const router = express.Router({ mergeParams: true });

const itemAssociationsInclude = {
  orderBy: { createdAt: 'asc' },
  include: {
    entry: {
      select: {
        id: true,
        title: true,
        type: true,
        startTime: true,
        endTime: true,
        day: {
          select: {
            id: true,
            date: true,
            title: true,
            location: true
          }
        }
      }
    },
    day: {
      select: {
        id: true,
        date: true,
        title: true,
        location: true
      }
    }
  }
};

const itemInclude = {
  associations: itemAssociationsInclude
};

const categoryInclude = {
  items: {
    orderBy: { order: 'asc' },
    include: itemInclude
  }
};

const associationResponseInclude = {
  item: {
    select: {
      id: true,
      categoryId: true,
      name: true,
      status: true,
      required: true,
      done: true,
      color: true,
      quantity: true,
      unit: true
    }
  },
  entry: {
    select: {
      id: true,
      title: true,
      type: true,
      startTime: true,
      endTime: true,
      day: {
        select: {
          id: true,
          date: true,
          title: true,
          location: true
        }
      }
    }
  },
  day: {
    select: {
      id: true,
      date: true,
      title: true,
      location: true
    }
  }
};

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
      include: categoryInclude
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
      include: categoryInclude
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
      include: categoryInclude
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
      },
      include: itemInclude
    });
    sendPushToTripMembers(req.params.tripId, req.user.id, 'Packing list updated', `${req.user.name} added "${item.name}" to the packing list.`);
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
      },
      include: itemInclude
    });
    res.json(item);
  } catch (err) { next(err); }
});

// POST /api/trips/:tripId/items/:itemId/associations
router.post('/items/:itemId/associations', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const { entryId, dayId } = req.body || {};
    if ((!entryId && !dayId) || (entryId && dayId)) {
      return res.status(400).json({ error: 'Provide either entryId or dayId' });
    }

    const item = await prisma.tripItem.findFirst({
      where: {
        id: req.params.itemId,
        category: { tripId: req.params.tripId }
      }
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (entryId) {
      const entry = await prisma.dayEntry.findFirst({
        where: { id: entryId, day: { tripId: req.params.tripId } }
      });
      if (!entry) return res.status(404).json({ error: 'Entry not found' });
    }

    if (dayId) {
      const day = await prisma.tripDay.findFirst({
        where: { id: dayId, tripId: req.params.tripId }
      });
      if (!day) return res.status(404).json({ error: 'Day not found' });
    }

    const association = await prisma.itemAssociation.create({
      data: {
        itemId: req.params.itemId,
        entryId: entryId || null,
        dayId: dayId || null
      },
      include: associationResponseInclude
    });

    res.status(201).json(association);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Association already exists' });
    }
    next(err);
  }
});

// DELETE /api/trips/:tripId/items/:itemId/associations/:assocId
router.delete('/items/:itemId/associations/:assocId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const association = await prisma.itemAssociation.findFirst({
      where: {
        id: req.params.assocId,
        itemId: req.params.itemId,
        item: {
          category: { tripId: req.params.tripId }
        }
      }
    });
    if (!association) return res.status(404).json({ error: 'Association not found' });

    await prisma.itemAssociation.delete({ where: { id: req.params.assocId } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// DELETE /api/trips/:tripId/items/:itemId
router.delete('/items/:itemId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    await prisma.tripItem.delete({ where: { id: req.params.itemId } });
    sendPushToTripMembers(req.params.tripId, req.user.id, 'Packing list updated', `${req.user.name} removed an item from the packing list.`);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
