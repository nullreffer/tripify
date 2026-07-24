import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
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
  const glow = isNext ? '0 0 0 3px #f97316' : '';
  const html = `
    <div style="
      width:36px;height:36px;border-radius:50%;
      background:${color};border:${border};
      box-shadow:${glow ? glow + ',' : ''}0 2px 6px rgba(0,0,0,.35);
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

function makeSearchIcon(isSelected) {
  const bg = isSelected ? '#7c3aed' : '#3b82f6';
  const html = `<div style="
    width:30px;height:30px;border-radius:50%;
    background:${bg};border:3px solid #fff;
    box-shadow:0 2px 8px rgba(0,0,0,.4);
    display:flex;align-items:center;justify-content:center;
    font-size:13px;cursor:pointer;
  ">🔍</div>`;
  return L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -32] });
}

// Exposes imperative map control methods to parent via ref
const MapRefCapture = forwardRef(function MapRefCapture({ stops }, ref) {
  const map = useMap();
  useImperativeHandle(ref, () => ({
    flyToLocation(lat, lng, zoom = 15) {
      map.flyTo([lat, lng], zoom, { animate: true, duration: 0.8 });
    },
    ensureSearchResultVisible(pins = []) {
      if (!pins.length) return;
      const bounds = map.getBounds();
      const anyVisible = pins.some(pin => bounds.contains([pin.lat, pin.lng]));
      if (anyVisible) return;

      const center = map.getCenter();
      const firstPin = pins[0];
      const nearest = pins.reduce((best, pin) => {
        const distance = map.distance(center, [pin.lat, pin.lng]);
        return distance < best.distance ? { pin, distance } : best;
      }, { pin: firstPin, distance: map.distance(center, [firstPin.lat, firstPin.lng]) }).pin;

      const nextBounds = L.latLngBounds(
        [center.lat, center.lng],
        [nearest.lat, nearest.lng]
      );
      map.fitBounds(nextBounds, {
        padding: [60, 60],
        maxZoom: Math.min(map.getZoom(), 13),
        animate: true,
      });
    },
    fitTrip() {
      if (stops.length === 0) return;
      if (stops.length === 1) {
        map.flyTo([stops[0].lat, stops[0].lng], 13);
        return;
      }
      const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14, animate: true });
    },
    getCenter() { return map.getCenter(); },
    getBounds() { return map.getBounds(); },
  }), [map, stops]);
  return null;
});

function MapInitialFit({ stops, userLocation }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    if (stops.length > 1) {
      const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    } else if (stops.length === 1) {
      map.setView([stops[0].lat, stops[0].lng], 13);
    } else if (userLocation) {
      map.setView(userLocation, 13);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function LongPressHandler({ onLongPress }) {
  const timer = useRef(null);
  useMapEvents({
    mousedown(e) { timer.current = setTimeout(() => onLongPress(e.latlng), 600); },
    mouseup()   { clearTimeout(timer.current); },
    mousemove() { clearTimeout(timer.current); },
    touchstart(e) {
      const t = e.originalEvent.touches[0];
      const rect = e.target._map.getContainer().getBoundingClientRect();
      timer.current = setTimeout(() => {
        const latlng = e.target._map.containerPointToLatLng(
          L.point(t.clientX - rect.left, t.clientY - rect.top)
        );
        onLongPress(latlng);
      }, 600);
    },
    touchend()  { clearTimeout(timer.current); },
    touchmove() { clearTimeout(timer.current); },
  });
  return null;
}

function RouteLayer({ stops, route }) {
  if (!route?.geometry) return null;
  const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const lastReachedIdx = stops.reduce((acc, s, i) => s.reached ? i : acc, -1);
  const splitAt = lastReachedIdx >= 0
    ? Math.floor(coords.length * (lastReachedIdx + 1) / stops.length)
    : 0;
  return (
    <>
      <Polyline positions={coords} color="#f97316" weight={5} opacity={0.8} />
      {splitAt > 0 && (
        <Polyline positions={coords.slice(0, splitAt)} color="#22c55e" weight={5} opacity={0.9} />
      )}
    </>
  );
}

const TripMap = forwardRef(function TripMap(
  { stops = [], route, userLocation, onStopSelect, onLongPress, darkMode,
    searchPins = [], onSearchPinSelect, searchSelectedId },
  mapRef
) {
  const nextStop = stops.find(s => !s.reached);
  const tileUrl = darkMode
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attribution = darkMode
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const defaultCenter = stops.length > 0
    ? [stops[0].lat, stops[0].lng]
    : userLocation || [39.5, -98.35];

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapContainer
        center={defaultCenter}
        zoom={stops.length > 0 ? 6 : 4}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer url={tileUrl} attribution={attribution} />
        <RouteLayer stops={stops} route={route} />
        <MapInitialFit stops={stops} userLocation={userLocation} />
        <LongPressHandler onLongPress={onLongPress} />
        <MapRefCapture ref={mapRef} stops={stops} />

        {userLocation && (
          <Marker position={userLocation} icon={makeLocationIcon()} />
        )}

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={60}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          iconCreateFunction={cluster => {
            const count = cluster.getChildCount();
            return L.divIcon({
              html: `<div style="
                width:40px;height:40px;border-radius:50%;
                background:#f97316;color:#fff;font-weight:700;font-size:14px;
                display:flex;align-items:center;justify-content:center;
                border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);
              ">${count}</div>`,
              className: '',
              iconSize: [40, 40],
              iconAnchor: [20, 40],
            });
          }}
        >
          {stops.map((stop, idx) => (
            <Marker
              key={stop.id}
              position={[stop.lat, stop.lng]}
              icon={makeStopIcon(stop, idx, stop.id === nextStop?.id)}
              eventHandlers={{ click: () => onStopSelect(stop) }}
            />
          ))}
        </MarkerClusterGroup>

        {/* Search result pins — rendered outside cluster group so they're visually distinct */}
        {searchPins.map(pin => (
          <Marker
            key={`search-${pin.id}`}
            position={[pin.lat, pin.lng]}
            icon={makeSearchIcon(pin.id === searchSelectedId)}
            eventHandlers={{ click: () => onSearchPinSelect?.(pin) }}
          />
        ))}
      </MapContainer>
    </div>
  );
});

export default TripMap;
