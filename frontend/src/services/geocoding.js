const NOMINATIM = 'https://nominatim.openstreetmap.org';

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

// Search for POIs near a given map viewport; bounds = {north,south,east,west}
export async function searchNearby(query, bounds) {
  if (!query?.trim()) return [];
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '20',
      addressdetails: '1',
      extratags: '1',
    });
    if (bounds) {
      // Nominatim viewbox: left,top,right,bottom = minLng,maxLat,maxLng,minLat
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
