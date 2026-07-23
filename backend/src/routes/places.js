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

const METERS_PER_DEGREE_LATITUDE = 111320;
const MAX_NON_WRAPAROUND_LNG_SPAN = 180;
const MAX_RECTANGLE_LAT_SPAN = 90;
const MIN_COSINE_FOR_LNG_CALCULATION = 0.2;

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseLatitude(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? clampNumber(parsed, -90, 90) : null;
}

function normalizeLongitude(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  // Double modulo keeps wrapped negative longitudes in the standard [-180, 180] range.
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
  return clampNumber(Math.round(Math.max(latMeters, lngMeters) / 2), 5000, 50000);
}

function buildLocationBias({ north, south, east, west, lat, lng }) {
  const centerLat = parseLatitude(lat);
  const centerLng = normalizeLongitude(lng);

  const northNum = parseLatitude(north);
  const southNum = parseLatitude(south);
  const eastNum = normalizeLongitude(east);
  const westNum = normalizeLongitude(west);

  if ([northNum, southNum, eastNum, westNum].every(v => v != null) && northNum > southNum) {
    const latSpan = northNum - southNum;
    const rawLngSpan = eastNum - westNum;
    let lngSpan = rawLngSpan;
    if (lngSpan < 0) lngSpan += 360;

    if (
      latSpan <= MAX_RECTANGLE_LAT_SPAN &&
      rawLngSpan > 0 &&
      rawLngSpan <= MAX_NON_WRAPAROUND_LNG_SPAN
    ) {
      return {
        rectangle: {
          low: { latitude: southNum, longitude: westNum },
          high: { latitude: northNum, longitude: eastNum },
        },
      };
    }

    const viewportCenterLat = (northNum + southNum) / 2;
    // Normalize after adding half the wrapped span so antimeridian-crossing bounds land on the intended midpoint.
    const viewportCenterLng = normalizeLongitude(westNum + (lngSpan / 2));
    return {
      circle: {
        center: { latitude: viewportCenterLat, longitude: viewportCenterLng },
        radius: estimateViewportRadiusMeters(northNum, southNum, eastNum, westNum),
      },
    };
  }

  if (centerLat != null && centerLng != null) {
    return {
      circle: {
        center: { latitude: centerLat, longitude: centerLng },
        radius: 50000,
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
  try {
    const params = new URLSearchParams({ location: `${lat},${lng}`, radius: String(radius), type, key: apiKey });
    const response = await fetch(`${PLACES_BASE}/nearbysearch/json?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      const err = await response.text().catch(() => '');
      console.error('Places nearby HTTP error:', response.status, category, lat, lng, err);
      return res.json([]);
    }
    const data = await response.json();
    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Places nearby API error:', data.status, data.error_message || '');
      return res.json([]);
    }
    res.json((data.results || []).map(normalizePlace).filter(Boolean).slice(0, 20));
  } catch (err) {
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
  const { q, north, south, east, west, lat, lng } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'q is required' });

  try {
    const body = { textQuery: q.trim(), maxResultCount: 20 };
    const locationBias = buildLocationBias({ north, south, east, west, lat, lng });
    if (locationBias) body.locationBias = locationBias;

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
      console.error('Places search API error:', response.status, q, err);
      return res.json([]);
    }

    const data = await response.json();
    const places = (data.places || []).map(normalizeNewPlace).filter(Boolean);
    if (!places.length) {
      console.warn('Places search returned no results:', q);
    }
    res.json(places);
  } catch (err) {
    console.error('Places search exception:', q, err.message);
    res.json([]);
  }
});

module.exports = router;
