import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { PIN_TYPES } from '../../constants/pinTypes.js';

// Pans the map to new center whenever the lat/lng prop changes.
function PanTo({ lat, lng }) {
  const map = useMap();
  useMemo(() => {
    map.setView([lat, lng], 13, { animate: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);
  return null;
}

export default function MiniMap({ lat, lng, pinType }) {
  const pt = PIN_TYPES[pinType] || PIN_TYPES.GENERAL;

  const icon = useMemo(() => L.divIcon({
    html: `<div style="
      width:32px;height:32px;border-radius:50%;
      background:${pt.color};border:2px solid #fff;
      display:flex;align-items:center;justify-content:center;
      font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.35);
    ">${pt.emoji}</div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  }), [pt]);

  return (
    <MapContainer
      key={`${lat},${lng}`}
      center={[lat, lng]}
      zoom={13}
      style={{ height: '190px', borderRadius: '8px', zIndex: 1 }}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[lat, lng]} icon={icon} />
      <PanTo lat={lat} lng={lng} />
    </MapContainer>
  );
}
