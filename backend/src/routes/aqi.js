const express = require('express');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const aqiTileLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many requests. Please slow down.' },
});

const aqiPointLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many requests. Please slow down.' },
});

// GET /api/aqi/tile/:z/:x/:y
// Proxy for WAQI (World Air Quality Index) map tiles so the API token stays server-side.
// If AQICN_TOKEN is not configured the endpoint returns 204 so the frontend
// can gracefully disable the layer.
router.get('/tile/:z/:x/:y', requireAuth, aqiTileLimit, async (req, res) => {
  const token = process.env.AQICN_TOKEN;
  if (!token) {
    return res.status(204).end();
  }

  const { z, x, y } = req.params;
  const zn = parseInt(z, 10);
  const xn = parseInt(x, 10);
  const yn = parseInt(y, 10);
  if (!Number.isFinite(zn) || !Number.isFinite(xn) || !Number.isFinite(yn)) {
    return res.status(400).end();
  }

  try {
    const url = `https://tiles.aqicn.org/tiles/usepa-aqi/${zn}/${xn}/${yn}.png?token=${token}`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) {
      return res.status(upstream.status).end();
    }
    const buffer = await upstream.arrayBuffer();
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('AQI tile proxy error:', err.message);
    res.status(502).end();
  }
});

// GET /api/aqi/point?lat=&lng=
// Returns US EPA AQI for a single location using Open-Meteo Air Quality API (no key required).
// Used as a fallback when no AQICN_TOKEN is configured.
router.get('/point', requireAuth, aqiPointLimit, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      current: 'us_aqi,pm2_5,pm10',
      timezone: 'auto',
    });
    const upstream = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Air quality API error' });
    }
    const data = await upstream.json();
    const aqi = data?.current?.us_aqi;
    res.json({
      aqi: Number.isFinite(aqi) ? Math.round(aqi) : null,
      pm2_5: data?.current?.pm2_5 ?? null,
      pm10: data?.current?.pm10 ?? null,
    });
  } catch (err) {
    console.error('AQI point error:', err.message);
    res.status(502).json({ error: 'Air quality unavailable' });
  }
});

// GET /api/aqi/status — lets the frontend know whether tiles are available
router.get('/status', requireAuth, aqiPointLimit, (_req, res) => {
  res.json({ tilesAvailable: !!process.env.AQICN_TOKEN });
});

module.exports = router;
