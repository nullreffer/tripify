<<<<<<< HEAD
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
=======
const express = require('express');
>>>>>>> origin/main
const rateLimit = require('express-rate-limit');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

<<<<<<< HEAD
// Nominatim usage policy: set a descriptive User-Agent
const USER_AGENT = 'Tripify-Android/1.0 (https://github.com/nullreffer/tripify)';

// Limit place searches to 30 per minute per authenticated user IP
const searchRateLimit = rateLimit({
=======
const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

/**
 * Rate limiter for Places API proxy routes.
 * Limits each authenticated user to 30 requests per minute to prevent
 * excessive Google Places API usage.
 */
const placesRateLimit = rateLimit({
>>>>>>> origin/main
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
<<<<<<< HEAD
  message: { error: 'Too many search requests, please slow down.' }
});

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
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Search request timed out')); });
  });
}

// Convert miles → degrees (approximate, good enough for small radii)
function milesToDegrees(miles) {
  return miles / 69.0;
}

router.get('/nearby', searchRateLimit, requireAuth, async (req, res, next) => {
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
      id: item.place_id?.toString() ?? item.osm_id?.toString() ?? `${item.lat}-${item.lon}-${encodeURIComponent(q)}`,
      name: item.display_name?.split(',')[0]?.trim() ?? q,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      address: item.display_name ?? null
    }));

    res.json(places);
  } catch (err) { next(err); }
=======
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many requests. Please slow down.' },
});

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

function normalizePlace(place) {
  const lat = place.geometry?.location?.lat;
  const lng = place.geometry?.location?.lng;
  if (lat == null || lng == null) return null;
  // Show "Open now" / "Closed" rather than the full verbose weekday_text array
  const openStatus = place.opening_hours?.open_now != null
    ? (place.opening_hours.open_now ? 'Open now' : 'Closed')
    : null;
  return {
    id: `google-${place.place_id}`,
    name: place.name,
    displayName: place.vicinity || place.formatted_address || place.name,
    lat,
    lng,
    type: place.types?.[0] || 'place',
    category: 'google',
    source: 'google',
    extratags: {
      opening_hours: openStatus,
      phone: place.formatted_phone_number || place.international_phone_number || null,
      website: place.website || null,
      rating: place.rating || null,
      user_ratings_total: place.user_ratings_total || null,
    },
  };
}

// GET /api/places/nearby?lat=&lng=&category=&radius=
router.get('/nearby', placesRateLimit, requireAuth, async (req, res) => {
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
router.get('/search', placesRateLimit, requireAuth, async (req, res) => {
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
>>>>>>> origin/main
});

module.exports = router;
