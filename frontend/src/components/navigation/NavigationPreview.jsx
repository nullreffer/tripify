import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';
import { getNavigationRoute, formatDistance, formatDuration } from '../../services/routing.js';

const STADIA_API_KEY = import.meta.env.VITE_STADIA_API_KEY || '';
const stadiaUrl = (path) => STADIA_API_KEY ? `${path}?api_key=${STADIA_API_KEY}` : path;

function makeSimpleIcon(color = '#3b82f6', emoji = '📍') {
  const html = `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:14px;">${emoji}</div>`;
  return L.divIcon({ html, className: '', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34] });
}

/**
 * NavigationPreview — shows route on map with turn-by-turn steps list
 * and a "Start Navigation" button.
 *
 * Props:
 *   origin       — { lat, lng, name }
 *   destination  — { lat, lng, name }
 *   mapLayer     — string (tile style)
 *   units        — 'imperial' | 'metric'
 *   onStart      — () => void — user pressed Start Navigation
 *   onClose      — () => void
 */
export default function NavigationPreview({ origin, destination, mapLayer = 'normal', units = 'imperial', onStart, onClose }) {
  const [navRoute, setNavRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!origin || !destination) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    getNavigationRoute(origin, destination)
      .then(r => {
        if (!r) setError('Could not calculate route.');
        else setNavRoute(r);
        setLoading(false);
      })
      .catch(() => { setError('Routing error.'); setLoading(false); });
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const tileUrl = (() => {
    if (mapLayer === 'dark') return stadiaUrl('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png');
    return stadiaUrl('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png');
  })();

  const routeCoords = navRoute?.geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) || [];
  const center = origin ? [origin.lat, origin.lng] : [37.7749, -122.4194];

  return (
    <div className="navpreview-overlay" onClick={onClose}>
      <div className="navpreview-sheet" onClick={e => e.stopPropagation()}>
        <div className="navpreview-handle" />

        <div className="navpreview-header">
          <div className="navpreview-title-col">
            <div className="navpreview-dest">{destination?.name}</div>
            {navRoute && (
              <div className="navpreview-meta">
                {formatDistance(navRoute.distance, units)} · {formatDuration(navRoute.duration)}
              </div>
            )}
          </div>
          <button className="navpreview-close" onClick={onClose}>×</button>
        </div>

        {/* Map preview */}
        <div className="navpreview-map-wrap">
          {loading ? (
            <div className="navpreview-map-loading"><div className="spinner" /></div>
          ) : error ? (
            <div className="navpreview-map-loading">{error}</div>
          ) : (
            <MapContainer
              center={center}
              zoom={11}
              style={{ width: '100%', height: '100%' }}
              zoomControl={false}
              attributionControl={false}
            >
              <TileLayer url={tileUrl} />
              {routeCoords.length > 1 && (
                <Polyline positions={routeCoords} color="#3b82f6" weight={5} opacity={0.85} />
              )}
              {origin && <Marker position={[origin.lat, origin.lng]} icon={makeSimpleIcon('#22c55e', '📍')} />}
              {destination && <Marker position={[destination.lat, destination.lng]} icon={makeSimpleIcon('#ef4444', '🏁')} />}
            </MapContainer>
          )}
        </div>

        {/* Steps list */}
        {navRoute?.steps?.length > 0 && (
          <div className="navpreview-steps">
            {navRoute.steps.slice(0, 8).map((step, i) => (
              <div key={i} className="navpreview-step">
                <span className="navpreview-step-icon">{stepIcon(step.type, step.modifier)}</span>
                <span className="navpreview-step-text">{step.instruction}</span>
                <span className="navpreview-step-dist">{formatDistance(step.distance, units)}</span>
              </div>
            ))}
            {navRoute.steps.length > 8 && (
              <div className="navpreview-step navpreview-step-more">+{navRoute.steps.length - 8} more steps</div>
            )}
          </div>
        )}

        <div className="navpreview-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={onStart} disabled={!navRoute}>
            ▶ Start Navigation
          </button>
        </div>
      </div>
    </div>
  );
}

function stepIcon(type, modifier) {
  if (type === 'arrive') return '🏁';
  if (type === 'depart') return '🚦';
  if (type === 'roundabout' || type === 'rotary') return '🔄';
  if (modifier === 'left' || modifier === 'sharp left') return '↰';
  if (modifier === 'right' || modifier === 'sharp right') return '↱';
  if (modifier === 'slight left') return '↙';
  if (modifier === 'slight right') return '↘';
  if (modifier === 'uturn') return '↩';
  return '↑';
}
