import { mergeResults } from './poiUtils.js';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
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

async function osmNearbySearch(lat, lng, category, radiusMeters) {
  const tag = CATEGORY_TAGS[category];
  if (!tag) return [];
  const [key, val] = tag.split('=');
  const query = `[out:json][timeout:10];(node["${key}"="${val}"](around:${radiusMeters},${lat},${lng});way["${key}"="${val}"](around:${radiusMeters},${lat},${lng}););out center 15;`;
  try {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      body: query,
      signal: AbortSignal.timeout(12000)
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

export async function nearbySearch(lat, lng, category, radiusMeters = 5000) {
  const [osmResult, googleResult] = await Promise.allSettled([
    osmNearbySearch(lat, lng, category, radiusMeters),
    googleNearbySearch(lat, lng, category, radiusMeters),
  ]);

  const osm = osmResult.status === 'fulfilled' ? osmResult.value : [];
  const google = googleResult.status === 'fulfilled' ? googleResult.value : [];

  return mergeResults(osm, google);
}
