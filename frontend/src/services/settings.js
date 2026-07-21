const KEY = 'azitrip-settings';

export const DEFAULTS = {
  units: 'imperial',    // 'imperial' | 'metric'
  mapStyle: 'auto',     // 'auto' | 'light' | 'dark'
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
