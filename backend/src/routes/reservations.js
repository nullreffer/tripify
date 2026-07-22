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

// GET /api/trips/:tripId/reservations
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const reservations = await prisma.reservation.findMany({
      where: { tripId: req.params.tripId },
      orderBy: { checkIn: 'asc' },
      include: { entry: { select: { id: true, type: true, title: true, dayId: true } } }
    });
    res.json(reservations);
  } catch (err) { next(err); }
});

// POST /api/trips/:tripId/reservations
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const {
      name, provider, confirmationNumber, referenceNumber, url, phone,
      checkIn, checkOut, siteNumber, roomNumber, loop, holder, cost,
      cancellationDeadline, notes, isPrimary, entryId
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const reservation = await prisma.reservation.create({
      data: {
        tripId: req.params.tripId,
        entryId: entryId || null,
        name: name.trim(),
        provider: provider?.trim() || null,
        confirmationNumber: confirmationNumber?.trim() || null,
        referenceNumber: referenceNumber?.trim() || null,
        url: url?.trim() || null,
        phone: phone?.trim() || null,
        checkIn: checkIn ? new Date(checkIn) : null,
        checkOut: checkOut ? new Date(checkOut) : null,
        siteNumber: siteNumber?.trim() || null,
        roomNumber: roomNumber?.trim() || null,
        loop: loop?.trim() || null,
        holder: holder?.trim() || null,
        cost: cost?.trim() || null,
        cancellationDeadline: cancellationDeadline ? new Date(cancellationDeadline) : null,
        notes: notes?.trim() || null,
        isPrimary: isPrimary !== false
      },
      include: { entry: { select: { id: true, type: true, title: true, dayId: true } } }
    });
    res.status(201).json(reservation);
  } catch (err) { next(err); }
});

// PUT /api/trips/:tripId/reservations/:resId
router.put('/:resId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const fields = [
      'name', 'provider', 'confirmationNumber', 'referenceNumber', 'url', 'phone',
      'checkIn', 'checkOut', 'siteNumber', 'roomNumber', 'loop', 'holder', 'cost',
      'cancellationDeadline', 'notes', 'isPrimary', 'entryId'
    ];
    const dateFields = ['checkIn', 'checkOut', 'cancellationDeadline'];
    const data = {};
    for (const f of fields) {
      if (req.body[f] === undefined) continue;
      if (dateFields.includes(f)) {
        data[f] = req.body[f] ? new Date(req.body[f]) : null;
      } else if (f === 'isPrimary') {
        data[f] = req.body[f];
      } else {
        data[f] = typeof req.body[f] === 'string' ? (req.body[f].trim() || null) : req.body[f];
      }
    }

    const reservation = await prisma.reservation.update({
      where: { id: req.params.resId },
      data,
      include: { entry: { select: { id: true, type: true, title: true, dayId: true } } }
    });
    res.json(reservation);
  } catch (err) { next(err); }
});

// DELETE /api/trips/:tripId/reservations/:resId
router.delete('/:resId', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    await prisma.reservation.delete({ where: { id: req.params.resId } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
