const express = require('express');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../middleware/requireAuth');
const { recordOutgoing } = require('../middleware/metrics');

const router = express.Router();

const routingLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many requests. Please slow down.' },
});

// GET /api/routing/route?coords=lng,lat;lng,lat;...
// Proxies the OSRM routing API so the upstream base URL is controlled
// server-side via the OSRM_URL env var (defaults to the public OSRM demo server).
router.get('/route', routingLimit, requireAuth, async (req, res) => {
  const { coords } = req.query;
  if (!coords || typeof coords !== 'string') {
    return res.status(400).json({ error: 'coords is required' });
  }

  // Basic validation: each segment must match "number,number"
  const segments = coords.split(';');
  if (segments.length < 2) {
    return res.status(400).json({ error: 'At least two coordinates are required' });
  }
  for (const seg of segments) {
    const parts = seg.split(',');
    if (parts.length !== 2 || !Number.isFinite(parseFloat(parts[0])) || !Number.isFinite(parseFloat(parts[1]))) {
      return res.status(400).json({ error: 'Invalid coordinate format — expected lng,lat' });
    }
  }

  // Reconstruct the coordinate string from validated parts to prevent any
  // URL injection — each coordinate segment has been verified to be two finite numbers.
  const safeCoords = segments
    .map(seg => {
      const [lng, lat] = seg.split(',').map(Number);
      return `${lng},${lat}`;
    })
    .join(';');

  const baseUrl = (process.env.OSRM_URL || 'https://router.project-osrm.org/route/v1/driving').replace(/\/$/, '');
  const url = `${baseUrl}/${safeCoords}?overview=full&geometries=geojson&steps=false`;

  try {
    const t0 = Date.now();
    const upstream = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!upstream.ok) {
      recordOutgoing('osrm', false, Date.now() - t0);
      return res.status(upstream.status).json({ error: 'Routing service error' });
    }
    recordOutgoing('osrm', true, Date.now() - t0);
    const data = await upstream.json();
    res.set('Cache-Control', 'public, max-age=300');
    res.json(data);
  } catch (err) {
    console.error('Routing proxy error:', err.message);
    res.status(502).json({ error: 'Routing unavailable' });
  }
});

// GET /api/routing/navigate?coords=lng,lat;lng,lat;...
// Like /route but returns full step-by-step maneuver data (steps=true).
router.get('/navigate', routingLimit, requireAuth, async (req, res) => {
  const { coords } = req.query;
  if (!coords || typeof coords !== 'string') {
    return res.status(400).json({ error: 'coords is required' });
  }

  const segments = coords.split(';');
  if (segments.length < 2) {
    return res.status(400).json({ error: 'At least two coordinates are required' });
  }
  for (const seg of segments) {
    const parts = seg.split(',');
    if (parts.length !== 2 || !Number.isFinite(parseFloat(parts[0])) || !Number.isFinite(parseFloat(parts[1]))) {
      return res.status(400).json({ error: 'Invalid coordinate format — expected lng,lat' });
    }
  }

  const safeCoords = segments
    .map(seg => {
      const [lng, lat] = seg.split(',').map(Number);
      return `${lng},${lat}`;
    })
    .join(';');

  const baseUrl = (process.env.OSRM_URL || 'https://router.project-osrm.org/route/v1/driving').replace(/\/$/, '');
  const url = `${baseUrl}/${safeCoords}?overview=full&geometries=geojson&steps=true&annotations=false`;

  try {
    const t0 = Date.now();
    const upstream = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!upstream.ok) {
      recordOutgoing('osrm', false, Date.now() - t0);
      return res.status(upstream.status).json({ error: 'Routing service error' });
    }
    recordOutgoing('osrm', true, Date.now() - t0);
    const data = await upstream.json();
    res.set('Cache-Control', 'public, max-age=120');
    res.json(data);
  } catch (err) {
    console.error('Navigate proxy error:', err.message);
    res.status(502).json({ error: 'Routing unavailable' });
  }
});

module.exports = router;
