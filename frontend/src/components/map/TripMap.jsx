import React, { useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { PIN_TYPES } from '../../constants/pinTypes.js';

// Fix Leaflet default icon paths (broken in Vite builds)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makeStopIcon(stop, index, isNext) {
  const pt = PIN_TYPES[stop.pinType] || PIN_TYPES.GENERAL;
  const color = stop.reached ? '#22c55e' : isNext ? '#f97316' : pt.color;
  const border = isNext ? '3px solid #fff' : '2px solid rgba(255,255,255,0.8)';
  const shadow = isNext ? '0 0 0 3px #f97316' : 'none';
  const html = `
    <div style="
      width:36px;height:36px;border-radius:50%;
      background:${color};border:${border};
      box-shadow:var(--marker-shadow,${shadow}),0 2px 6px rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;
      font-size:16px;position:relative;cursor:pointer;
    ">
      ${stop.reached ? '✓' : pt.emoji}
      <div style="
        position:absolute;top:-8px;right:-8px;
        background:#1e293b;color:#fff;
        border-radius:99px;padding:1px 5px;
        font-size:10px;font-weight:700;line-height:1.4;
        border:1.5px solid #fff;
      ">${index + 1}</div>
    </div>`;
  return L.divIcon({ html, className: '', iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -38] });
}

function makeLocationIcon() {
  const html = `<div style="
    width:18px;height:18px;border-radius:50%;background:#3b82f6;
    border:3px solid #fff;box-shadow:0 0 0 2px #3b82f6,0 2px 6px rgba(0,0,0,.3);
  "></div>`;
  return L.divIcon({ html, className: '', iconSize: [18, 18], iconAnchor: [9, 9] });
}

function MapController({ stops, route, userLocation, fitOnMount }) {
  const map = useMap();

  useEffect(() => {
    if (!fitOnMount) return;
    if (stops.length > 0) {
      const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    } else if (userLocation) {
      map.setView(userLocation, 13);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function LongPressHandler({ onLongPress }) {
  const longPressTimer = useRef(null);

  useMapEvents({
    mousedown(e) {
      longPressTimer.current = setTimeout(() => {
        onLongPress(e.latlng);
      }, 600);
    },
    mouseup() { clearTimeout(longPressTimer.current); },
    mousemove() { clearTimeout(longPressTimer.current); },
    touchstart(e) {
      const touch = e.originalEvent.touches[0];
      longPressTimer.current = setTimeout(() => {
        const latlng = e.target._map.containerPointToLatLng(
          L.point(touch.clientX - e.target._map.getContainer().getBoundingClientRect().left,
                  touch.clientY - e.target._map.getContainer().getBoundingClientRect().top)
        );
        onLongPress(latlng);
      }, 600);
    },
    touchend() { clearTimeout(longPressTimer.current); },
    touchmove() { clearTimeout(longPressTimer.current); },
  });
  return null;
}

// Completed vs upcoming segments
function RouteLayer({ stops, route }) {
  if (!route || !route.geometry) return null;

  const completedStops = stops.filter(s => s.reached);
  const lastReachedIdx = stops.reduce((acc, s, i) => s.reached ? i : acc, -1);

  // Full route coordinates from OSRM
  const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

  // For simplicity: color the whole line orange, show completed portion in green
  // We approximate completed portion by reached stop positions
  return (
    <>
      <Polyline positions={coords} color="#f97316" weight={5} opacity={0.85} />
      {lastReachedIdx >= 0 && stops[lastReachedIdx] && (
        // Green overlay up to last reached stop (approximation)
        <Polyline
          positions={coords.slice(0, Math.floor(coords.length * (lastReachedIdx + 1) / stops.length))}
          color="#22c55e"
          weight={5}
          opacity={0.9}
        />
      )}
    </>
  );
}

export default function TripMap({
  stops = [],
  route,
  userLocation,
  selectedStop,
  onStopSelect,
  onLongPress,
  darkMode,
}) {
  const nextStop = stops.find(s => !s.reached);

  const lightTiles = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const darkTiles = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const tileUrl = darkMode ? darkTiles : lightTiles;
  const attribution = darkMode
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const defaultCenter = stops.length > 0
    ? [stops[0].lat, stops[0].lng]
    : userLocation || [39.5, -98.35]; // center of US

  return (
    <MapContainer
      center={defaultCenter}
      zoom={stops.length > 0 ? 6 : 4}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
    >
      <TileLayer url={tileUrl} attribution={attribution} />
      <RouteLayer stops={stops} route={route} />
      <MapController stops={stops} route={route} userLocation={userLocation} fitOnMount />
      <LongPressHandler onLongPress={onLongPress} />

      {userLocation && (
        <Marker position={userLocation} icon={makeLocationIcon()} />
      )}

      {stops.map((stop, idx) => (
        <Marker
          key={stop.id}
          position={[stop.lat, stop.lng]}
          icon={makeStopIcon(stop, idx, stop.id === nextStop?.id)}
          eventHandlers={{ click: () => onStopSelect(stop) }}
        />
      ))}
    </MapContainer>
  );
}
