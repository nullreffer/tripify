const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

/**
 * Get a road route between ordered stops.
 * Returns { geometry: GeoJSON LineString, distance (m), duration (s), legs } or null.
 */
export async function getRoute(stops) {
  if (!stops || stops.length < 2) return null;
  const coords = stops.map(s => `${s.lng},${s.lat}`).join(';');
  try {
    const res = await fetch(
      `${OSRM_BASE}/${coords}?overview=full&geometries=geojson&steps=false`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes[0]) return null;
    const route = data.routes[0];
    return {
      geometry: route.geometry,            // GeoJSON LineString
      distance: route.distance,            // meters
      duration: route.duration,            // seconds
      legs: route.legs.map(l => ({         // per-segment info
        distance: l.distance,
        duration: l.duration
      }))
    };
  } catch {
    return null;
  }
}

export function formatDistance(meters, units = 'imperial') {
  if (meters == null) return '';
  if (units === 'metric') {
    if (meters < 1000) return `${Math.round(meters)} m`;
    const km = meters / 1000;
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  }
  // imperial
  if (meters < 500) return `${Math.round(meters * 3.28084)} ft`;
  const miles = meters / 1609.34;
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

export function formatDuration(seconds) {
  if (seconds == null) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}
