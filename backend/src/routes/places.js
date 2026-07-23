const express = require('express');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// New Places API (v1) base URL
const PLACES_NEW_BASE = 'https://places.googleapis.com/v1/places';
// Legacy API base (kept for nearby endpoint which still works)
const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

const placesRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many requests. Please slow down.' },
});

function normalizeNewPlace(place) {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (lat == null || lng == null) return null;
  const openStatus = place.currentOpeningHours?.openNow != null
    ? (place.currentOpeningHours.openNow ? 'Open now' : 'Closed')
    : place.regularOpeningHours?.openNow != null
      ? (place.regularOpeningHours.openNow ? 'Open now' : 'Closed')
      : null;
  return {
    id: `google-${place.id}`,
    name: place.displayName?.text || place.id,
    displayName: place.formattedAddress || place.shortFormattedAddress || place.displayName?.text,
    lat,
    lng,
    type: place.types?.[0] || 'place',
    category: 'google',
    source: 'google',
    extratags: {
      opening_hours: openStatus,
      phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
      website: place.websiteUri || null,
      rating: place.rating || null,
      user_ratings_total: place.userRatingCount || null,
    },
  };
}

// Legacy normalizer (for /nearby which still uses old API)
function normalizePlace(place) {
  const lat = place.geometry?.location?.lat;
  const lng = place.geometry?.location?.lng;
  if (lat == null || lng == null) return null;
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
      phone: place.formatted_phone_number || null,
      website: place.website || null,
      rating: place.rating || null,
      user_ratings_total: place.user_ratings_total || null,
    },
  };
}

// GET /api/places/nearby?lat=&lng=&category=&radius=  (legacy API — category-based)
const GOOGLE_PLACE_TYPES = {
  gas: 'gas_station', restaurant: 'restaurant', hotel: 'lodging',
  campground: 'campground', ev: 'electric_vehicle_charging_station',
  grocery: 'supermarket', parking: 'parking', attraction: 'tourist_attraction',
};
router.get('/nearby', placesRateLimit, requireAuth, async (req, res) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return res.json([]);
  const { lat, lng, category, radius = 5000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });
  const type = GOOGLE_PLACE_TYPES[category];
  if (!type) return res.json([]);
  try {
    const params = new URLSearchParams({ location: `${lat},${lng}`, radius: String(radius), type, key: apiKey });
    const response = await fetch(`${PLACES_BASE}/nearbysearch/json?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return res.json([]);
    const data = await response.json();
    res.json((data.results || []).map(normalizePlace).filter(Boolean).slice(0, 20));
  } catch { res.json([]); }
});

// GET /api/places/search?q=&north=&south=&east=&west=
// Uses the new Places API (Text Search v1)
router.get('/search', placesRateLimit, requireAuth, async (req, res) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return res.json([]);
  const { q, north, south, east, west, lat, lng } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'q is required' });

  try {
    const body = { textQuery: q.trim(), maxResultCount: 20 };

    // Bias results to viewport rectangle if provided
    if (north && south && east && west) {
      body.locationBias = {
        rectangle: {
          low:  { latitude: parseFloat(south), longitude: parseFloat(west) },
          high: { latitude: parseFloat(north), longitude: parseFloat(east) },
        },
      };
    } else if (lat && lng) {
      body.locationBias = {
        circle: { center: { latitude: parseFloat(lat), longitude: parseFloat(lng) }, radius: 50000 },
      };
    }

    const response = await fetch(`${PLACES_NEW_BASE}:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.location',
          'places.types',
          'places.formattedAddress',
          'places.shortFormattedAddress',
          'places.regularOpeningHours.openNow',
          'places.currentOpeningHours.openNow',
          'places.internationalPhoneNumber',
          'places.websiteUri',
          'places.rating',
          'places.userRatingCount',
        ].join(','),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      console.error('Places API error:', response.status, err);
      return res.json([]);
    }

    const data = await response.json();
    res.json((data.places || []).map(normalizeNewPlace).filter(Boolean));
  } catch (err) {
    console.error('Places search exception:', err.message);
    res.json([]);
  }
});

module.exports = router;


const router = express.Router();

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

/**
 * Rate limiter for Places API proxy routes.
 * Limits each authenticated user to 30 requests per minute to prevent
 * excessive Google Places API usage.
 */
const placesRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
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
});

module.exports = router;
