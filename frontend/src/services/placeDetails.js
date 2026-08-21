const API_BASE = import.meta.env.VITE_API_URL || '';

const cache = new Map();

/**
 * Fetch enriched place details (Wikipedia summary, photos).
 * Returns { summary, thumbnail, wikiUrl, commonsImages }.
 */
export async function fetchPlaceDetails({ name, lat, lng, wikipedia } = {}) {
  if (!name) return null;

  const key = `${name}:${lat?.toFixed(3)}:${lng?.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const params = new URLSearchParams({ name });
    if (lat != null) params.set('lat', lat);
    if (lng != null) params.set('lng', lng);
    if (wikipedia) params.set('wikipedia', wikipedia);

    const res = await fetch(`${API_BASE}/api/places/details?${params}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    cache.set(key, data);
    return data;
  } catch {
    return null;
  }
}
