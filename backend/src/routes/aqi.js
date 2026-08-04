const express = require('express');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../middleware/requireAuth');
const { recordOutgoing } = require('../middleware/metrics');

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
router.get('/tile/:z/:x/:y', aqiTileLimit, requireAuth, async (req, res) => {
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
    const t0 = Date.now();
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) {
      recordOutgoing('aqicn', false, Date.now() - t0);
      return res.status(upstream.status).end();
    }
    recordOutgoing('aqicn', true, Date.now() - t0);
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
router.get('/point', aqiPointLimit, requireAuth, async (req, res) => {
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
    const t0 = Date.now();
    const upstream = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!upstream.ok) {
      recordOutgoing('openMeteo', false, Date.now() - t0);
      return res.status(upstream.status).json({ error: 'Air quality API error' });
    }
    recordOutgoing('openMeteo', true, Date.now() - t0);
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
router.get('/status', aqiPointLimit, requireAuth, (_req, res) => {
  res.json({ tilesAvailable: !!process.env.AQICN_TOKEN });
});

// ── Active fire data cache ────────────────────────────────────────────────────
// NASA FIRMS data is updated every ~10 minutes but we cache for 30 min to be
// kind to the upstream service and keep latency low.
const FIRE_CACHE_TTL_MS = 30 * 60 * 1000;
let fireCache = null;
let fireCacheTs = 0;

// GET /api/aqi/fires
// Returns active fire detections from NASA FIRMS (MODIS + VIIRS) for the last 24 hours.
// No API key required for the standard CSV feed.
// Response: Array of { lat, lng, brightness, confidence, satellite, acq_date, acq_time, frp }
router.get('/fires', aqiPointLimit, requireAuth, async (_req, res) => {
  const now = Date.now();
  if (fireCache && now - fireCacheTs < FIRE_CACHE_TTL_MS) {
    return res.json(fireCache);
  }

  try {
    // FIRMS public CSV feed — last 24 h global MODIS active fires, no key needed.
    // VIIRS I-Band (375 m resolution) is used when available; MODIS (1 km) is the fallback.
    const t0 = Date.now();
    const [modisRes, viirsRes] = await Promise.allSettled([
      fetch(
        'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv',
        { signal: AbortSignal.timeout(15000) }
      ),
      fetch(
        'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv',
        { signal: AbortSignal.timeout(15000) }
      ),
    ]);
    recordOutgoing('nasaFirms', modisRes.status === 'fulfilled' && modisRes.value?.ok, Date.now() - t0);

    const fires = [];

    // Parse a FIRMS CSV body into fire objects.
    // MODIS columns: latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,
    //                instrument,confidence,version,bright_t31,frp,daynight,type
    // VIIRS columns: latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,
    //                instrument,confidence,version,bright_ti5,frp,daynight,type
    function parseFirmsCsv(text, isViirs) {
      const lines = text.trim().split('\n');
      if (lines.length < 2) return [];
      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const idxLat = header.indexOf('latitude');
      const idxLng = header.indexOf('longitude');
      const idxBright = isViirs ? header.indexOf('bright_ti4') : header.indexOf('brightness');
      const idxConf = header.indexOf('confidence');
      const idxDate = header.indexOf('acq_date');
      const idxTime = header.indexOf('acq_time');
      const idxFrp = header.indexOf('frp');
      const idxSat = header.indexOf('satellite');
      const results = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < 4) continue;
        const lat = parseFloat(cols[idxLat]);
        const lng = parseFloat(cols[idxLng]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        results.push({
          lat,
          lng,
          brightness: idxBright >= 0 ? parseFloat(cols[idxBright]) || null : null,
          confidence: idxConf >= 0 ? (cols[idxConf]?.trim() || null) : null,
          acq_date: idxDate >= 0 ? cols[idxDate]?.trim() || null : null,
          acq_time: idxTime >= 0 ? cols[idxTime]?.trim() || null : null,
          frp: idxFrp >= 0 ? parseFloat(cols[idxFrp]) || null : null,
          satellite: idxSat >= 0 ? cols[idxSat]?.trim() || null : null,
        });
      }
      return results;
    }

    if (modisRes.status === 'fulfilled' && modisRes.value.ok) {
      const text = await modisRes.value.text();
      fires.push(...parseFirmsCsv(text, false));
    }
    if (viirsRes.status === 'fulfilled' && viirsRes.value.ok) {
      const text = await viirsRes.value.text();
      fires.push(...parseFirmsCsv(text, true));
    }

    // Deduplicate detections at the same ~0.1° grid cell (MODIS + VIIRS often overlap)
    const seen = new Set();
    const deduped = fires.filter(f => {
      const cell = `${Math.round(f.lat * 10)},${Math.round(f.lng * 10)}`;
      if (seen.has(cell)) return false;
      seen.add(cell);
      return true;
    });

    fireCache = deduped;
    fireCacheTs = Date.now();
    res.set('Cache-Control', 'public, max-age=1800');
    res.json(deduped);
  } catch (err) {
    console.error('Active fire fetch error:', err.message);
    // Return stale cache if available rather than an error
    if (fireCache) return res.json(fireCache);
    res.status(502).json({ error: 'Active fire data unavailable' });
  }
});

module.exports = router;
