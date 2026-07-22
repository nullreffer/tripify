const express = require('express');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

// Simple in-process per-user rate limiter: max 30 requests per minute
const rateLimits = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 30;

function isRateLimited(userId) {
  const now = Date.now();
  let entry = rateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
  }
  entry.count += 1;
  rateLimits.set(userId, entry);
  return entry.count > RATE_MAX;
}

// Periodically clean up stale entries to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(key);
  }
}, RATE_WINDOW_MS);

// Map our category keys to Google Places types
const GOOGLE_PLACE_TYPES = {
  gas:        'gas_station',
  restaurant: 'restaurant',
  hotel:      'lodging',
  campground: 'campground',
  ev:         'electric_vehicle_charging_station',
  grocery:    'supermarket',
  parking:    'parking',
  attraction: 'tourist_attraction',
};

function normalizePlace(place, source = 'google') {
  const lat = place.geometry?.location?.lat;
  const lng = place.geometry?.location?.lng;
  if (lat == null || lng == null) return null;
  return {
    id: `google-${place.place_id}`,
    name: place.name,
    displayName: place.vicinity || place.formatted_address || place.name,
    lat,
    lng,
    type: place.types?.[0] || 'place',
    category: source,
    source,
    extratags: {
      opening_hours: place.opening_hours?.weekday_text?.join('; ') || null,
      open_now: place.opening_hours?.open_now ?? null,
      phone: place.formatted_phone_number || place.international_phone_number || null,
      website: place.website || null,
      rating: place.rating || null,
      user_ratings_total: place.user_ratings_total || null,
    },
  };
}

// GET /api/places/nearby?lat=&lng=&category=&radius=
router.get('/nearby', requireAuth, async (req, res) => {
  if (isRateLimited(req.user.id)) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return res.json([]);

  const { lat, lng, category, radius = 5000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });

  const type = GOOGLE_PLACE_TYPES[category];
  if (!type) return res.json([]);

  try {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: String(radius),
      type,
      key: apiKey,
    });
    const response = await fetch(`${PLACES_BASE}/nearbysearch/json?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return res.json([]);
    const data = await response.json();
    const results = (data.results || [])
      .map(p => normalizePlace(p))
      .filter(Boolean)
      .slice(0, 20);
    res.json(results);
  } catch {
    res.json([]);
  }
});

// GET /api/places/search?q=&north=&south=&east=&west=&lat=&lng=
router.get('/search', requireAuth, async (req, res) => {
  if (isRateLimited(req.user.id)) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return res.json([]);

  const { q, north, south, east, west, lat, lng } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'q is required' });

  try {
    const params = new URLSearchParams({ query: q, key: apiKey });

    // Use viewport center as location bias if bounds provided
    if (north && south && east && west) {
      const centerLat = (parseFloat(north) + parseFloat(south)) / 2;
      const centerLng = (parseFloat(east) + parseFloat(west)) / 2;
      params.set('location', `${centerLat},${centerLng}`);
      params.set('radius', '50000');
    } else if (lat && lng) {
      params.set('location', `${lat},${lng}`);
      params.set('radius', '50000');
    }

    const response = await fetch(`${PLACES_BASE}/textsearch/json?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return res.json([]);
    const data = await response.json();
    const results = (data.results || [])
      .map(p => normalizePlace(p))
      .filter(Boolean)
      .slice(0, 20);
    res.json(results);
  } catch {
    res.json([]);
  }
});

module.exports = router;
