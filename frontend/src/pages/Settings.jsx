import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar.jsx';
import { getSettings, saveSettings } from '../services/settings.js';

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

  const update = (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
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
