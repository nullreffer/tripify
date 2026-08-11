import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar.jsx';
import { getSettings, saveSettings } from '../services/settings.js';
import { getNotificationState, subscribeToNotifications, unsubscribeFromNotifications } from '../services/notifications.js';

function ToggleGroup({ value, options, onChange }) {
  return (
    <div className="toggle-group">
      {options.map(o => (
        <button
          key={o.value}
          className={`toggle-btn${value === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(getSettings());
  const [notifState, setNotifState] = useState('unsupported');
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    getNotificationState().then(setNotifState);
  }, []);

  const update = (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
  };

  const handleNotifToggle = async () => {
    setNotifLoading(true);
    try {
      if (notifState === 'subscribed') {
        await unsubscribeFromNotifications();
        setNotifState('unsubscribed');
      } else {
        const ok = await subscribeToNotifications();
        setNotifState(ok ? 'subscribed' : await getNotificationState());
      }
    } finally {
      setNotifLoading(false);
    }
  };

  return (
    <div className="settings-page">
      <NavBar />
      <main className="main-content">
        <div className="settings-header">
          <button className="btn-ghost" onClick={() => navigate(-1)}>← Back</button>
          <h2>Settings</h2>
        </div>

        <div className="settings-card">
          <div className="settings-section">
            <h3>Distance &amp; Units</h3>
            <div className="settings-row">
              <div className="settings-row-label">
                <span>Distance units</span>
                <span className="settings-row-hint">Affects all distances in the app</span>
              </div>
              <ToggleGroup
                value={settings.units}
                options={[{ value: 'imperial', label: 'Miles' }, { value: 'metric', label: 'Km' }]}
                onChange={v => update('units', v)}
              />
            </div>
          </div>

          <div className="settings-divider" />

          <div className="settings-section">
            <h3>Map</h3>
            <div className="settings-row">
              <div className="settings-row-label">
                <span>Map style</span>
                <span className="settings-row-hint">Light / dark / follow system</span>
              </div>
              <ToggleGroup
                value={settings.mapStyle}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                onChange={v => update('mapStyle', v)}
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <span>Map tile provider</span>
                <span className="settings-row-hint">Stadia Maps (styled) or OpenStreetMap (standard)</span>
              </div>
              <ToggleGroup
                value={settings.mapTileProvider ?? 'stadia'}
                options={[{ value: 'stadia', label: 'Stadia' }, { value: 'osm', label: 'OSM' }]}
                onChange={v => update('mapTileProvider', v)}
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <span>POI data sources</span>
                <span className="settings-row-hint">Select one or more sources — results are merged and deduplicated. HERE requires HERE_API_KEY; TomTom requires TOMTOM_API_KEY.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { value: 'overpass', label: 'Overpass (OSM)' },
                  { value: 'mirror',   label: 'Overpass Mirror' },
                  { value: 'here',     label: 'HERE' },
                  { value: 'tomtom',   label: 'TomTom' },
                ].map(opt => {
                  const sources = Array.isArray(settings.poiSources) ? settings.poiSources : ['overpass'];
                  const checked = sources.includes(opt.value);
                  return (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? sources.filter(s => s !== opt.value)
                            : [...sources, opt.value];
                          // Always keep at least one source selected
                          if (next.length > 0) update('poiSources', next);
                        }}
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <span>Zoom when tapping a pin</span>
                <span className="settings-row-hint">
                  How far to zoom in when you tap a stop on the map (10 = far, 18 = street level). Currently: {settings.pinTapZoom ?? 15}
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={18}
                step={1}
                value={settings.pinTapZoom ?? 15}
                onChange={e => update('pinTapZoom', Number(e.target.value))}
                style={{ width: '120px' }}
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <span>Search radius</span>
                <span className="settings-row-hint">
                  How far from the map center to search when using the map area search. Currently: {settings.searchRadiusMi ?? 100} mi
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={200}
                step={10}
                value={settings.searchRadiusMi ?? 100}
                onChange={e => update('searchRadiusMi', Number(e.target.value))}
                style={{ width: '120px' }}
              />
            </div>
          </div>

          <div className="settings-divider" />

          <div className="settings-section">
            <h3>Display</h3>
            <div className="settings-row">
              <div className="settings-row-label">
                <span>Screen orientation</span>
                <span className="settings-row-hint">Lock to portrait or follow device rotation</span>
              </div>
              <ToggleGroup
                value={settings.orientation}
                options={[
                  { value: 'portrait', label: 'Portrait' },
                  { value: 'auto', label: 'Auto' },
                ]}
                onChange={v => update('orientation', v)}
              />
            </div>
          </div>

          <div className="settings-divider" />

          <div className="settings-section">
            <h3>Offline Maps</h3>
            <div className="settings-row">
              <div className="settings-row-label">
                <span>Download radius</span>
                <span className="settings-row-hint">
                  How many miles around each stop to download for offline use. Currently: {settings.offlineRadiusMi ?? 5} mi
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={settings.offlineRadiusMi ?? 5}
                onChange={e => update('offlineRadiusMi', Number(e.target.value))}
                style={{ width: '120px' }}
              />
            </div>
          </div>

          <div className="settings-divider" />

          <div className="settings-section">
            <h3>⛽ Fuel Cost Estimator</h3>
            <div className="settings-row">
              <div className="settings-row-label">
                <span>{settings.units === 'metric' ? 'Fuel efficiency (L/100 km)' : 'Fuel efficiency (MPG)'}</span>
                <span className="settings-row-hint">
                  Your vehicle's fuel efficiency. Currently: {settings.units === 'metric'
                    ? `${settings.fuelEfficiencyMpg ?? 25} L/100 km`
                    : `${settings.fuelEfficiencyMpg ?? 25} MPG`}
                </span>
              </div>
              <input
                type="number"
                min={1}
                max={settings.units === 'metric' ? 30 : 150}
                step={0.1}
                value={settings.fuelEfficiencyMpg ?? 25}
                onChange={e => update('fuelEfficiencyMpg', Number(e.target.value) || 25)}
                style={{ width: '80px' }}
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <span>{settings.units === 'metric' ? 'Fuel price (per liter)' : 'Fuel price (per gallon)'}</span>
                <span className="settings-row-hint">
                  Current fuel price — used to estimate trip fuel cost. Leave blank to skip cost estimate.
                </span>
              </div>
              <input
                type="number"
                min={0}
                max={20}
                step={0.01}
                placeholder={settings.units === 'metric' ? '$/L' : '$/gal'}
                value={settings.fuelPricePerGallon ?? ''}
                onChange={e => update('fuelPricePerGallon', e.target.value === '' ? null : Number(e.target.value))}
                style={{ width: '80px' }}
              />
            </div>
          </div>

          <div className="settings-divider" />

          <div className="settings-section">
            <h3>Notifications</h3>
            <div className="settings-row">
              <div className="settings-row-label">
                <span>Trip notifications</span>
                <span className="settings-row-hint">
                  {notifState === 'unsupported' && 'Push notifications are not supported in this browser.'}
                  {notifState === 'denied' && 'Notifications are blocked. Enable them in your browser settings.'}
                  {notifState === 'subscribed' && 'You will receive notifications when trip members add stops, ask AI, or update the trip.'}
                  {notifState === 'unsubscribed' && 'Enable to receive notifications when trip members make changes.'}
                </span>
              </div>
              {notifState !== 'unsupported' && notifState !== 'denied' && (
                <button
                  className={`btn-${notifState === 'subscribed' ? 'secondary' : 'primary'} btn-sm`}
                  onClick={handleNotifToggle}
                  disabled={notifLoading}
                >
                  {notifLoading ? '⏳…' : notifState === 'subscribed' ? 'Disable' : 'Enable'}
                </button>
              )}
            </div>
          </div>

          <div className="settings-divider" />

          <div className="settings-section">
            <h3>Trails</h3>
            <div className="settings-row">
              <div className="settings-row-label">
                <span>AllTrails integration</span>
                <span className="settings-row-hint">
                  AllTrails does not offer a public API. The app opens AllTrails in your
                  browser to search trails near any stop. You can paste AllTrails URLs
                  as references on any trip stop.
                </span>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <span>Hiking trail search</span>
                <span className="settings-row-hint">
                  Trails near stops are found via OpenStreetMap (Overpass API) — free,
                  no account required.
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
