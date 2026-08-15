const express = require('express');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../middleware/requireAuth');
const { recordOutgoing } = require('../middleware/metrics');

const router = express.Router();

// ── Overpass response cache ───────────────────────────────────────────────────
// Keyed by the raw query string.  Entries expire after POI_CACHE_TTL_MS but are
// kept as stale entries (up to POI_STALE_TTL_MS) so they can be returned as a
// fallback when all upstream endpoints are unavailable (e.g. HTTP 429).
const POI_CACHE_TTL_MS   =  5 * 60 * 1000; // 5 minutes (fresh)
const POI_STALE_TTL_MS   = 60 * 60 * 1000; // 1 hour (stale-while-revalidate fallback)
const poiCache = new Map(); // query → { data, expiresAt, staleAt }

// Sweep entries that have passed the stale TTL every 10 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of poiCache) {
    if (now > entry.staleAt) poiCache.delete(key);
  }
}, 10 * 60 * 1000);

// Returns { data, stale } where stale=true means the entry has expired but is
// within the stale window and can be used as a fallback.
function poiCacheGet(query) {
  const entry = poiCache.get(query);
  if (!entry) return null;
  const now = Date.now();
  if (now > entry.staleAt) { poiCache.delete(query); return null; }
  return { data: entry.data, stale: now > entry.expiresAt };
}

function poiCacheSet(query, data) {
  poiCache.set(query, {
    data,
    expiresAt: Date.now() + POI_CACHE_TTL_MS,
    staleAt:   Date.now() + POI_STALE_TTL_MS,
  });
}

// ── HERE Places helpers ───────────────────────────────────────────────────────
const HERE_CATEGORY_QUERIES = {
  gas:        'gas station',
  restaurant: 'restaurant',
  hotel:      'hotel',
  campground:  'campground camping',
  ev:         'electric vehicle charging station',
  grocery:    'grocery supermarket',
  pharmacy:   'pharmacy',
  parking:    'parking',
  attraction: 'tourist attraction',
};

function normalizeHerePlace(item, category) {
  const lat = item.position?.lat;
  const lng = item.position?.lng;
  if (lat == null || lng == null) return null;
  return {
    id: `here-${item.id}`,
    name: item.title,
    displayName: item.address?.label || item.title,
    lat,
    lng,
    type: category,
    category,
    source: 'here',
    extratags: {
      opening_hours: item.openingHours?.[0]?.text?.join(', ') || null,
      phone: item.contacts?.[0]?.phone?.[0]?.value || null,
      website: item.contacts?.[0]?.www?.[0]?.value || null,
    },
  };
}

// ── TomTom Places helpers ─────────────────────────────────────────────────────
const TOMTOM_CATEGORY_IDS = {
  gas:        '7311',    // Petrol Station
  restaurant: '7315',    // Restaurant
  hotel:      '7314',    // Hotel/Motel
  campground:  '9927004', // Camping Ground
  ev:         '7309',    // Electric Vehicle Station
  grocery:    '9361',    // Grocery/Supermarket
  pharmacy:   '7326',    // Pharmacy
  parking:    '7313',    // Open Parking Area
  attraction: '7376',    // Tourist Attraction
};

function normalizeTomTomPlace(poi, category) {
  const lat = poi.position?.lat;
  const lng = poi.position?.lon;
  if (lat == null || lng == null) return null;
  const addr = poi.address;
  const displayName = addr
    ? [addr.streetName, addr.municipality, addr.country].filter(Boolean).join(', ')
    : null;
  return {
    id: `tomtom-${poi.id}`,
    name: poi.poi?.name || poi.type,
    displayName: displayName || poi.poi?.name || poi.type,
    lat,
    lng,
    type: category,
    category,
    source: 'tomtom',
    extratags: {
      phone: poi.poi?.phone || null,
      website: poi.poi?.url || null,
    },
  };
}

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
// Supports an optional `provider` field: 'overpass' (default) uses the primary
// overpass-api.de endpoint; 'mirror' uses an alternative community instance.
const overpassRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many requests. Please slow down.' },
});

const OVERPASS_ENDPOINTS = {
  overpass: 'https://overpass-api.de/api/interpreter',
  mirror:   'https://overpass.kumi.systems/api/interpreter',
};
// When the primary endpoint returns a retriable error (406/429/503), automatically
// fall back to the mirror endpoint so temporary overload or rate-limit events are
// transparent to the user.
const OVERPASS_RETRIABLE = new Set([406, 429, 503]);

async function fetchOverpassWithFallback(query, preferredProvider) {
  const primary = OVERPASS_ENDPOINTS[preferredProvider] || OVERPASS_ENDPOINTS.overpass;
  const fallback = primary === OVERPASS_ENDPOINTS.overpass
    ? OVERPASS_ENDPOINTS.mirror
    : OVERPASS_ENDPOINTS.overpass;

  // Try one endpoint; resolves with the Response when ok or non-retriable.
  // Rejects on retriable HTTP errors or network failures so Promise.any can
  // automatically pick the first healthy endpoint without sequential waiting.
  const tryFetch = async (url) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'User-Agent': 'Azitrip/1.0',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok || !OVERPASS_RETRIABLE.has(res.status)) {
      // Success or non-retriable (e.g. 400 Bad Request) — return as-is so
      // the caller can handle it.
      return res;
    }
    // Retriable (429/503/406) — reject so the other endpoint gets a chance.
    const body = await res.text().catch(() => '');
    console.warn(`[poi] Overpass ${url} → HTTP ${res.status}; trying parallel endpoint`);
    throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body });
  };

  try {
    // Fire both endpoints simultaneously; take the first one that resolves.
    return await Promise.any([tryFetch(primary), tryFetch(fallback)]);
  } catch {
    // AggregateError — all endpoints failed (both retriable or network errors)
    console.warn('[poi] All Overpass endpoints failed');
    return new Response('', { status: 502 });
  }
}

router.post('/poi', overpassRateLimit, requireAuth, async (req, res) => {
  const { query, provider } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }
  // Guard against excessively large or globally-scoped queries
  const MAX_QUERY_LEN = 2000;
  if (query.length > MAX_QUERY_LEN) {
    return res.status(400).json({ error: `query exceeds maximum length of ${MAX_QUERY_LEN} characters` });
  }
  // Require a bounding box to prevent global data dumps
  if (!query.includes('(') || !/\(-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+\)/.test(query)) {
    return res.status(400).json({ error: 'query must include a bounding box' });
  }

  // Serve from cache when available (fresh hit)
  const cacheEntry = poiCacheGet(query);
  if (cacheEntry && !cacheEntry.stale) {
    res.set('X-Cache', 'HIT');
    return res.json(cacheEntry.data);
  }

  const preferredProvider = Object.prototype.hasOwnProperty.call(OVERPASS_ENDPOINTS, provider) ? provider : 'overpass';
  const t0 = Date.now();
  try {
    const upstream = await fetchOverpassWithFallback(query, preferredProvider);
    const durationMs = Date.now() - t0;
    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      recordOutgoing('overpass', false, durationMs);
      console.error(`[poi] Overpass HTTP ${upstream.status} after ${durationMs}ms:`, errBody.slice(0, 500));
      // Fall back to stale cache when all endpoints are rate-limited or unavailable
      if (cacheEntry) {
        console.warn('[poi] Returning stale cache as fallback');
        res.set('X-Cache', 'STALE');
        return res.json(cacheEntry.data);
      }
      return res.status(upstream.status).json({ error: `Overpass error ${upstream.status}` });
    }
    recordOutgoing('overpass', true, durationMs);
    const data = await upstream.json();
    console.log(`[poi] Overpass OK after ${durationMs}ms → ${(data.elements || []).length} elements`);
    poiCacheSet(query, data);
    res.set('X-Cache', 'MISS');
    res.json(data);
  } catch (err) {
    const durationMs = Date.now() - t0;
    recordOutgoing('overpass', false, durationMs);
    console.error(`[poi] Overpass fetch failed after ${durationMs}ms:`, err.message, err.cause?.message || '');
    // Fall back to stale cache on network errors too
    if (cacheEntry) {
      console.warn('[poi] Returning stale cache as fallback after fetch error');
      res.set('X-Cache', 'STALE');
      return res.json(cacheEntry.data);
    }
    res.status(502).json({ error: 'POI data unavailable' });
  }
});

// GET /api/places/here-nearby?lat=&lng=&category=&radius=
// Proxies a HERE Discover search so the HERE_API_KEY stays server-side.
router.get('/here-nearby', placesRateLimit, requireAuth, async (req, res) => {
  const apiKey = (process.env.HERE_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('HERE nearby skipped: HERE_API_KEY is not configured');
    return res.json([]);
  }
  const { lat, lng, category, radius = 5000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });
  const q = HERE_CATEGORY_QUERIES[category];
  if (!q) return res.json([]);
  const t0 = Date.now();
  try {
    // Build the URL manually so the structural characters in the `in` parameter
    // value (colon, comma, semicolon) are NOT percent-encoded by URLSearchParams,
    // which the HERE Discover API requires in order to parse the geometry correctly.
    const baseParams = new URLSearchParams({ q, limit: '20', apiKey });
    const url = `https://discover.search.hereapi.com/v1/discover?${baseParams}&in=circle:${lat},${lng};r=${radius}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      recordOutgoing('herePlaces', false, Date.now() - t0);
      console.error('HERE nearby HTTP error:', response.status, category);
      return res.json([]);
    }
    const durationMs = Date.now() - t0;
    recordOutgoing('herePlaces', true, durationMs);
    const data = await response.json();
    console.log(`[here] ${category} ${durationMs}ms → ${(data.items || []).length} results`);
    res.json((data.items || []).map(item => normalizeHerePlace(item, category)).filter(Boolean).slice(0, 20));
  } catch (err) {
    recordOutgoing('herePlaces', false, Date.now() - t0);
    console.error('HERE nearby exception:', err.message);
    res.json([]);
  }
});

// GET /api/places/tomtom-nearby?lat=&lng=&category=&radius=
// Proxies a TomTom Nearby Search so the TOMTOM_API_KEY stays server-side.
router.get('/tomtom-nearby', placesRateLimit, requireAuth, async (req, res) => {
  const apiKey = (process.env.TOMTOM_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('TomTom nearby skipped: TOMTOM_API_KEY is not configured');
    return res.json([]);
  }
  const { lat, lng, category, radius = 5000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });
  const categorySet = TOMTOM_CATEGORY_IDS[category];
  if (!categorySet) return res.json([]);
  const t0 = Date.now();
  try {
    const params = new URLSearchParams({
      lat,
      lon: lng,
      radius: String(Math.min(Number(radius), 50000)),
      categorySet,
      limit: '20',
      key: apiKey,
    });
    const response = await fetch(
      `https://api.tomtom.com/search/2/nearbySearch/.json?${params}`,
      {
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: `apiKey ${apiKey}` },
      }
    );
    if (!response.ok) {
      recordOutgoing('tomtomPlaces', false, Date.now() - t0);
      console.error('TomTom nearby HTTP error:', response.status, category);
      return res.json([]);
    }
    const durationMs = Date.now() - t0;
    recordOutgoing('tomtomPlaces', true, durationMs);
    const data = await response.json();
    console.log(`[tomtom] ${category} ${durationMs}ms → ${(data.results || []).length} results`);
    res.json((data.results || []).map(poi => normalizeTomTomPlace(poi, category)).filter(Boolean).slice(0, 20));
  } catch (err) {
    recordOutgoing('tomtomPlaces', false, Date.now() - t0);
    console.error('TomTom nearby exception:', err.message);
    res.json([]);
  }
});

// ── Geocoding proxy ───────────────────────────────────────────────────────────
// Proxies Nominatim and Overpass text-search so browsers don't call those
// third-party endpoints directly.  The NOMINATIM_URL env var lets operators
// point to a self-hosted Nominatim instance.

const geocodingLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many requests. Please slow down.' },
});

function nominatimBase() {
  return (process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
}

// GET /api/places/geocode?q=&limit=
router.get('/geocode', geocodingLimit, requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q is required' });
  const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
  const params = new URLSearchParams({ q, format: 'json', limit: String(limit), addressdetails: '1' });
  try {
    const t0 = Date.now();
    const upstream = await fetch(`${nominatimBase()}/search?${params}`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'Azitrip/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!upstream.ok) {
      recordOutgoing('nominatim', false, Date.now() - t0);
      return res.status(upstream.status).json([]);
    }
    recordOutgoing('nominatim', true, Date.now() - t0);
    res.json(await upstream.json());
  } catch (err) {
    console.error('Nominatim geocode proxy error:', err.message);
    res.status(502).json([]);
  }
});

// GET /api/places/geocode/viewbox?q=&viewbox=west,north,east,south&bounded=0&limit=
router.get('/geocode/viewbox', geocodingLimit, requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q is required' });
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  const params = new URLSearchParams({ q, format: 'json', limit: String(limit), addressdetails: '1', extratags: '1' });
  if (req.query.viewbox) params.set('viewbox', req.query.viewbox);
  if (req.query.bounded) params.set('bounded', req.query.bounded);
  try {
    const t0 = Date.now();
    const upstream = await fetch(`${nominatimBase()}/search?${params}`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'Azitrip/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) {
      recordOutgoing('nominatim', false, Date.now() - t0);
      return res.status(upstream.status).json([]);
    }
    recordOutgoing('nominatim', true, Date.now() - t0);
    res.json(await upstream.json());
  } catch (err) {
    console.error('Nominatim viewbox proxy error:', err.message);
    res.status(502).json([]);
  }
});

// GET /api/places/reverse?lat=&lng=
router.get('/reverse', geocodingLimit, requireAuth, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'json' });
  try {
    const t0 = Date.now();
    const upstream = await fetch(`${nominatimBase()}/reverse?${params}`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'Azitrip/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!upstream.ok) {
      recordOutgoing('nominatim', false, Date.now() - t0);
      return res.status(upstream.status).json(null);
    }
    recordOutgoing('nominatim', true, Date.now() - t0);
    res.json(await upstream.json());
  } catch (err) {
    console.error('Nominatim reverse proxy error:', err.message);
    res.status(502).json(null);
  }
});

// POST /api/places/overpass-search
// Proxies an Overpass QL text-search query (used by geocoding.js searchOverpass).
router.post('/overpass-search', geocodingLimit, requireAuth, async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }

  const OVERPASS_INSTANCES = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let lastErr;
  for (const url of OVERPASS_INSTANCES) {
    try {
      const t0 = Date.now();
      const upstream = await fetch(url, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain', 'User-Agent': 'Azitrip/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (upstream.status === 429 || upstream.status >= 500) {
        recordOutgoing('overpass', false, Date.now() - t0);
        lastErr = new Error(`HTTP ${upstream.status}`);
        continue;
      }
      if (!upstream.ok) {
        recordOutgoing('overpass', false, Date.now() - t0);
        return res.status(upstream.status).json({ elements: [] });
      }
      recordOutgoing('overpass', true, Date.now() - t0);
      return res.json(await upstream.json());
    } catch (err) {
      lastErr = err;
    }
  }
  console.error('Overpass text-search proxy error:', lastErr?.message);
  res.status(502).json({ elements: [] });
});

module.exports = router;
