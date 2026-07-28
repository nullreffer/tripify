const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { callLLM } = require('../services/llmClient');
const { geocode } = require('../services/geocode');

// JSON schema expected from LLM (documented in prompt)
function buildPrompt(description) {
  return `Extract structured trip details from the following free-text trip description. Output ONLY valid JSON that matches this schema exactly:\n\n{\n  "title": string or null,\n  "start_date": "YYYY-MM-DD" or null,\n  "end_date": "YYYY-MM-DD" or null,\n  "notes": string or null,\n  "packing_list": [string],\n  "stops": [\n    {\n      "name": string,\n      "address": string or null,\n      "arrival_date": "YYYY-MM-DD" or null,\n      "departure_date": "YYYY-MM-DD" or null,\n      "notes": string or null,\n      "items": [string]\n    }\n  ]\n}\n\nRules:\n- If a field cannot be inferred, set it to null or an empty list.\n- Dates must be ISO format YYYY-MM-DD where possible; if ambiguous set null.\n- Return strictly JSON and no other text.\n\nDescription:\n${description}\n`;
}

router.post('/auto-create', requireAuth, async (req, res, next) => {
  try {
    const { description } = req.body;
    if (!description || !description.trim()) return res.status(400).json({ error: 'description is required' });

    // Call LLM
    let parsed = null;
    try {
      const prompt = buildPrompt(description.trim());
      const content = await callLLM(prompt, { temperature: 0, maxTokens: 800 });
      if (!content) return res.status(502).json({ error: 'LLM did not return content (check GEMINI_API_KEY)' });
      parsed = JSON.parse(content);
    } catch (err) {
      console.error('LLM parse error', err.message);
      return res.status(422).json({ error: 'Failed to parse LLM response. Ensure GEMINI_API_KEY is set and LLM returns strict JSON.' });
    }

    // Geocode stops best-effort
    if (Array.isArray(parsed.stops)) {
      for (const stop of parsed.stops) {
        const q = stop.address || stop.name;
        if (q) {
          const g = await geocode(q);
          if (g) stop.geocode = g;
        }
      }
    } else {
      parsed.stops = [];
    }

    // Minimal approach: do not modify DB schema. Create a basic trip row and return the parsed draft.
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const tripTitle = parsed.title && parsed.title.trim() ? parsed.title.trim() : (description.split('\n')[0] || 'Untitled Trip');
    const trip = await prisma.trip.create({
      data: {
        title: tripTitle,
        description,
        userId: req.user.id
      }
    });

    // Do not create stops yet; leave parsed stops in the draft returned to frontend for verification.

    res.status(201).json({ trip, draft: parsed, needsVerification: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
