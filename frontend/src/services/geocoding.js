import { mergeResults } from './poiUtils.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const API_BASE = import.meta.env.VITE_API_URL || '';

// ── Client-side result cache ─────────────────────────────────────────────────
// Keyed by (query + rounded center). Entries expire after 5 minutes.
// Bounded to MAX_CACHE_ENTRIES to cap memory; oldest-inserted entry is evicted
// when the limit is reached (Maps preserve insertion order).
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const searchCache = new Map();

function cacheKey(query, center) {
  const q = query.toLowerCase().trim();
  if (!center) return q;
  // Round to 0.1° so nearby map positions share the same cache entry
  const lat = Math.round(center.lat * 10) / 10;
  const lng = Math.round(center.lng * 10) / 10;
  return `${q}:${lat}:${lng}`;
}

function getCached(key) {
  const hit = searchCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) { searchCache.delete(key); return null; }
  return hit.data;
}

function setCached(key, data) {
  if (searchCache.size >= MAX_CACHE_ENTRIES) {
    // Evict the oldest entry
    searchCache.delete(searchCache.keys().next().value);
  }
  searchCache.set(key, { data, ts: Date.now() });
}

export async function searchLocations(query) {
  if (!query?.trim()) return [];
  try {
    const res = await fetch(
      `${NOMINATIM}/search?q=${encodeURIComponent(query)}&format=json&limit=8&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'Azitrip/1.0' }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const results = await res.json();
    return results.map(r => ({
      id: r.place_id,
      name: r.name || r.display_name.split(',')[0],
      displayName: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      type: r.type,
      category: r.class
    }));
  } catch {
    return [];
  }
}

// Search for POIs near a given map center using Overpass API (much better for chain stores / POIs).
// Falls back to Nominatim when no center available.
// Also queries Google Places API and merges results.
export async function searchNearby(query, center, radiusMeters = 160934) {
  if (!query?.trim()) return [];

  const key = cacheKey(query, center);
  const cached = getCached(key);
  if (cached) return cached;

  const [osmResult, googleResult] = await Promise.allSettled([
    osmSearchNearby(query, center, radiusMeters),
    googlePlacesSearch(query, center, radiusMeters),
  ]);

  const osm = osmResult.status === 'fulfilled' ? osmResult.value : [];
  const google = googleResult.status === 'fulfilled' ? googleResult.value : [];

  const results = mergeResults(osm, google);
  setCached(key, results);
  return results;
}

// Run Overpass and Nominatim in parallel so neither blocks the other.
// Previously they ran serially (Overpass then Nominatim fallback), which
// could take 12 s + 8 s = 20 s in the worst case.
async function osmSearchNearby(query, center, radiusMeters) {
  if (center?.lat != null && center?.lng != null) {
    const degLat = radiusMeters / 111320;
    const degLng = radiusMeters / (111320 * Math.max(0.1, Math.cos(center.lat * Math.PI / 180)));
    const bounds = {
      north: center.lat + degLat,
      south: center.lat - degLat,
      east: center.lng + degLng,
      west: center.lng - degLng,
    };

    const [overpassResult, nominatimResult] = await Promise.allSettled([
      searchOverpass(query, center, radiusMeters),
      searchNominatimViewbox(query, bounds),
    ]);

    const overpass = overpassResult.status === 'fulfilled' ? overpassResult.value : [];
    const nominatim = nominatimResult.status === 'fulfilled' ? nominatimResult.value : [];

    // Prefer Overpass results; add unique Nominatim results that weren't found by Overpass
    return mergeResults(nominatim, overpass);
  }
  return searchNominatimViewbox(query, null);
}

async function googlePlacesSearch(query, center, radiusMeters) {
  try {
    const params = new URLSearchParams({ q: query });
    if (center?.lat != null && center?.lng != null) {
      params.set('lat', center.lat);
      params.set('lng', center.lng);
    }
    if (radiusMeters) {
      params.set('radius', radiusMeters);
    }
    const res = await fetch(`${API_BASE}/api/places/search?${params}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function searchOverpass(query, center, radiusMeters) {
  try {
    // Search for nodes, ways, and relations matching the name (case-insensitive regex)
    // within a circle around the map center
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const around = `around:${Math.round(radiusMeters)},${center.lat},${center.lng}`;
    const ql = `[out:json][timeout:6];
(
  nwr["name"~"${escaped}",i](${around});
  nwr["brand"~"${escaped}",i](${around});
  nwr["operator"~"${escaped}",i](${around});
);
out center 20;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: ql,
      headers: { 'Content-Type': 'text/plain', 'User-Agent': 'Azitrip/1.0' },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.elements || [])
      .filter(el => el.tags?.name)
      .slice(0, 30)
      .map(el => {
        const lat = el.type === 'node' ? el.lat : el.center?.lat;
        const lng = el.type === 'node' ? el.lon : el.center?.lon;
        if (!lat || !lng) return null;
        const tags = el.tags || {};
        const hours = tags.opening_hours || null;
        const phone = tags.phone || tags['contact:phone'] || null;
        const website = tags.website || tags['contact:website'] || null;
        return {
          id: `${el.type}-${el.id}`,
          name: tags.name,
          displayName: [tags.name, tags['addr:street'], tags['addr:city'], tags['addr:state']].filter(Boolean).join(', '),
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          type: tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.highway || 'place',
          category: tags.amenity ? 'amenity' : tags.shop ? 'shop' : tags.tourism ? 'tourism' : 'other',
          extratags: { opening_hours: hours, phone, website },
          source: 'osm',
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function searchNominatimViewbox(query, bounds) {
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '20',
      addressdetails: '1',
      extratags: '1',
    });
    if (bounds) {
      params.set('viewbox', `${bounds.west},${bounds.north},${bounds.east},${bounds.south}`);
      params.set('bounded', '0');
    }
    const res = await fetch(
      `${NOMINATIM}/search?${params}`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'Azitrip/1.0' }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const results = await res.json();
    return results.map(r => ({
      id: r.place_id,
      name: r.name || r.display_name.split(',')[0],
      displayName: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      type: r.type,
      category: r.class,
      extratags: r.extratags || {},
      source: 'osm',
    }));
  } catch {
    return [];
  }
}

export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'Azitrip/1.0' }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      name: data.name || data.display_name?.split(',')[0] || 'Unknown location',
      displayName: data.display_name,
      address: data.display_name
    };
  } catch {
    return null;
  }
}
