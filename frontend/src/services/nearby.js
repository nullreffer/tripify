import { mergeResults, distMeters } from './poiUtils.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

const CATEGORY_TAGS = {
  gas:        'amenity=fuel',
  restaurant: 'amenity=restaurant',
  hotel:      'tourism=hotel',
  campground: 'tourism=camp_site',
  ev:         'amenity=charging_station',
  grocery:    'shop=supermarket',
  pharmacy:   'amenity=pharmacy',
  parking:    'amenity=parking',
  attraction: 'tourism=attraction',
};

export const NEARBY_CATEGORIES = [
  { key: 'gas',        label: 'Gas', emoji: '⛽' },
  { key: 'restaurant', label: 'Food', emoji: '🍴' },
  { key: 'hotel',      label: 'Hotels', emoji: '🏨' },
  { key: 'campground', label: 'Camping', emoji: '🏕️' },
  { key: 'ev',         label: 'EV', emoji: '⚡' },
  { key: 'grocery',    label: 'Grocery', emoji: '🛒' },
  { key: 'parking',    label: 'Parking', emoji: '🅿️' },
  { key: 'attraction', label: 'Sights', emoji: '🎡' },
];

// Routes the Overpass query through the backend proxy (which caches and has
// automatic fallback to an alternate instance).
async function osmNearbySearch(lat, lng, category, radiusMeters, overpassProvider = 'overpass') {
  const tag = CATEGORY_TAGS[category];
  if (!tag) return [];
  const [key, val] = tag.split('=');
  // Build a bounding-box query centred on the point with a rough degree offset.
  const deg = radiusMeters / 111320;
  const latDeg = deg;
  const lngDeg = deg / Math.max(Math.cos(lat * Math.PI / 180), 0.01);
  const s = (lat - latDeg).toFixed(5);
  const w = (lng - lngDeg).toFixed(5);
  const n = (lat + latDeg).toFixed(5);
  const e = (lng + lngDeg).toFixed(5);
  const query = `[out:json][timeout:10];(node["${key}"="${val}"](${s},${w},${n},${e});way["${key}"="${val}"](${s},${w},${n},${e}););out center 15;`;
  try {
    const res = await fetch(`${API_BASE}/api/places/poi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ query, provider: overpassProvider }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.elements || []).map(el => ({
      id: `osm-${el.id}`,
      name: el.tags?.name || el.tags?.brand || `${category} (${el.type})`,
      lat: el.lat ?? el.center?.lat,
      lng: el.lon ?? el.center?.lon,
      tags: el.tags || {},
      source: 'osm',
    })).filter(el => el.lat != null && el.lng != null);
  } catch {
    return [];
  }
}

async function googleNearbySearch(lat, lng, category, radiusMeters) {
  try {
    const params = new URLSearchParams({ lat, lng, category, radius: radiusMeters });
    const res = await fetch(`${API_BASE}/api/places/nearby?${params}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function hereNearbySearch(lat, lng, category, radiusMeters) {
  try {
    const params = new URLSearchParams({ lat, lng, category, radius: radiusMeters });
    const res = await fetch(`${API_BASE}/api/places/here-nearby?${params}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function tomtomNearbySearch(lat, lng, category, radiusMeters) {
  try {
    const params = new URLSearchParams({ lat, lng, category, radius: radiusMeters });
    const res = await fetch(`${API_BASE}/api/places/tomtom-nearby?${params}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * Merge results from multiple sources, deduplicating by proximity.
 * Priority (kept when dupes are found): osm > google > here > tomtom
 */
function mergeMultiSourceResults(resultSets) {
  const SOURCE_PRIORITY = ['osm', 'google', 'here', 'tomtom'];
  // Sort by priority first so higher-priority items are encountered first during dedup
  const all = resultSets.flat().sort((a, b) => {
    const ai = SOURCE_PRIORITY.indexOf(a.source);
    const bi = SOURCE_PRIORITY.indexOf(b.source);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const kept = [];
  for (const item of all) {
    const isDupe = kept.some(k => distMeters(item, k) < 60);
    if (!isDupe) kept.push(item);
  }
  return kept;
}

/**
 * Perform a nearby search using all sources listed in `sources` (array).
 * Accepts a legacy string value for backward compatibility.
 */
export async function nearbySearch(lat, lng, category, radiusMeters = 5000, sources = ['overpass']) {
  // Normalise: legacy single-string provider → array
  const sourceList = Array.isArray(sources) ? sources : [sources];

  const promises = sourceList.map(src => {
    switch (src) {
      case 'overpass': return osmNearbySearch(lat, lng, category, radiusMeters, 'overpass');
      case 'mirror':   return osmNearbySearch(lat, lng, category, radiusMeters, 'mirror');
      case 'google':   return googleNearbySearch(lat, lng, category, radiusMeters);
      case 'here':     return hereNearbySearch(lat, lng, category, radiusMeters);
      case 'tomtom':   return tomtomNearbySearch(lat, lng, category, radiusMeters);
      default:         return Promise.resolve([]);
    }
  });

  const settled = await Promise.allSettled(promises);
  const resultSets = settled.map(r => r.status === 'fulfilled' ? r.value : []);
  return mergeMultiSourceResults(resultSets);
}
