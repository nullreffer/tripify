const API_BASE = import.meta.env.VITE_API_URL || '';

// AQI colour scale (US EPA)
export const AQI_LEVELS = [
  { max: 50,  label: 'Good',                    color: '#00e400', textColor: '#000' },
  { max: 100, label: 'Moderate',                color: '#ffff00', textColor: '#000' },
  { max: 150, label: 'Unhealthy for Sensitive', color: '#ff7e00', textColor: '#000' },
  { max: 200, label: 'Unhealthy',               color: '#ff0000', textColor: '#fff' },
  { max: 300, label: 'Very Unhealthy',          color: '#8f3f97', textColor: '#fff' },
  { max: Infinity, label: 'Hazardous',          color: '#7e0023', textColor: '#fff' },
];

export function aqiMeta(aqi) {
  if (aqi == null || !Number.isFinite(aqi)) return null;
  return AQI_LEVELS.find(l => aqi <= l.max) || AQI_LEVELS[AQI_LEVELS.length - 1];
}

export async function getAqiStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/aqi/status`, {
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { tilesAvailable: false };
    return await res.json();
  } catch {
    return { tilesAvailable: false };
  }
}

export async function getAqiForStop(lat, lng) {
  try {
    const params = new URLSearchParams({ lat, lng });
    const res = await fetch(`${API_BASE}/api/aqi/point?${params}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
