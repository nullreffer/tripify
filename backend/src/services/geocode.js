const fetch = require('node-fetch');

/**
 * Minimal geocoding wrapper using OpenStreetMap Nominatim by default.
 * Returns { lat, lon, display_name } or null.
 */
async function geocode(query) {
  if (!query) return null;
  const q = encodeURIComponent(query);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&limit=1`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'tripify/1.0 (contact@example.com)' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const top = data[0];
    return { lat: Number(top.lat), lon: Number(top.lon), display_name: top.display_name };
  } catch (err) {
    console.error('Geocode error', err);
    return null;
  }
}

module.exports = { geocode };
