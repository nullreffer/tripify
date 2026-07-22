import { mergeResults } from './poiUtils.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const API_BASE = import.meta.env.VITE_API_URL || '';

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

// Search for POIs near a given map viewport using Overpass API (much better for chain stores / POIs).
// Falls back to Nominatim when no bounds available.
// Also queries Google Places API and merges results.
export async function searchNearby(query, bounds) {
  if (!query?.trim()) return [];

  const [osmResult, googleResult] = await Promise.allSettled([
    osmSearchNearby(query, bounds),
    googlePlacesSearch(query, bounds),
  ]);

  const osm = osmResult.status === 'fulfilled' ? osmResult.value : [];
  const google = googleResult.status === 'fulfilled' ? googleResult.value : [];

  return mergeResults(osm, google);
}

async function osmSearchNearby(query, bounds) {
  if (bounds) {
    const overpass = await searchOverpass(query, bounds);
    if (overpass.length > 0) return overpass;
    return searchNominatimViewbox(query, bounds);
  }
  return searchNominatimViewbox(query, null);
}

async function googlePlacesSearch(query, bounds) {
  try {
    const params = new URLSearchParams({ q: query });
    if (bounds) {
      params.set('north', bounds.north);
      params.set('south', bounds.south);
      params.set('east', bounds.east);
      params.set('west', bounds.west);
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

async function searchOverpass(query, bounds) {
  try {
    // Overpass bbox: south,west,north,east
    const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
    // Search for nodes, ways, and relations matching the name (case-insensitive regex)
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ql = `[out:json][timeout:20];
(
  nwr["name"~"${escaped}",i](${bbox});
  nwr["brand"~"${escaped}",i](${bbox});
  nwr["operator"~"${escaped}",i](${bbox});
);
out center 30;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: ql,
      headers: { 'Content-Type': 'text/plain', 'User-Agent': 'Azitrip/1.0' },
      signal: AbortSignal.timeout(12000),
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
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'Azitrip/1.0' }, signal: AbortSignal.timeout(8000) }
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
