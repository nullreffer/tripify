const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();
const router = express.Router({ mergeParams: true });

// Build trip context string for AI
function buildTripContext(trip, stops, categories, days, reservations) {
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : null;
  const fmtTime = (t) => {
    if (!t) return null;
    const [h, m] = t.split(':');
    const hour = Number(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  const lines = [
    `Trip: "${trip.title}"`,
    trip.description ? `Description: ${trip.description}` : null,
    trip.startDate ? `Start date: ${fmt(trip.startDate)}` : null,
    trip.endDate ? `End date: ${fmt(trip.endDate)}` : null,
    '',
    `Stops (${stops.length} total):`,
    ...stops.map((s, i) => {
      const parts = [
        `${i + 1}. ${s.name} [${s.pinType}]${s.reached ? ' ✓ Reached' : ''}`,
        s.address ? `   Address: ${s.address}` : null,
        s.targetDate ? `   Target: ${new Date(s.targetDate).toLocaleString()}` : null,
        s.notes ? `   Notes: ${s.notes}` : null,
      ].filter(Boolean);
      return parts.join('\n');
    }),
  ];

  if (days.length > 0) {
    lines.push('', `Daily Itinerary (${days.length} days):`);
    for (const day of days) {
      lines.push(`\n${fmt(day.date) || 'Day (no date)'} — ${day.location || 'Location TBD'}`);
      if (day.shower === 'YES') lines.push('  🚿 Shower available');
      if (day.shower === 'NO') lines.push('  🚿 No shower');
      for (const e of (day.entries || [])) {
        const time = e.startTime ? fmtTime(e.startTime) : '';
        const dur = e.durationMins ? ` (${Math.floor(e.durationMins/60)}h ${e.durationMins%60}m)` : '';
        if (e.type === 'TRAVEL') {
          lines.push(`  🚗 ${time} Travel: ${e.fromLocation || ''} → ${e.toLocation || ''}${dur}`);
        } else if (e.type === 'ACCOMMODATION') {
          const res = e.reservation;
          lines.push(`  🏕 ${time} Stay: ${e.title}`);
          if (res) {
            if (res.siteNumber) lines.push(`     Site: ${res.siteNumber}${res.loop ? ` Loop ${res.loop}` : ''}`);
            if (res.confirmationNumber) lines.push(`     Confirmation: ${res.confirmationNumber}`);
          }
        } else {
          lines.push(`  ${e.type === 'ACTIVITY' ? '🥾' : '📝'} ${time} ${e.title}${dur}`);
        }
        if (e.description) lines.push(`     Notes: ${e.description}`);
      }
    }
  }

  if (reservations.length > 0) {
    lines.push('', `Reservations (${reservations.length}):`);
    for (const r of reservations) {
      lines.push(`  - ${r.name}`);
      if (r.provider) lines.push(`    Provider: ${r.provider}`);
      if (r.checkIn) lines.push(`    Check-in: ${fmt(r.checkIn)}`);
      if (r.checkOut) lines.push(`    Check-out: ${fmt(r.checkOut)}`);
      if (r.confirmationNumber) lines.push(`    Confirmation: ${r.confirmationNumber}`);
      if (r.siteNumber) lines.push(`    Site: ${r.siteNumber}${r.loop ? ` Loop ${r.loop}` : ''}`);
    }
  }

  if (categories.length > 0) {
    lines.push('', `Packing/Items:`);
    for (const cat of categories) {
      lines.push(`  ${cat.name}:`);
      for (const item of cat.items) {
        const packed = item.status === 'packed' || item.done;
        const qty = item.quantity ? ` (${item.quantity}${item.unit ? ` ${item.unit}` : ''})` : '';
        lines.push(`    ${packed ? '✓' : '○'} ${item.name}${qty} [${item.status || 'have'}]`);
      }
    }
  }

  return lines.filter(l => l !== null).join('\n');
}

// POST /api/trips/:tripId/ai
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

    const trip = await prisma.trip.findFirst({
      where: {
        id: req.params.tripId,
        OR: [
          { userId: req.user.id },
          { members: { some: { userId: req.user.id } } }
        ]
      }
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    // Fetch context
    const [stops, categories, days, reservations] = await Promise.all([
      prisma.stop.findMany({ where: { tripId: req.params.tripId }, orderBy: { order: 'asc' } }),
      prisma.itemCategory.findMany({
        where: { tripId: req.params.tripId },
        orderBy: { order: 'asc' },
        include: { items: { orderBy: { order: 'asc' } } }
      }),
      prisma.tripDay.findMany({
        where: { tripId: req.params.tripId },
        orderBy: { order: 'asc' },
        include: { entries: { orderBy: { order: 'asc' }, include: { reservation: true } } }
      }),
      prisma.reservation.findMany({ where: { tripId: req.params.tripId }, orderBy: { checkIn: 'asc' } })
    ]);

    // Save user message
    await prisma.aiMessage.create({
      data: { tripId: req.params.tripId, userId: req.user.id, role: 'user', content: message.trim() }
    });

    // If Gemini API key is configured, call it; otherwise return a placeholder
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    let reply;

    if (GEMINI_KEY) {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(GEMINI_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const tripContext = buildTripContext(trip, stops, categories, days, reservations);
      const systemPrompt = `You are a helpful trip assistant for the travel app Azitrip. 
You have access to the following trip information:

${tripContext}

Answer questions about this trip only. Be concise and helpful. 
If information is missing from the trip data, say so rather than guessing.
Do not make up stops, dates, or reservations that aren't in the data.`;

      const result = await model.generateContent([systemPrompt, message.trim()]);
      reply = result.response.text();
    } else {
      // Placeholder response
      const nextStop = stops.find(s => !s.reached);
      const reached = stops.filter(s => s.reached).length;
      reply = `[AI assistant not yet configured — add your GEMINI_API_KEY to activate.]\n\n` +
        `Based on your trip data: You have ${stops.length} stops, ${reached} reached. ` +
        (nextStop ? `Your next stop is "${nextStop.name}".` : 'All stops are completed!');
    }

    // Save assistant reply
    const saved = await prisma.aiMessage.create({
      data: { tripId: req.params.tripId, userId: req.user.id, role: 'assistant', content: reply }
    });

    res.json({ message: saved });
  } catch (err) { next(err); }
});

// GET /api/trips/:tripId/ai/history
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const trip = await prisma.trip.findFirst({
      where: {
        id: req.params.tripId,
        OR: [
          { userId: req.user.id },
          { members: { some: { userId: req.user.id } } }
        ]
      }
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const messages = await prisma.aiMessage.findMany({
      where: { tripId: req.params.tripId },
      orderBy: { createdAt: 'asc' },
      take: 50
    });
    res.json(messages);
  } catch (err) { next(err); }
});

module.exports = router;
