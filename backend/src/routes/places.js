const express = require('express');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../middleware/requireAuth');
const { recordOutgoing } = require('../middleware/metrics');

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

const METERS_PER_DEGREE_LATITUDE = 111320;
const MIN_COSINE_FOR_LNG_CALCULATION = 0.2;
// Hard cap: 200 miles in meters — generous upper bound while still preventing runaway global searches
const MAX_SEARCH_RADIUS_METERS = 321869;
// Minimum sensible search radius to avoid degenerate tiny searches
const MIN_SEARCH_RADIUS_METERS = 5000;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseLatitude(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? clamp(parsed, -90, 90) : null;
}

function normalizeLongitude(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = ((((parsed + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 && parsed > 0 ? 180 : normalized;
}

function estimateViewportRadiusMeters(north, south, east, west) {
  const centerLat = (north + south) / 2;
  let lngSpan = east - west;
  if (lngSpan < 0) lngSpan += 360;
  const latMeters = Math.abs(north - south) * METERS_PER_DEGREE_LATITUDE;
  const lngMeters = lngSpan * METERS_PER_DEGREE_LATITUDE * Math.max(
    MIN_COSINE_FOR_LNG_CALCULATION,
    Math.cos(centerLat * Math.PI / 180)
  );
  // Clamp: minimum 5 km, maximum 200 miles — keeps searches fast even on zoomed-out maps
  return clamp(Math.round(Math.max(latMeters, lngMeters) / 2), MIN_SEARCH_RADIUS_METERS, MAX_SEARCH_RADIUS_METERS);
}

// Build a locationRestriction rectangle centred on the provided point.
// The Places v1 Text Search API only supports `rectangle` (not `circle`) for
// locationRestriction. When an explicit centre + radius are provided we compute a
// bounding rectangle; when only viewport bounds are available we use those directly.
function buildLocationRestriction({ north, south, east, west, lat, lng, radius }) {
  const centerLat = parseLatitude(lat);
  const centerLng = normalizeLongitude(lng);

  const northNum = parseLatitude(north);
  const southNum = parseLatitude(south);
  const eastNum = normalizeLongitude(east);
  const westNum = normalizeLongitude(west);

  // Prefer the explicit map centre passed by the client
  if (centerLat != null && centerLng != null) {
    // Use the client-provided radius if valid, otherwise fall back to viewport estimation
    let searchRadius = MAX_SEARCH_RADIUS_METERS;
    const clientRadius = Number.parseFloat(radius);
    if (Number.isFinite(clientRadius) && clientRadius > 0) {
      searchRadius = clamp(Math.round(clientRadius), MIN_SEARCH_RADIUS_METERS, MAX_SEARCH_RADIUS_METERS);
    } else if ([northNum, southNum, eastNum, westNum].every(v => v != null) && northNum > southNum) {
      searchRadius = estimateViewportRadiusMeters(northNum, southNum, eastNum, westNum);
    }
    // Convert radius (meters) to degree offsets for the bounding rectangle
    const latDelta = searchRadius / METERS_PER_DEGREE_LATITUDE;
    const lngDelta = searchRadius / (METERS_PER_DEGREE_LATITUDE * Math.max(MIN_COSINE_FOR_LNG_CALCULATION, Math.cos(centerLat * Math.PI / 180)));
    return {
      rectangle: {
        low: {
          latitude: clamp(centerLat - latDelta, -90, 90),
          longitude: normalizeLongitude(centerLng - lngDelta),
        },
        high: {
          latitude: clamp(centerLat + latDelta, -90, 90),
          longitude: normalizeLongitude(centerLng + lngDelta),
        },
      },
    };
  }

  // Fall back to viewport bounds directly when no explicit centre is provided
  if ([northNum, southNum, eastNum, westNum].every(v => v != null) && northNum > southNum) {
    return {
      rectangle: {
        low: { latitude: southNum, longitude: westNum },
        high: { latitude: northNum, longitude: eastNum },
      },
    };
  }

  return null;
}

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
  if (!apiKey) {
    console.warn('Places nearby skipped: GOOGLE_PLACES_API_KEY is not configured');
    return res.json([]);
  }
  const { lat, lng, category, radius = 5000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });
  const type = GOOGLE_PLACE_TYPES[category];
  if (!type) return res.json([]);
  const t0 = Date.now();
  try {
    const params = new URLSearchParams({ location: `${lat},${lng}`, radius: String(radius), type, key: apiKey });
    const response = await fetch(`${PLACES_BASE}/nearbysearch/json?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      recordOutgoing('googlePlaces', false, Date.now() - t0);
      const err = await response.text().catch(() => '');
      console.error('Places nearby HTTP error:', response.status, category, lat, lng, err);
      return res.json([]);
    }
    const data = await response.json();
    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      recordOutgoing('googlePlaces', false, Date.now() - t0);
      console.error('Places nearby API error:', data.status, data.error_message || '');
      return res.json([]);
    }
    recordOutgoing('googlePlaces', true, Date.now() - t0);
    res.json((data.results || []).map(normalizePlace).filter(Boolean).slice(0, 20));
  } catch (err) {
    recordOutgoing('googlePlaces', false, Date.now() - t0);
    console.error('Places nearby exception:', err.message);
    res.json([]);
  }
});

// GET /api/places/search?q=&north=&south=&east=&west=
// Uses the new Places API (Text Search v1)
router.get('/search', placesRateLimit, requireAuth, async (req, res) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn('Places search skipped: GOOGLE_PLACES_API_KEY is not configured');
    return res.json([]);
  }
  const { q, north, south, east, west, lat, lng, radius } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'q is required' });

  const t0 = Date.now();
  try {
    const body = { textQuery: q.trim(), maxResultCount: 20 };
    // Use locationRestriction (hard circle limit) instead of locationBias
    // so the API never searches a huge area on zoomed-out maps.
    const locationRestriction = buildLocationRestriction({ north, south, east, west, lat, lng, radius });
    if (locationRestriction) body.locationRestriction = locationRestriction;

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
      recordOutgoing('googlePlaces', false, Date.now() - t0);
      const err = await response.text().catch(() => '');
      console.error('Places search API error:', response.status, q, err);
      return res.json([]);
    }

    recordOutgoing('googlePlaces', true, Date.now() - t0);
    const data = await response.json();
    const places = (data.places || []).map(normalizeNewPlace).filter(Boolean);
    if (!places.length) {
      console.warn('Places search returned no results:', q);
    }
    res.json(places);
  } catch (err) {
    recordOutgoing('googlePlaces', false, Date.now() - t0);
    console.error('Places search exception:', q, err.message);
    res.json([]);
  }
});

// POST /api/places/poi
// Proxies an Overpass QL query to the public interpreter so that errors are
// visible in backend logs and the API token is never exposed to clients.
const overpassRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many requests. Please slow down.' },
});

router.post('/poi', overpassRateLimit, requireAuth, async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }
  const t0 = Date.now();
  try {
    const upstream = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(20000),
    });
    const durationMs = Date.now() - t0;
    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      recordOutgoing('overpass', false, durationMs);
      console.error(`[poi] Overpass HTTP ${upstream.status} after ${durationMs}ms:`, errBody.slice(0, 500));
      return res.status(upstream.status).json({ error: `Overpass error ${upstream.status}` });
    }
    recordOutgoing('overpass', true, durationMs);
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    const durationMs = Date.now() - t0;
    recordOutgoing('overpass', false, durationMs);
    console.error(`[poi] Overpass fetch failed after ${durationMs}ms:`, err.message, err.cause?.message || '');
    res.status(502).json({ error: 'POI data unavailable' });
  }
});

module.exports = router;
