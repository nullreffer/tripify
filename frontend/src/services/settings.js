const KEY = 'azitrip-settings';

export const DEFAULTS = {
  units: 'imperial',         // 'imperial' | 'metric'
  mapStyle: 'auto',          // 'auto' | 'light' | 'dark'
  mapTileProvider: 'stadia', // 'stadia' | 'osm'
  poiProvider: 'overpass',   // 'overpass' | 'mirror' | 'here' | 'tomtom'
  orientation: 'portrait',   // 'portrait' | 'auto'
  pinTapZoom: 15,             // zoom level when tapping a pin (10–18)
  offlineRadiusMi: 5,         // radius in miles for offline tile download
  searchRadiusMi: 100,        // radius in miles for map area search
  fuelEfficiencyMpg: 25,      // vehicle fuel efficiency in MPG (imperial) or L/100km (metric)
  fuelPricePerGallon: null,   // fuel price per gallon (imperial) or per liter (metric); null = not set
};

export function getSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch) {
  const current = getSettings();
  localStorage.setItem(KEY, JSON.stringify({ ...current, ...patch }));
  // Dispatch event so other components can react
  window.dispatchEvent(new CustomEvent('azitrip-settings-change', { detail: { ...current, ...patch } }));
}

export function useSettingsListener(callback) {
  // Usage: call inside useEffect to listen for changes from other tabs/components
  const handler = (e) => callback(e.detail);
  window.addEventListener('azitrip-settings-change', handler);
  return () => window.removeEventListener('azitrip-settings-change', handler);
}
