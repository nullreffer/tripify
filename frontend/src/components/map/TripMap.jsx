import React, { useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { PIN_TYPES } from '../../constants/pinTypes.js';
import { getLocationGroupKey } from '../../constants/map.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Fix Leaflet default icon paths (broken in Vite builds)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makeStopIcon(stop, index, isNext, groupCount = 1) {
  const pt = PIN_TYPES[stop.pinType] || PIN_TYPES.GENERAL;
  const isSavedForLater = !!stop?.metadata?.savedForLater;
  const color = isSavedForLater
    ? '#a855f7'
    : stop.reached
      ? '#22c55e'
      : isNext
        ? '#f97316'
        : pt.color;
  const border = isNext ? '3px solid #fff' : '2px solid rgba(255,255,255,0.8)';
  const glow = isNext ? '0 0 0 3px #f97316' : '';
  const numberBadge = isSavedForLater ? '' : `
      <div style="
        position:absolute;top:-8px;right:-8px;
        background:#1e293b;color:#fff;
        border-radius:99px;padding:1px 5px;
        font-size:10px;font-weight:700;line-height:1.4;
        border:1.5px solid #fff;
      ">${index + 1}</div>`;
  const groupBadge = groupCount > 1 ? `
      <div style="
        position:absolute;bottom:-8px;left:-8px;
        background:#0f172a;color:#fff;
        border-radius:99px;padding:1px 5px;
        font-size:10px;font-weight:700;line-height:1.4;
        border:1.5px solid #fff;
      ">×${groupCount}</div>` : '';
  const html = `
    <div style="
      width:36px;height:36px;border-radius:50%;
      background:${color};border:${border};
      box-shadow:${glow ? glow + ',' : ''}0 2px 6px rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;
      font-size:16px;position:relative;cursor:pointer;
    ">
      ${isSavedForLater ? '🔖' : stop.reached ? '✓' : pt.emoji}
      ${numberBadge}
      ${groupBadge}
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

function makeWeatherIcon(emoji, tempLabel) {
  const html = `<div style="
    min-width:34px;height:34px;border-radius:17px;
    background:rgba(15,23,42,.9);color:#fff;
    border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);
    display:flex;align-items:center;justify-content:center;
    font-size:14px;padding:0 8px;gap:4px;
  "><span>${emoji}</span><span style="font-size:11px;font-weight:700;">${tempLabel || ''}</span></div>`;
  return L.divIcon({ html, className: '', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32] });
}

// Radius (meters) of each AQI color overlay circle when tile overlay is unavailable.
// Overridden at runtime by an adaptive value computed from the trip bounding box.
const AQI_OVERLAY_RADIUS_METERS_DEFAULT = 50000;

// ── AQI gradient helpers ──────────────────────────────────────────────────────
function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

const COORDINATE_EPSILON = 0.0001;       // precision for grouping grid lat/lng values
const DEFAULT_AQI_COLOR = [136, 136, 136]; // neutral gray for cells with no AQI data
const AQI_CANVAS_WIDTH = 512;
const AQI_CANVAS_HEIGHT = 512;
const AQI_OVERLAY_ALPHA = 110;           // ~43% opacity (0–255)

// Render the AQI pin grid as a bilinearly-interpolated colour gradient on an
// off-screen canvas, then mount it as a Leaflet imageOverlay. The overlay is
// re-rendered whenever the map moves so it always covers the visible viewport.
function AqiGradientOverlay({ pins }) {
  const map = useMap();
  const layerRef = useRef(null);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  useEffect(() => {
    function doRender() {
      const currentPins = pinsRef.current;
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
      if (!currentPins.length) return;

      // Reconstruct grid from pin coordinates
      const uniqueLats = [...new Set(currentPins.map(p => Math.round(p.lat / COORDINATE_EPSILON) * COORDINATE_EPSILON))].sort((a, b) => a - b);
      const uniqueLngs = [...new Set(currentPins.map(p => Math.round(p.lng / COORDINATE_EPSILON) * COORDINATE_EPSILON))].sort((a, b) => a - b);
      const rows = uniqueLats.length;
      const cols = uniqueLngs.length;
      if (rows < 2 || cols < 2) return;

      // Build color grid [row][col] → [r, g, b], row 0 = minLat
      const colorGrid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => DEFAULT_AQI_COLOR));
      currentPins.forEach(pin => {
        const row = uniqueLats.findIndex(v => Math.abs(v - pin.lat) < COORDINATE_EPSILON * 2);
        const col = uniqueLngs.findIndex(v => Math.abs(v - pin.lng) < COORDINATE_EPSILON * 2);
        if (row !== -1 && col !== -1 && pin.level?.color) {
          colorGrid[row][col] = hexToRgb(pin.level.color);
        }
      });

      const dataMinLat = uniqueLats[0], dataMaxLat = uniqueLats[rows - 1];
      const dataMinLng = uniqueLngs[0], dataMaxLng = uniqueLngs[cols - 1];

      // Expand bounds to current viewport so the overlay always fills the view.
      // Areas outside the data sample range are filled by extending the nearest
      // edge color, keeping the overlay seamless as the user pans.
      const vb = map.getBounds().pad(0.3);
      const minLat = Math.min(dataMinLat, vb.getSouth());
      const maxLat = Math.max(dataMaxLat, vb.getNorth());
      const minLng = Math.min(dataMinLng, vb.getWest());
      const maxLng = Math.max(dataMaxLng, vb.getEast());

      // Render gradient on a canvas using bilinear interpolation.
      // Coordinates outside the data grid are clamped to the nearest edge.
      const canvas = document.createElement('canvas');
      canvas.width = AQI_CANVAS_WIDTH; canvas.height = AQI_CANVAS_HEIGHT;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(AQI_CANVAS_WIDTH, AQI_CANVAS_HEIGHT);
      const d = imageData.data;

      for (let py = 0; py < AQI_CANVAS_HEIGHT; py++) {
        // Canvas y=0 is north (maxLat), y=H-1 is south (minLat)
        const lat = maxLat - (maxLat - minLat) * (py / (AQI_CANVAS_HEIGHT - 1));
        const clampedLat = Math.max(dataMinLat, Math.min(dataMaxLat, lat));
        const rowF = ((clampedLat - dataMinLat) / (dataMaxLat - dataMinLat)) * (rows - 1);
        const row0 = Math.max(0, Math.min(rows - 2, Math.floor(rowF)));
        const ty = rowF - row0;

        for (let px = 0; px < AQI_CANVAS_WIDTH; px++) {
          const lng = minLng + (maxLng - minLng) * (px / (AQI_CANVAS_WIDTH - 1));
          const clampedLng = Math.max(dataMinLng, Math.min(dataMaxLng, lng));
          const colF = ((clampedLng - dataMinLng) / (dataMaxLng - dataMinLng)) * (cols - 1);
          const col0 = Math.max(0, Math.min(cols - 2, Math.floor(colF)));
          const tx = colF - col0;

          // Bilinear interpolation between the four surrounding grid cells
          const bl = colorGrid[row0][col0];
          const br = colorGrid[row0][col0 + 1];
          const tl = colorGrid[row0 + 1][col0];
          const tr = colorGrid[row0 + 1][col0 + 1];
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;

          const i = (py * AQI_CANVAS_WIDTH + px) * 4;
          d[i]     = Math.round(bl[0] * w00 + br[0] * w10 + tl[0] * w01 + tr[0] * w11);
          d[i + 1] = Math.round(bl[1] * w00 + br[1] * w10 + tl[1] * w01 + tr[1] * w11);
          d[i + 2] = Math.round(bl[2] * w00 + br[2] * w10 + tl[2] * w01 + tr[2] * w11);
          d[i + 3] = AQI_OVERLAY_ALPHA;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      const bounds = L.latLngBounds([[minLat, minLng], [maxLat, maxLng]]);
      const overlay = L.imageOverlay(canvas.toDataURL(), bounds, { opacity: 1, interactive: false });
      overlay.addTo(map);
      layerRef.current = overlay;
    }

    doRender();
    map.on('moveend', doRender);
    map.on('zoomend', doRender);

    return () => {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
      map.off('moveend', doRender);
      map.off('zoomend', doRender);
    };
  }, [pins, map]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

// Exposes imperative map control methods to parent via ref
// Approximate meters per degree of latitude at mid-latitudes
const METERS_PER_DEGREE = 111_000;

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
      const firstPinDistance = map.distance(center, [firstPin.lat, firstPin.lng]);
      const nearest = pins.reduce((best, pin) => {
        const distance = map.distance(center, [pin.lat, pin.lng]);
        return distance < best.distance ? { pin, distance } : best;
      }, { pin: firstPin, distance: firstPinDistance });

      // Cap zoom-out to a ~500 mile radius from the current center
      const MAX_RADIUS_METERS = 800_000; // ~500 miles
      if (nearest.distance > MAX_RADIUS_METERS) {
        // Just show the ~500mi boundary — don't fly across the country
        const deg = MAX_RADIUS_METERS / METERS_PER_DEGREE;
        map.fitBounds(
          [[center.lat - deg, center.lng - deg * 1.4], [center.lat + deg, center.lng + deg * 1.4]],
          { padding: [60, 60], maxZoom: 7, animate: true }
        );
        return;
      }

      const nextBounds = L.latLngBounds(
        [center.lat, center.lng],
        [nearest.pin.lat, nearest.pin.lng]
      );
      map.fitBounds(nextBounds, {
        padding: [60, 60],
        maxZoom: 13,
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
    getZoom() { return map.getZoom(); },
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

function MapTapHandler({ onMapTap }) {
  useMapEvents({
    click(e) {
      const target = e.originalEvent?.target;
      const clickedMarker = target?.closest?.('.leaflet-marker-icon, .leaflet-marker-shadow');
      if (clickedMarker) return;
      onMapTap?.(e.latlng);
    },
  });
  return null;
}

function RouteLayer({ route, completedFraction = 0 }) {
  if (!route?.geometry) return null;
  const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const splitAt = Math.floor(coords.length * Math.max(0, Math.min(1, completedFraction)));
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
    searchPins = [], onSearchPinSelect, searchSelectedId, mapLayer = 'normal',
    weatherPins = [], completedFraction = 0, onMapTap,
    hideStopPins = false, onWeatherPinClick,
    offlinePins = [], offlineRadiusMeters = 8047,
    aqiPins = [], onAqiPinClick, aqiTilesAvailable = false,
    aqiOverlayRadiusMeters = AQI_OVERLAY_RADIUS_METERS_DEFAULT },
  mapRef
) {
  const nextStop = stops.find(s => !s.reached);
  const groupedStops = useMemo(() => {
    const groups = new Map();
    stops.forEach((stop, idx) => {
      const key = getLocationGroupKey(stop.lat, stop.lng);
      if (!groups.has(key)) groups.set(key, { stops: [], indices: [] });
      groups.get(key).stops.push(stop);
      groups.get(key).indices.push(idx);
    });
    return [...groups.values()].map(group => {
      const representative = group.stops.find(s => !s.reached) || group.stops[0];
      const representativeIdx = group.indices[group.stops.indexOf(representative)] ?? group.indices[0] ?? 0;
      const isNext = group.stops.some(s => s.id === nextStop?.id);
      return { representative, representativeIdx, isNext, count: group.stops.length };
    });
  }, [stops, nextStop?.id]);

  const isAqiLayer = mapLayer === 'aqi';
  // When AQI tiles are configured, use the proxy URL; otherwise fall back to AQI pins only
  const aqiTileUrl = aqiTilesAvailable
    ? `${API_BASE}/api/aqi/tile/{z}/{x}/{y}`
    : null;

  const tileLayerByMode = {
    normal: darkMode
      ? {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      }
      : {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      // Label overlay so city/street names appear on top of satellite imagery
      labelOverlay: {
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      },
    },
    trails: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    },
  };
  // AQI uses the normal base map + an overlay tile layer
  const layer = isAqiLayer
    ? (tileLayerByMode.normal)
    : (tileLayerByMode[mapLayer] || tileLayerByMode.normal);

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
        <TileLayer url={layer.url} attribution={layer.attribution} />
        {layer.labelOverlay && (
          <TileLayer url={layer.labelOverlay.url} attribution={layer.labelOverlay.attribution} />
        )}
        {/* AQI semi-transparent overlay tile layer */}
        {isAqiLayer && aqiTileUrl && (
          <TileLayer
            url={`${aqiTileUrl}`}
            attribution='AQI data &copy; <a href="https://waqi.info">WAQI</a>'
            opacity={0.7}
          />
        )}
        <RouteLayer route={route} completedFraction={completedFraction} />
        <MapInitialFit stops={stops} userLocation={userLocation} />
        <LongPressHandler onLongPress={onLongPress} />
        <MapTapHandler onMapTap={onMapTap} />
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
          {!hideStopPins && groupedStops.map(({ representative, representativeIdx, isNext, count }) => (
            <Marker
              key={representative.id}
              position={[representative.lat, representative.lng]}
              icon={makeStopIcon(representative, representativeIdx, isNext, count)}
              eventHandlers={{ click: () => onStopSelect(representative) }}
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

        {weatherPins.map(pin => (
          <Marker
            key={`weather-${pin.id}`}
            position={[pin.lat, pin.lng]}
            icon={makeWeatherIcon(pin.emoji, pin.tempLabel)}
            eventHandlers={onWeatherPinClick ? { click: () => onWeatherPinClick(pin) } : {}}
          />
        ))}

        {/* Offline downloaded area circles */}
        {offlinePins.map(pin => (
          <Circle
            key={`offline-${pin.id}`}
            center={[pin.lat, pin.lng]}
            radius={offlineRadiusMeters}
            pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.15, weight: 2 }}
          />
        ))}

        {/* AQI gradient overlay (when tile overlay is unavailable) */}
        {isAqiLayer && !aqiTilesAvailable && (
          <AqiGradientOverlay pins={aqiPins} />
        )}
      </MapContainer>

      {/* AQI legend */}
      {isAqiLayer && (
        <div style={{
          position: 'absolute', bottom: '80px', left: '10px', zIndex: 1000,
          background: 'rgba(15,23,42,0.9)', borderRadius: '10px', padding: '8px 12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)', fontSize: '11px', color: '#fff',
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>🌫 Air Quality Index</div>
          <div style={{
            height: 10, borderRadius: 5,
            background: 'linear-gradient(to right, #00e400, #ffff00, #ff7e00, #ff0000, #8f3f97, #7e0023)',
            marginBottom: 4, border: '1px solid rgba(255,255,255,0.2)',
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', opacity: 0.8 }}>
            <span>Good</span>
            <span>Moderate</span>
            <span>Unhealthy</span>
            <span>Hazardous</span>
          </div>
        </div>
      )}
    </div>
  );
});

export default TripMap;
