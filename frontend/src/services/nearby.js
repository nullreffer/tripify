import { mergeResults } from './poiUtils.js';

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

export async function nearbySearch(lat, lng, category, radiusMeters = 5000, provider = 'overpass') {
  let osmPromise, altPromise;

  if (provider === 'here') {
    osmPromise = Promise.resolve([]);
    altPromise = hereNearbySearch(lat, lng, category, radiusMeters);
  } else if (provider === 'tomtom') {
    osmPromise = Promise.resolve([]);
    altPromise = tomtomNearbySearch(lat, lng, category, radiusMeters);
  } else {
    // 'overpass' or 'mirror' — use OSM + Google in parallel
    osmPromise = osmNearbySearch(lat, lng, category, radiusMeters, provider);
    altPromise = googleNearbySearch(lat, lng, category, radiusMeters);
  }

  const [osmResult, altResult] = await Promise.allSettled([osmPromise, altPromise]);
  const osm = osmResult.status === 'fulfilled' ? osmResult.value : [];
  const alt = altResult.status === 'fulfilled' ? altResult.value : [];
  return mergeResults(osm, alt);
}
