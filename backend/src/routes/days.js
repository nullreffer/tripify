const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();
const router = express.Router({ mergeParams: true });

const stopSelect = { id: true, name: true, lat: true, lng: true, pinType: true };
const itemAssociationInclude = {
  orderBy: { createdAt: 'asc' },
  include: {
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
    }
  }
};
const entryInclude = {
  reservation: true,
  stop: { select: stopSelect },
  itemAssociations: itemAssociationInclude
};
const dayInclude = {
  entries: {
    orderBy: { order: 'asc' },
    include: entryInclude
  },
  itemAssociations: itemAssociationInclude
};

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

async function getTripDays(tripId) {
  return prisma.tripDay.findMany({
    where: { tripId },
    orderBy: { order: 'asc' },
    include: dayInclude
  });
}

function parseTimeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return (hours * 60) + minutes;
}

function shiftTimeString(value, delayMinutes) {
  const mins = parseTimeToMinutes(value);
  if (mins == null) return value;
  const shifted = ((mins + delayMinutes) % 1440 + 1440) % 1440;
  const hours = String(Math.floor(shifted / 60)).padStart(2, '0');
  const minutes = String(shifted % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function isSameCalendarDay(dateA, dateB) {
  return dateA.getFullYear() === dateB.getFullYear()
    && dateA.getMonth() === dateB.getMonth()
    && dateA.getDate() === dateB.getDate();
}

function isEntryUpcoming(entry, nowMinutes) {
  const end = parseTimeToMinutes(entry.endTime);
  if (end != null) return end >= nowMinutes;
  const start = parseTimeToMinutes(entry.startTime);
  if (start != null) return start >= nowMinutes;
  return true;
}

function getReservationConflicts(days) {
  const conflicts = [];

  for (const day of days) {
    const dayDate = day.date ? new Date(day.date) : null;
    for (const entry of day.entries || []) {
      const checkIn = entry.reservation?.checkIn ? new Date(entry.reservation.checkIn) : null;
      if (!checkIn || !dayDate || !isSameCalendarDay(dayDate, checkIn)) continue;

      const arrivalMinutes = parseTimeToMinutes(entry.endTime) ?? parseTimeToMinutes(entry.startTime);
      const checkInMinutes = (checkIn.getHours() * 60) + checkIn.getMinutes();
      if (arrivalMinutes != null && arrivalMinutes > checkInMinutes) {
        conflicts.push({
          dayId: day.id,
          entryId: entry.id,
          reservationId: entry.reservation.id,
          reservationName: entry.reservation.name,
          scheduledArrival: entry.endTime || entry.startTime,
          checkInTime: `${String(checkIn.getHours()).padStart(2, '0')}:${String(checkIn.getMinutes()).padStart(2, '0')}`
        });
      }
    }
  }

  return conflicts;
}

// GET /api/trips/:tripId/days
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const days = await getTripDays(req.params.tripId);
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
      include: dayInclude
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
      include: dayInclude
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
      include: entryInclude
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
      include: entryInclude
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

// POST /api/trips/:tripId/days/reschedule
router.post('/reschedule', requireAuth, async (req, res, next) => {
  try {
    const trip = await requireTripAccess(req.params.tripId, req.user.id, true);
    if (!trip) return res.status(403).json({ error: 'Not found or insufficient permissions' });

    const delayMinutes = Number(req.body.delayMinutes);
    if (!Number.isFinite(delayMinutes) || delayMinutes === 0) {
      return res.status(400).json({ error: 'delayMinutes must be a non-zero number' });
    }

    const allDays = await prisma.tripDay.findMany({
      where: { tripId: req.params.tripId },
      orderBy: { order: 'asc' },
      include: {
        entries: {
          orderBy: { order: 'asc' },
          include: { reservation: true }
        }
      }
    });

    if (allDays.length === 0) {
      return res.status(400).json({ error: 'No itinerary days found' });
    }

    let startIndex = -1;
    let startDayId = req.body.fromDayId || null;
    const now = new Date();
    const nowMinutes = (now.getHours() * 60) + now.getMinutes();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    if (startDayId) {
      startIndex = allDays.findIndex(day => day.id === startDayId);
      if (startIndex === -1) return res.status(404).json({ error: 'Start day not found' });
    } else {
      startIndex = allDays.findIndex(day => {
        if (!day.date) return false;
        const dayDate = new Date(day.date);
        dayDate.setHours(0, 0, 0, 0);
        return dayDate >= startOfToday;
      });

      if (startIndex === -1) {
        startIndex = allDays.findIndex(day => !day.date);
      }

      if (startIndex === -1) {
        return res.status(400).json({ error: 'No current or future days to reschedule' });
      }

      startDayId = allDays[startIndex].id;
    }

    const updates = [];
    const changedEntryIds = new Set();
    const changedDayIds = new Set();

    for (let i = startIndex; i < allDays.length; i += 1) {
      const day = allDays[i];
      const isTodayDay = !req.body.fromDayId && day.date && isSameCalendarDay(new Date(day.date), now);

      for (const entry of day.entries || []) {
        if (!entry.startTime && !entry.endTime) continue;
        if (isTodayDay && !isEntryUpcoming(entry, nowMinutes)) continue;

        updates.push(prisma.dayEntry.update({
          where: { id: entry.id },
          data: {
            startTime: entry.startTime ? shiftTimeString(entry.startTime, delayMinutes) : null,
            endTime: entry.endTime ? shiftTimeString(entry.endTime, delayMinutes) : null
          }
        }));
        changedEntryIds.add(entry.id);
        changedDayIds.add(day.id);
      }
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    const days = await getTripDays(req.params.tripId);
    const reservationConflicts = getReservationConflicts(days.filter(day => changedDayIds.has(day.id)));

    res.json({
      days,
      summary: {
        delayMinutes,
        startDayId,
        affectedDays: changedDayIds.size,
        affectedEntries: changedEntryIds.size
      },
      reservationConflicts
    });
  } catch (err) { next(err); }
});

module.exports = router;
