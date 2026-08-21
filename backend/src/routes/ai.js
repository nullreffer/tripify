const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');
const { GEMINI_MODEL } = require('../config/gemini');
const { sendPushToTripMembers } = require('./notifications');

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
        `${i + 1}. ${s.name} [${s.pinType}]${s.reached ? ' ✓ Arrived' : ''}`,
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
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

      const tripContext = buildTripContext(trip, stops, categories, days, reservations);
      const systemPrompt = `You are a helpful trip assistant for the travel app Azitrip. 
You have access to the following trip information:

${tripContext}

Use trip data when answering trip-specific questions.
You may also answer broader travel questions (e.g., suggestions near a route) using general knowledge, but clearly label those as general suggestions not sourced from this itinerary.
If specific itinerary information is missing, say so rather than inventing trip facts.
Do not make up stops, dates, or reservations that aren't in the trip data.

IMPORTANT: When you mention specific places, landmarks, attractions, restaurants, parks, museums, or other named locations that a user could visit or navigate to, wrap them in double square brackets, like [[Golden Gate Bridge]] or [[Yellowstone National Park]]. This allows the app to turn those names into interactive map links. Only do this for concrete, navigable places — not for generic concepts, cities used as general references, or vague suggestions.`;

      const result = await model.generateContent([systemPrompt, message.trim()]);
      reply = result.response.text();
    } else {
      // Placeholder response
      const nextStop = stops.find(s => !s.reached);
      const reached = stops.filter(s => s.reached).length;
      reply = `[AI assistant not yet configured — add your GEMINI_API_KEY to activate.]\n\n` +
        `Based on your trip data: You have ${stops.length} stops, ${reached} arrived. ` +
        (nextStop ? `Your next stop is "${nextStop.name}".` : 'All stops are completed!');
    }

    // Save assistant reply
    const saved = await prisma.aiMessage.create({
      data: { tripId: req.params.tripId, userId: req.user.id, role: 'assistant', content: reply }
    });

    // Notify other members that someone consulted the AI
    sendPushToTripMembers(req.params.tripId, req.user.id, 'AI consulted', `${req.user.name} asked the trip AI a question.`);

    res.json({ reply, message: saved });
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

// POST /api/trips/:tripId/ai/navigation-command
// Accepts a voice transcript and navigation context, returns an AI-classified response.
router.post('/navigation-command', requireAuth, async (req, res, next) => {
  try {
    const { transcript, currentStop, nextStop, remainingRoute, userLocation } = req.body;
    if (!transcript?.trim()) return res.status(400).json({ error: 'transcript is required' });

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

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      return res.json({
        type: 'answer',
        text: 'AI assistant is not configured. Please set GEMINI_API_KEY.',
        action: null,
      });
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const ctx = [
      `Trip: "${trip.title}"`,
      currentStop ? `Current stop: ${currentStop.name} (${currentStop.lat}, ${currentStop.lng})` : null,
      nextStop ? `Next stop: ${nextStop.name} (${nextStop.lat}, ${nextStop.lng})` : null,
      userLocation ? `User location: lat ${userLocation.lat}, lng ${userLocation.lng}` : null,
      remainingRoute?.distanceMeters != null
        ? `Remaining distance to next stop: ${Math.round(remainingRoute.distanceMeters / 1609)} miles`
        : null,
    ].filter(Boolean).join('\n');

    const prompt = `You are a helpful in-car navigation assistant for the travel app Azitrip.

Navigation context:
${ctx}

User voice command: "${transcript.trim()}"

Classify this command and respond in JSON with this exact shape:
{
  "type": "add_stop" | "eta_query" | "answer",
  "text": "<spoken response to read back, max 2 sentences>",
  "action": null | {
    "type": "add_stop",
    "searchQuery": "<search query to find the place>",
    "insertAs": "next"
  }
}

Rules:
- If the user wants to add a place en-route (Costco, rest stop, gas station, etc.) → type="add_stop", include action with searchQuery
- If the user asks about distance/time to something → type="eta_query", text answers based on context, action=null
- Otherwise → type="answer", text is the answer, action=null
- Keep the spoken response natural and concise for a driver`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.json({ type: 'answer', text, action: null });
    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (err) { next(err); }
});

module.exports = router;
