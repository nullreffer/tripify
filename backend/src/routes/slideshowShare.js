const express = require('express');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const { GEMINI_MODEL } = require('../config/gemini');

const prisma = new PrismaClient();
const router = express.Router();

const publicSlideshowLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many requests. Please slow down.' },
});

// GET /api/slideshow-share/:token
// Public endpoint — no auth required. Returns slideshow slides for the given share token.
router.get('/:token', publicSlideshowLimit, async (req, res, next) => {
  try {
    const share = await prisma.slideshowShare.findUnique({
      where: { token: req.params.token },
      include: { trip: true }
    });
    if (!share) return res.status(404).json({ error: 'Slideshow not found or link has expired' });
    if (share.expiresAt && share.expiresAt < new Date()) {
      return res.status(410).json({ error: 'This slideshow link has expired' });
    }

    const stops = await prisma.stop.findMany({
      where: { tripId: share.tripId },
      orderBy: { order: 'asc' },
    });

    const photoStops = stops.filter(s => {
      const meta = s.metadata || {};
      return Array.isArray(meta.photos) ? meta.photos.length > 0 : !!meta.photo;
    });

    if (photoStops.length === 0) {
      return res.json({ slides: [], tripTitle: share.trip.title });
    }

    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    const slides = await Promise.all(photoStops.map(async (stop, idx) => {
      const meta = stop.metadata || {};
      const photos = Array.isArray(meta.photos) ? meta.photos : (meta.photo ? [meta.photo] : []);
      const primaryPhoto = photos[0];

      let caption = stop.notes || null;
      let narrative = null;

      if (GEMINI_KEY) {
        try {
          const { GoogleGenerativeAI } = require('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(GEMINI_KEY);
          const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

          const stopContext = [
            `Trip: "${share.trip.title}"`,
            `Stop ${idx + 1} of ${photoStops.length}: ${stop.name}`,
            stop.address ? `Location: ${stop.address}` : null,
            stop.targetDate ? `Date: ${new Date(stop.targetDate).toLocaleDateString()}` : null,
            stop.notes ? `Notes: ${stop.notes}` : null,
          ].filter(Boolean).join('\n');

          const prompt = `You are creating a travel photo caption for a slideshow. Based on the following stop information, write:\n1. A short, evocative one-sentence photo caption (max 100 chars)\n2. A 1-2 sentence narrative about this moment in the trip\n\nRespond in JSON: {"caption":"...","narrative":"..."}\n\n${stopContext}`;

          const result = await model.generateContent(prompt);
          const text = result.response.text().trim();
          const jsonMatch = text.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            caption = parsed.caption || caption;
            narrative = parsed.narrative || null;
          }
        } catch {
          // Fall back to notes or null
        }
      }

      return {
        stopId: stop.id,
        stopName: stop.name,
        address: stop.address,
        date: stop.targetDate || null,
        photos,
        primaryPhoto,
        caption: caption || stop.name,
        narrative,
        order: stop.order,
      };
    }));

    res.json({ slides, tripTitle: share.trip.title });
  } catch (err) { next(err); }
});

module.exports = router;
