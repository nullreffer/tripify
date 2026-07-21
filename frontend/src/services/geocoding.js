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
