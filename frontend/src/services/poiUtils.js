// Approx distance in metres between two lat/lng pairs (Haversine)
export function distMeters(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const c = sinLat * sinLat +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

/**
 * Merge OSM and Google results, preferring Google entries when they represent
 * the same place (within dedupeRadiusMeters metres of each other).
 */
export function mergeResults(osmResults, googleResults, dedupeRadiusMeters = 60) {
  const merged = [...googleResults];
  const usedGoogle = new Set();

  for (const osm of osmResults) {
    let isDupe = false;
    for (let i = 0; i < googleResults.length; i++) {
      if (usedGoogle.has(i)) continue;
      if (distMeters(osm, googleResults[i]) < dedupeRadiusMeters) {
        isDupe = true;
        usedGoogle.add(i);
        break;
      }
    }
    if (!isDupe) merged.push(osm);
  }

  return merged;
}
