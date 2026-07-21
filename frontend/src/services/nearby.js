const OVERPASS = 'https://overpass-api.de/api/interpreter';

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

export async function nearbySearch(lat, lng, category, radiusMeters = 5000) {
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
      id: el.id,
      name: el.tags?.name || el.tags?.brand || `${category} (${el.type})`,
      lat: el.lat ?? el.center?.lat,
      lng: el.lon ?? el.center?.lon,
      tags: el.tags || {}
    })).filter(el => el.lat != null && el.lng != null);
  } catch {
    return [];
  }
}
