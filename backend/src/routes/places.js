/**
 * GET /api/places/nearby
 *
 * Proxies a nearby-POI search to Nominatim (OpenStreetMap) — no API key required.
 *
 * Query params:
 *   q       {string}  Search term, e.g. "Costco" or "gas station"
 *   lat     {number}  Centre latitude
 *   lng     {number}  Centre longitude
 *   radius  {number}  Search radius in miles (default 10)
 *   limit   {number}  Max results to return (default 5, max 10)
 */
const express = require('express');
const https = require('https');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// Nominatim usage policy: set a descriptive User-Agent
const USER_AGENT = 'Tripify-Android/1.0 (https://github.com/nullreffer/tripify)';

function nominatimRequest(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON from Nominatim'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Nominatim timeout')); });
  });
}

// Convert miles → degrees (approximate, good enough for small radii)
function milesToDegrees(miles) {
  return miles / 69.0;
}

router.get('/nearby', requireAuth, async (req, res, next) => {
  try {
    const { q, lat, lng, radius = '10', limit = '5' } = req.query;

    if (!q || !lat || !lng) {
      return res.status(400).json({ error: 'q, lat, and lng are required' });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = Math.min(parseFloat(radius) || 10, 100);
    const limitNum = Math.min(parseInt(limit, 10) || 5, 10);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ error: 'lat and lng must be numbers' });
    }

    const degRadius = milesToDegrees(radiusNum);
    const viewbox = [
      lngNum - degRadius,
      latNum + degRadius,
      lngNum + degRadius,
      latNum - degRadius
    ].join(',');

    const params = new URLSearchParams({
      q: `${q} near ${latNum},${lngNum}`,
      format: 'json',
      limit: String(limitNum),
      viewbox,
      bounded: '1',
      addressdetails: '1'
    });

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    const results = await nominatimRequest(url);

    const places = (Array.isArray(results) ? results : []).map(item => ({
      id: item.place_id?.toString() ?? item.osm_id?.toString() ?? String(Math.random()),
      name: item.display_name?.split(',')[0]?.trim() ?? q,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      address: item.display_name ?? null
    }));

    res.json(places);
  } catch (err) { next(err); }
});

module.exports = router;
