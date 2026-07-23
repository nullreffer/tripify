const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');
const { GEMINI_MODEL } = require('../config/gemini');

const prisma = new PrismaClient();
const router = express.Router({ mergeParams: true });

// multer: in-memory storage, max 5 MB, accept spreadsheet types only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /\.(xlsx|xls|csv|ods|tsv)$/i.test(file.originalname) ||
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('csv') ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'text/csv';
    cb(null, ok);
  },
});

function parseSheetToText(buffer, mimetype, filename) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const lines = [];
  wb.SheetNames.forEach(name => {
    const ws = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    if (csv.trim()) {
      lines.push(`--- Sheet: ${name} ---`);
      lines.push(csv.trim());
    }
  });
  return lines.join('\n');
}

function stripJsonFences(raw) {
  return raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
}

async function callGemini(prompt) {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(GEMINI_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function geocodeStop(name, address) {
  const query = [name, address].filter(Boolean).join(', ').trim();
  if (!query) return null;

  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  if (googleKey) {
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleKey,
          'X-Goog-FieldMask': 'places.location,places.formattedAddress,places.displayName'
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const data = await response.json();
        const place = data.places?.[0];
        const lat = place?.location?.latitude;
        const lng = place?.location?.longitude;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return {
            lat,
            lng,
            address: place.formattedAddress || address || null,
          };
        }
      } else {
        const body = await response.text().catch(() => '');
        console.error('Import geocode Google Places error:', response.status, query, body);
      }
    } catch (err) {
      console.error('Import geocode Google Places exception:', query, err.message);
    }
  }

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '1',
      addressdetails: '1',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'Tripify/1.0 import geocoder' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const results = await res.json();
    const top = results?.[0];
    if (!top) return null;
    const lat = parseFloat(top.lat);
    const lng = parseFloat(top.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, address: top.display_name || address || null };
  } catch (err) {
    console.error('Import geocode Nominatim exception:', query, err.message);
    return null;
  }
}

function itemImportPrompt(sheetText) {
  return `You are a travel packing list importer. The user uploaded a spreadsheet with their packing list.

Here is the raw CSV data:
${sheetText}

Extract packing categories and items. Return ONLY valid JSON (no markdown, no explanation) matching this exact schema:
[
  {
    "name": "category name",
    "color": "#hex or null",
    "items": [
      {
        "name": "item name",
        "quantity": number or null,
        "unit": "string or null",
        "notes": "string or null",
        "required": boolean
      }
    ]
  }
]

Rules:
- Consider all sheets/tabs in the workbook, including list/packing tabs not on the first page
- Group items into logical categories (Clothing, Toiletries, Electronics, Food, Documents, Camping Gear, etc.)
- If spreadsheet already has categories/groups, use those
- quantity should be a number if quantity info is present (e.g. "3 shirts" → quantity: 3, unit: null)
- required = true if item seems essential/critical
- Color the categories with distinct hex colors from: #ef4444 #f97316 #eab308 #22c55e #3b82f6 #8b5cf6 #ec4899 #14b8a6
- Do not include duplicate items`;
}

async function createImportedItems(tripId, parsedCategories) {
  if (!Array.isArray(parsedCategories) || parsedCategories.length === 0) return [];

  const existing = await prisma.itemCategory.findMany({ where: { tripId }, select: { order: true } });
  let catOrder = existing.length > 0 ? Math.max(...existing.map(c => c.order)) + 1 : 0;

  const created = [];
  for (const cat of parsedCategories) {
    if (!cat.name?.trim()) continue;
    const categoryColor = typeof cat.color === 'string' && cat.color.trim() ? cat.color.trim() : null;
    const newCat = await prisma.itemCategory.create({
      data: {
        tripId,
        name: cat.name.trim(),
        order: catOrder++,
      }
    });
    const items = [];
    for (let i = 0; i < (cat.items || []).length; i++) {
      const item = cat.items[i];
      if (!item.name?.trim()) continue;
      const newItem = await prisma.tripItem.create({
        data: {
          categoryId: newCat.id,
          name: item.name.trim(),
          color: categoryColor,
          quantity: item.quantity ?? null,
          unit: item.unit || null,
          notes: item.notes || null,
          required: item.required ?? false,
          status: 'have',
          order: i,
        }
      });
      items.push(newItem);
    }
    created.push({ ...newCat, items });
  }
  return created;
}

// ── POST /api/import/trip  (no :tripId param — creates a new trip) ────────────
router.post('/trip', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const sheetText = parseSheetToText(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!sheetText.trim()) return res.status(400).json({ error: 'Spreadsheet appears empty' });

    const prompt = `You are a travel app data importer. The user uploaded a spreadsheet to create a road trip.

Here is the raw CSV data from the spreadsheet:
${sheetText}

Extract trip information and return ONLY valid JSON (no markdown, no explanation) matching this schema exactly:
{
  "title": "string — trip name",
  "description": "string or null",
  "startDate": "ISO date string or null",
  "endDate": "ISO date string or null",
  "stops": [
    {
      "name": "string — place name",
      "address": "string or null",
      "lat": number or null,
      "lng": number or null,
      "pinType": "GENERAL|STAY|HOTEL|CAMPGROUND|HIKING_TRAIL|RESTAURANT|ATTRACTION|GAS_STATION|AIRPORT|PARKING|OTHER",
      "notes": "string or null",
      "targetDate": "ISO datetime string or null"
    }
  ]
}

Rules:
- stops must be in order of travel
- If lat/lng not present in data, set them to null (the app will geocode them)
- Choose pinType intelligently based on the stop description
- If no clear trip title, derive one from destination names
- Only include stops you are confident about; do not invent stops not in the data`;

    let raw = await callGemini(prompt);
    raw = stripJsonFences(raw);
    const parsed = JSON.parse(raw);

    if (!parsed.title) return res.status(400).json({ error: 'Gemini could not parse a trip title from the spreadsheet' });

    // Create trip
    const trip = await prisma.trip.create({
      data: {
        title: parsed.title,
        description: parsed.description || null,
        startDate: parsed.startDate ? new Date(parsed.startDate) : null,
        endDate: parsed.endDate ? new Date(parsed.endDate) : null,
        userId: req.user.id,
      }
    });

    // Create stops in order (skip those with no name)
    const stopsToCreate = (parsed.stops || []).filter(s => s.name?.trim());
    for (let i = 0; i < stopsToCreate.length; i++) {
      const s = stopsToCreate[i];
      const lat = Number.isFinite(Number(s.lat)) ? Number(s.lat) : null;
      const lng = Number.isFinite(Number(s.lng)) ? Number(s.lng) : null;
      const geocoded = (lat == null || lng == null) ? await geocodeStop(s.name?.trim(), s.address || null) : null;
      await prisma.stop.create({
        data: {
          tripId: trip.id,
          name: s.name.trim(),
          address: geocoded?.address || s.address || null,
          lat: geocoded?.lat ?? lat ?? 0,
          lng: geocoded?.lng ?? lng ?? 0,
          pinType: s.pinType || 'GENERAL',
          notes: s.notes || null,
          targetDate: s.targetDate ? new Date(s.targetDate) : null,
          order: i,
        }
      });
    }

    // Best-effort: also import packing lists if present in the same workbook.
    let listsCreated = 0;
    try {
      let itemsRaw = await callGemini(itemImportPrompt(sheetText));
      itemsRaw = stripJsonFences(itemsRaw);
      const parsedItems = JSON.parse(itemsRaw);
      const created = await createImportedItems(trip.id, parsedItems);
      listsCreated = created.length;
    } catch (err) {
      console.warn('Trip import list extraction skipped:', err.message);
    }

    res.json({ tripId: trip.id, title: trip.title, stopsCreated: stopsToCreate.length, listsCreated });
  } catch (err) {
    if (err.message?.includes('JSON')) {
      return res.status(422).json({ error: 'Gemini could not extract structured trip data from this spreadsheet. Try a simpler format.' });
    }
    next(err);
  }
});

// ── POST /api/trips/:tripId/import/items ─────────────────────────────────────
router.post('/items', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Verify trip access
    const trip = await prisma.trip.findFirst({
      where: {
        id: req.params.tripId,
        OR: [
          { userId: req.user.id },
          { members: { some: { userId: req.user.id, role: { not: 'VIEWER' } } } }
        ]
      }
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found or access denied' });

    const sheetText = parseSheetToText(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!sheetText.trim()) return res.status(400).json({ error: 'Spreadsheet appears empty' });

    let raw = await callGemini(itemImportPrompt(sheetText));
    raw = stripJsonFences(raw);
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return res.status(400).json({ error: 'Gemini could not parse any packing list items from the spreadsheet' });
    }

    const created = await createImportedItems(req.params.tripId, parsed);

    res.json({ categoriesCreated: created.length, categories: created });
  } catch (err) {
    if (err.message?.includes('JSON')) {
      return res.status(422).json({ error: 'Gemini could not extract items from this spreadsheet. Try a simpler format.' });
    }
    next(err);
  }
});

module.exports = router;
