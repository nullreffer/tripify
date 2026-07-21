const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();
const router = express.Router({ mergeParams: true });

// Build trip context string for AI
function buildTripContext(trip, stops, categories) {
  const lines = [
    `Trip: "${trip.title}"`,
    trip.description ? `Description: ${trip.description}` : null,
    trip.startDate ? `Start date: ${new Date(trip.startDate).toDateString()}` : null,
    trip.endDate ? `End date: ${new Date(trip.endDate).toDateString()}` : null,
    '',
    `Stops (${stops.length} total):`,
    ...stops.map((s, i) => {
      const parts = [
        `${i + 1}. ${s.name} [${s.pinType}]${s.reached ? ' ✓ Reached' : ''}`,
        s.address ? `   Address: ${s.address}` : null,
        s.targetDate ? `   Target: ${new Date(s.targetDate).toLocaleString()}` : null,
        s.notes ? `   Notes: ${s.notes}` : null,
        s.metadata && Object.keys(s.metadata).length > 0
          ? `   Details: ${JSON.stringify(s.metadata)}`
          : null
      ].filter(Boolean);
      return parts.join('\n');
    }),
    '',
    categories.length > 0 ? `Packing/Items:` : null,
    ...categories.map(cat => [
      `  ${cat.name}:`,
      ...cat.items.map(item => `    ${item.done ? '✓' : '○'} ${item.name}`)
    ].join('\n')),
  ].filter(line => line !== null);

  return lines.join('\n');
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
    const [stops, categories] = await Promise.all([
      prisma.stop.findMany({ where: { tripId: req.params.tripId }, orderBy: { order: 'asc' } }),
      prisma.itemCategory.findMany({
        where: { tripId: req.params.tripId },
        orderBy: { order: 'asc' },
        include: { items: { orderBy: { order: 'asc' } } }
      })
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
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const tripContext = buildTripContext(trip, stops, categories);
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
