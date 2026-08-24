/**
 * Aurora Borealis / Kp-index service
 *
 * Fetches the NOAA SWPC 3-day Planetary K-index forecast and exposes helpers
 * for determining aurora visibility per latitude at a given time.
 *
 * Data source (public, no auth required):
 *   https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json
 *
 * Response schema: array of rows, first row is the header.
 *   ["time_tag", "kp", "observed", "noaa_scale"]
 *
 * Kp vs equatorward aurora boundary (approximate):
 *   Kp 0 → ~66° lat    Kp 3 → ~58° lat
 *   Kp 5 → ~55° lat    Kp 7 → ~50° lat
 *   Kp 9 → ~45° lat
 * Rule of thumb: aurora visible when  Kp  ≥  (90 − |lat|) / 3.3
 */

const SWPC_URL =
  'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';

const SWPC_27DAY_URL =
  'https://services.swpc.noaa.gov/text/27-day-outlook.txt';

/**
 * Fetch the 3-day Kp forecast from NOAA SWPC.
 * Returns an array of { time: Date, kp: number } objects sorted by time.
 */
export async function fetchKpForecast() {
  const res = await fetch(SWPC_URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('Failed to fetch aurora forecast');
  const raw = await res.json();
  // First row is header
  const rows = raw.slice(1);
  return rows
    .map(([timeTag, kp]) => ({
      time: new Date(timeTag + 'Z'), // SWPC uses UTC but omits the Z
      kp: parseFloat(kp),
    }))
    .filter(r => !isNaN(r.time.getTime()) && !isNaN(r.kp))
    .sort((a, b) => a.time - b.time);
}

/**
 * Given a Kp value, return the approximate equatorward latitude boundary
 * (degrees) at which aurora becomes visible.
 * Returns null if Kp is effectively 0 (no useful aurora).
 */
export function auroraLatBoundary(kp) {
  if (kp <= 0) return null;
  // Empirical fit: boundary ≈ 66.5 − 3.3 * kp  (clamped to [40, 66.5])
  return Math.max(40, Math.min(66.5, 66.5 - 3.3 * kp));
}

/**
 * Determine aurora visibility for a given latitude and Kp value.
 * Returns one of: 'none' | 'possible' | 'likely' | 'strong'
 */
export function auroraVisibility(lat, kp) {
  const absLat = Math.abs(lat);
  const boundary = auroraLatBoundary(kp);
  if (boundary === null || absLat < boundary - 5) return 'none';
  if (absLat < boundary) return 'possible';
  if (absLat < boundary + 5) return 'likely';
  return 'strong';
}

/**
 * Map a visibility level to a display colour.
 */
export const AURORA_COLORS = {
  none: null,
  possible: '#facc15',   // yellow
  likely: '#4ade80',     // green
  strong: '#7c3aed',     // purple
};

/**
 * Fetch the NOAA 27-day space weather outlook and return an array of
 * { date: Date, kp: number } objects (one per calendar day).
 * Falls back to an empty array on error.
 */
export async function fetchKpForecast27Day() {
  try {
    const res = await fetch(SWPC_27DAY_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const text = await res.text();
    const rows = [];
    for (const line of text.split('\n')) {
      // Data lines look like:  2026-08-24         145          5         3
      // Columns: Date, Radio Flux, Planetary A Index, Largest Kp Index
      const match = line.match(/^(\d{4}-\d{2}-\d{2})\s+\d+\s+\d+\s+(\d+)/);
      if (match) {
        const date = new Date(match[1] + 'T12:00:00Z');
        const kp = parseInt(match[2], 10);
        if (!isNaN(date.getTime()) && !isNaN(kp)) rows.push({ date, kp });
      }
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * Aggregate a Kp forecast array (from fetchKpForecast) into daily buckets.
 * Returns an array of { date: Date, kp: number } with the max Kp per day.
 */
export function aggregateForecastByDay(forecast) {
  const dayMap = new Map();
  for (const entry of forecast) {
    const key = entry.time.toISOString().slice(0, 10);
    const existing = dayMap.get(key);
    if (!existing || entry.kp > existing.kp) {
      dayMap.set(key, { date: new Date(key + 'T12:00:00Z'), kp: entry.kp });
    }
  }
  return [...dayMap.values()].sort((a, b) => a.date - b.date);
}

/**
 * Return a descriptive label for a Kp value.
 */
export function kpLabel(kp) {
  if (kp < 1) return 'Quiet';
  if (kp < 3) return 'Unsettled';
  if (kp < 5) return 'Active';
  if (kp < 7) return 'Minor storm';
  if (kp < 8) return 'Moderate storm';
  if (kp < 9) return 'Strong storm';
  return 'Extreme storm';
}
