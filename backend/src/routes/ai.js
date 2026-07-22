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
//
// Accepts an optional `mode` field in the request body:
//   - omitted / "web" : standard text reply (existing behaviour)
//   - "auto"          : Android Auto mode — returns a short TTS-friendly reply AND an
//                       optional `actions` array so the car app can take direct actions
//                       (add a stop, mark reached, search nearby) without the driver typing.
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { message, mode } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message is required' });
    const isAutoMode = mode === 'auto';

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

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    let reply;
    let actions = [];

    if (GEMINI_KEY) {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(GEMINI_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const tripContext = buildTripContext(trip, stops, categories, days, reservations);

      if (isAutoMode) {
        // Android Auto mode: short spoken reply + optional structured actions.
        // The stop IDs below come from real trip data so the app can act on them.
        const stopList = stops.map(s => `  { "id": "${s.id}", "name": "${s.name}", "reached": ${s.reached} }`).join('\n');
        const autoSystemPrompt = `You are a driving assistant for the Azitrip trip app running in Android Auto.
The driver is using voice commands. Reply in 1-2 short sentences suitable for text-to-speech.

Trip context:
${tripContext}

Current stop IDs (for actions):
${stopList}

Return ONLY a valid JSON object — no markdown, no code fences — in this exact shape:
{
  "reply": "Short spoken response (1-2 sentences).",
  "actions": [
    // Include ONLY actions that directly match the user's request.
    // Omit the array or leave it empty if no action is needed.
    //
    // Add a new stop found via search (use real coordinates):
    // { "type": "add_stop", "name": "Place Name", "lat": 0.0, "lng": 0.0, "address": "123 Main St" }
    //
    // Mark an existing stop reached (use real stop ID from the list above):
    // { "type": "mark_reached", "stopId": "<id>" }
    //
    // Ask the app to search for nearby POIs (app will call the places API):
    // { "type": "search_nearby", "query": "gas station", "near": "next_stop" }
    //
    // Navigate system maps to a stop:
    // { "type": "navigate_to", "stopId": "<id>" }
  ]
}`;

        const result = await model.generateContent([autoSystemPrompt, message.trim()]);
        const rawText = result.response.text().trim();

        // Strip any accidental markdown code fences
        const jsonStr = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

        try {
          const parsed = JSON.parse(jsonStr);
          reply = parsed.reply || rawText;
          actions = Array.isArray(parsed.actions) ? parsed.actions : [];
        } catch {
          // Gemini didn't return valid JSON — treat the whole response as the reply
          reply = rawText;
          actions = [];
        }
      } else {
        // Standard web mode (unchanged behaviour)
        const systemPrompt = `You are a helpful trip assistant for the travel app Azitrip. 
You have access to the following trip information:

${tripContext}

Answer questions about this trip only. Be concise and helpful. 
If information is missing from the trip data, say so rather than guessing.
Do not make up stops, dates, or reservations that aren't in the data.`;

        const result = await model.generateContent([systemPrompt, message.trim()]);
        reply = result.response.text();
      }
    } else {
      // No API key — placeholder response for both modes
      const nextStop = stops.find(s => !s.reached);
      const reached = stops.filter(s => s.reached).length;
      const base = `You have ${stops.length} stops, ${reached} reached. ` +
        (nextStop ? `Next stop: "${nextStop.name}".` : 'All stops completed!');
      reply = isAutoMode
        ? base
        : `[AI assistant not yet configured — add your GEMINI_API_KEY to activate.]\n\n${base}`;
    }

    // Save assistant reply
    const saved = await prisma.aiMessage.create({
      data: { tripId: req.params.tripId, userId: req.user.id, role: 'assistant', content: reply }
    });

    res.json({ message: saved, reply, actions });
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
