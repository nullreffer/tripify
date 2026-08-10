const express = require('express');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../middleware/requireAuth');
const { recordOutgoing } = require('../middleware/metrics');

const router = express.Router();

const weatherLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many requests. Please slow down.' },
});

// Simple TTL cache keyed by "lat,lng" (rounded to 2 decimals).
// Weather data changes slowly; 10-minute cache is plenty.
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const weatherCache = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of weatherCache) {
    if (now > entry.expiresAt) weatherCache.delete(key);
  }
}, 15 * 60 * 1000);

function cacheKey(lat, lng) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

// GET /api/weather/forecast?lat=&lng=
// Proxies Open-Meteo (no key required) so the upstream URL never changes for
// the browser, and responses are cached server-side to reduce outbound calls.
// Accepts an optional OPEN_METEO_URL env var to use a self-hosted instance.
router.get('/forecast', weatherLimit, requireAuth, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  const key = cacheKey(lat, lng);
  const cached = weatherCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return res.json(cached.data);
  }

  const baseUrl = (process.env.OPEN_METEO_URL || 'https://api.open-meteo.com').replace(/\/$/, '');
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
  });

  try {
    const t0 = Date.now();
    const upstream = await fetch(`${baseUrl}/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      recordOutgoing('openMeteo', false, Date.now() - t0);
      return res.status(upstream.status).json({ error: 'Weather service error' });
    }
    recordOutgoing('openMeteo', true, Date.now() - t0);
    const data = await upstream.json();
    weatherCache.set(key, { data, expiresAt: Date.now() + WEATHER_CACHE_TTL_MS });
    res.set('Cache-Control', 'public, max-age=600');
    res.json(data);
  } catch (err) {
    console.error('Weather proxy error:', err.message);
    res.status(502).json({ error: 'Weather unavailable' });
  }
});

module.exports = router;
