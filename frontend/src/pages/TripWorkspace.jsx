import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrip } from '../hooks/useTrip.js';
import { getRoute, formatDistance, formatDuration } from '../services/routing.js';
import { getSettings, useSettingsListener } from '../services/settings.js';
import { searchNearby } from '../services/geocoding.js';
import { getWeather, buildCurrentWeather, buildScheduledDayWeather } from '../services/weather.js';
import { getAqiStatus, getAqiForStop, aqiMeta, getActiveFires } from '../services/aqi.js';
import TripMap from '../components/map/TripMap.jsx';
import StopList from '../components/stops/StopList.jsx';
import StopSheet from '../components/stops/StopSheet.jsx';
import SearchSheet from '../components/stops/SearchSheet.jsx';
import ItemsView from '../components/items/ItemsView.jsx';
import AiView from '../components/ai/AiView.jsx';
import MoreView from '../components/more/MoreView.jsx';
import DaysView from '../components/days/DaysView.jsx';
import TodayView from '../components/days/TodayView.jsx';
import GalleryView from '../components/gallery/GalleryView.jsx';
import { PIN_TYPES } from '../constants/pinTypes.js';

const TABS = [
  { key: 'map',   label: 'Map',   icon: '🗺️' },
  { key: 'stops', label: 'Stops', icon: '📍' },
  { key: 'days',  label: 'Days',  icon: '📅' },
  { key: 'items', label: 'Items', icon: '✅' },
  { key: 'ai',    label: 'AI',    icon: '✨' },
  { key: 'more',  label: 'More',  icon: '⋯' },
];

const MAP_CONTROLS_BOTTOM = '12px';
const MAP_CONTROLS_BOTTOM_WITH_NEXT_STOP = '160px';
const ALLTRAILS_MIN_ZOOM = 2;
const ALLTRAILS_MAX_ZOOM = 18;
const OFFLINE_CACHE_NAME = 'tripify-tiles-v1';
const STADIA_API_KEY = import.meta.env.VITE_STADIA_API_KEY || '';
const stadiaOfflineUrl = (path) => STADIA_API_KEY ? `${path}?api_key=${STADIA_API_KEY}` : path;
// Fire Radiative Power (FRP) thresholds in MW used by the intensity filter
const FIRE_FRP_MODERATE = 10;
const FIRE_FRP_HIGH = 50;
const FIRE_FRP_EXTREME = 100;
const MI_TO_KM = 1.60934;
const MI_TO_METERS = 1609.34;
// Earth's equatorial circumference in km (used for tile-size estimation)
const EARTH_CIRCUMFERENCE_KM = 40075.016;
const MAP_LAYER_OPTIONS = [
  ['normal', '🗺️ Normal'],
  ['satellite', '🛰️ Satellite'],
  ['trails', '🥾 Trails'],
  ['weather-current', '🌤️ Current weather'],
  ['weather-scheduled', '🗓️ Scheduled-day weather'],
  ['aqi', '🌫️ Air Quality'],
  ['offline', '📵 Offline areas'],
];

function resolveMapStyle(setting) {
  if (setting === 'light') return false;
  if (setting === 'dark')  return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Build a 5×5 grid of lat/lng sample points covering the bounding box of all stops.
// Returns the grid points and an adaptive circle radius that ensures the circles
// from adjacent grid points overlap, saturating the whole map with AQI colour.
const AQI_GRID_ROWS = 5;
const AQI_GRID_COLS = 5;
function generateAqiGrid(stops) {
  if (!stops.length) return { points: [], radiusMeters: 50000 };
  const lats = stops.map(s => s.lat);
  const lngs = stops.map(s => s.lng);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  // Ensure a minimum bounding-box span so single-stop trips get reasonable coverage
  const MIN_SPAN = 0.5; // degrees
  if (maxLat - minLat < MIN_SPAN) { const m = (minLat + maxLat) / 2; minLat = m - MIN_SPAN / 2; maxLat = m + MIN_SPAN / 2; }
  if (maxLng - minLng < MIN_SPAN) { const m = (minLng + maxLng) / 2; minLng = m - MIN_SPAN / 2; maxLng = m + MIN_SPAN / 2; }
  // Pad the bounding box by 15% on each side
  const latPad = (maxLat - minLat) * 0.15;
  const lngPad = (maxLng - minLng) * 0.15;
  const lat0 = Math.max(-85, minLat - latPad);
  const lat1 = Math.min(85, maxLat + latPad);
  const lng0 = minLng - lngPad;
  const lng1 = maxLng + lngPad;
  // Radius large enough that adjacent circle edges overlap (80% of cell spacing)
  const midLat = (lat0 + lat1) / 2;
  const cellLatM = ((lat1 - lat0) / (AQI_GRID_ROWS - 1)) * 111320;
  const cellLngM = ((lng1 - lng0) / (AQI_GRID_COLS - 1)) * 111320 * Math.cos(midLat * Math.PI / 180);
  const radiusMeters = Math.ceil(Math.max(cellLatM, cellLngM) * 0.8);
  const points = [];
  for (let r = 0; r < AQI_GRID_ROWS; r++) {
    for (let c = 0; c < AQI_GRID_COLS; c++) {
      const lat = lat0 + (lat1 - lat0) * (r / (AQI_GRID_ROWS - 1));
      const lng = lng0 + (lng1 - lng0) * (c / (AQI_GRID_COLS - 1));
      points.push({ id: `aqigrid-${r}-${c}`, lat, lng });
    }
  }
  return { points, radiusMeters };
}

export default function TripWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tripData = useTrip(id);
  const { trip, stops, categories, references, days, reservations, loading, error, saveState, isOffline } = tripData;

  const mapRef = useRef(null);
  const [activeTab, setActiveTab] = useState('map');
  const [activeSubTab, setActiveSubTab] = useState('itinerary');
  const [selectedStop, setSelectedStop] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [route, setRoute] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [settings, setSettings] = useState(getSettings());
  const [darkMode, setDarkMode] = useState(() => resolveMapStyle(getSettings().mapStyle));

  // Stop type filter — shared between list and map views
  const [stopTypeFilter, setStopTypeFilter] = useState(null);
  // Stops sub-tab: 'route' | 'saved'
  const [stopsTab, setStopsTab] = useState('route');

  // Map area search mode
  const [mapSearchMode, setMapSearchMode] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState([]);
  const [mapSearching, setMapSearching] = useState(false);
  const [selectedSearchPin, setSelectedSearchPin] = useState(null);
  const [showMapFilters, setShowMapFilters] = useState(false);
  const [showMapLayers, setShowMapLayers] = useState(false);
  const [mapLayer, setMapLayer] = useState('normal');
  const [weatherByStopId, setWeatherByStopId] = useState({});
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [mapWeatherModal, setMapWeatherModal] = useState(null);
  const [offlinePreparing, setOfflinePreparing] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState('');
  const [aiPromptRequest, setAiPromptRequest] = useState(null);
  const [aqiGridData, setAqiGridData] = useState({});       // gridPointId → {aqi, pm2_5, pm10, lat, lng}
  const [aqiGridRadiusMeters, setAqiGridRadiusMeters] = useState(50000);
  const [aqiTilesAvailable, setAqiTilesAvailable] = useState(false);
  const [aqiLoading, setAqiLoading] = useState(false);
  const [mapAqiModal, setMapAqiModal] = useState(null);
  const [mapFireModal, setMapFireModal] = useState(null);
  const [fireData, setFireData] = useState([]);
  const [fireIntensityMin, setFireIntensityMin] = useState(0); // min FRP (MW) to show; 0 = all
  const mapSearchDebounce = useRef(null);

  // Attractions (POI) pins loaded from Overpass API on map pan/zoom
  const [attractionPins, setAttractionPins] = useState([]);
  const [selectedAttraction, setSelectedAttraction] = useState(null);
  const attractionDebounce = useRef(null);

  // Photo prompt after reaching a stop
  const [photoPromptStop, setPhotoPromptStop] = useState(null);
  const photoFileRef = useRef(null);

  // Listen for settings changes
  useEffect(() => {
    const off = useSettingsListener(s => {
      setSettings(s);
      setDarkMode(resolveMapStyle(s.mapStyle));
    });
    return off;
  }, []);

  // ── Android / browser back button handling ──────────────────────────────
  // Push a synthetic history entry whenever we open a modal or switch away
  // from the map tab, so the back button pops that entry first.
  useEffect(() => {
    if (selectedStop || mapWeatherModal) {
      window.history.pushState({ tripifyModal: true }, '');
    }
  }, [selectedStop, mapWeatherModal]);

  useEffect(() => {
    if (activeTab !== 'map') {
      window.history.pushState({ tripifyTab: true }, '');
    }
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = () => {
      if (selectedStop) {
        setSelectedStop(null);
        return;
      }
      if (mapWeatherModal) {
        setMapWeatherModal(null);
        return;
      }
      if (activeTab !== 'map') {
        // Switch to map — the push for the non-map tab was already consumed by
        // this popstate, so no re-push needed. The next back will exit the page.
        setActiveTab('map');
        return;
      }
      // No dialogs or non-map tab open — let the browser navigate back
      navigate(-1);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedStop, mapWeatherModal, activeTab, navigate]);

  // System dark mode changes (only when setting = 'auto')
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (getSettings().mapStyle === 'auto') setDarkMode(mq.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Geolocation — one-time fix + continuous watch
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const opts = { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 };
    navigator.geolocation.getCurrentPosition(
      pos => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      opts
    );
  }, []);

  // Recalculate route whenever stops change
  const routeStops = useMemo(() => stops.filter(s => !s?.metadata?.savedForLater), [stops]);
  const savedStops = useMemo(() => stops.filter(s => s?.metadata?.savedForLater), [stops]);

  useEffect(() => {
    if (routeStops.length < 2) { setRoute(null); return; }
    getRoute(routeStops).then(setRoute);
  }, [routeStops]);

  // Auto-generate itinerary days from stops when days tab is first opened and no days exist
  const daysGenerated = useRef(false);
  useEffect(() => {
    if (activeTab !== 'days' || loading) return;
    if (days.length > 0 || stops.length === 0) return;
    if (daysGenerated.current) return;
    daysGenerated.current = true;

    // Find base date: use first stop with a targetDate, shifted to index 0; else use today at noon
    const firstDatedIdx = stops.findIndex(s => s.targetDate);
    let baseDate;
    if (firstDatedIdx >= 0) {
      const d = new Date(stops[firstDatedIdx].targetDate);
      d.setDate(d.getDate() - firstDatedIdx);
      baseDate = d;
    } else {
      baseDate = new Date();
      baseDate.setHours(12, 0, 0, 0);
    }

    // Create one TripDay per stop in order (sequential to preserve order, runs in background)
    (async () => {
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        await tripData.addDay({
          date: d.toISOString(),
          location: stop.name,
          title: null,
        });
      }
    })();
  }, [activeTab, days.length, stops, loading, tripData]);

  // ── Geographic progress ─────────────────────────────────────────────
  const reachedCount = routeStops.filter(s => s.reached).length;
  const lastReachedIdx = routeStops.reduce((acc, s, i) => s.reached ? i : acc, -1);
  // Leg i connects stop i -> stop i+1, so completed leg count equals lastReachedIdx.
  const completedLegCount = Math.max(0, lastReachedIdx);
  const completedDist = route?.legs
    ? route.legs.slice(0, completedLegCount).reduce((s, l) => s + (l.distance || 0), 0)
    : 0;
  const completedFraction = route?.distance > 0 ? completedDist / route.distance : 0;
  const remainingDist = route ? (route.distance || 0) - completedDist : 0;
  const units = settings.units;
  const availableStopTypes = [...new Set(stops.map(s => s?.metadata?.savedForLater ? '__saved__' : s.pinType).filter(Boolean))];

  useEffect(() => {
    let cancelled = false;
    if (routeStops.length === 0) {
      setWeatherByStopId({});
      return;
    }
    (async () => {
      setWeatherLoading(true);
      const entries = [];
      const BATCH_SIZE = 8;
      for (let i = 0; i < routeStops.length; i += BATCH_SIZE) {
        const batch = routeStops.slice(i, i + BATCH_SIZE);
        const batchEntries = await Promise.all(batch.map(async (stop) => {
          if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return [stop.id, null];
          try {
            const weather = await getWeather(stop.lat, stop.lng);
            return [stop.id, weather];
          } catch {
            return [stop.id, null];
          }
        }));
        entries.push(...batchEntries);
        if (i + BATCH_SIZE < routeStops.length) {
          // Small pause between batches to reduce upstream API throttling risk.
          await new Promise(resolve => setTimeout(resolve, 120));
        }
      }
      if (cancelled) return;
      setWeatherByStopId(Object.fromEntries(entries.filter(([, data]) => !!data)));
      setWeatherLoading(false);
    })();
    return () => { cancelled = true; };
  }, [routeStops]);

  // ── AQI data loading (only when aqi layer is active) ────────────────────────
  // Samples a 5×5 grid over the trip bounding box so the whole map is
  // covered by AQI colour circles, not just the individual stop locations.
  useEffect(() => {
    if (mapLayer !== 'aqi') return;
    let cancelled = false;

    // Check whether the server has a WAQI token configured for tile overlays
    getAqiStatus().then(s => {
      if (!cancelled) setAqiTilesAvailable(s.tilesAvailable);
    });

    // Fetch active fire data in parallel with AQI grid
    getActiveFires().then(fires => {
      if (!cancelled) setFireData(Array.isArray(fires) ? fires : []);
    });

    if (routeStops.length === 0) { setAqiGridData({}); return; }

    const { points, radiusMeters } = generateAqiGrid(routeStops);
    if (!cancelled) setAqiGridRadiusMeters(radiusMeters);

    (async () => {
      setAqiLoading(true);
      const entries = await Promise.all(points.map(async (pt) => {
        try {
          const data = await getAqiForStop(pt.lat, pt.lng);
          if (data?.aqi == null) return null;
          return [pt.id, { aqi: data.aqi, pm2_5: data.pm2_5, pm10: data.pm10, lat: pt.lat, lng: pt.lng }];
        } catch { return null; }
      }));
      if (cancelled) return;
      setAqiGridData(Object.fromEntries(entries.filter(Boolean)));
      setAqiLoading(false);
    })();
    return () => { cancelled = true; };
  }, [mapLayer, routeStops]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Map overlay handlers ─────────────────────────────────────────────
  const handleMyLocation = useCallback(() => {
    if (userLocation) {
      mapRef.current?.flyToLocation(...userLocation);
    } else {
      navigator.geolocation?.getCurrentPosition(pos => {
        const loc = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(loc);
        mapRef.current?.flyToLocation(...loc);
      });
    }
  }, [userLocation]);

  const handleFitTrip = useCallback(() => {
    mapRef.current?.fitTrip();
  }, []);

  const handleOpenStop = useCallback((stop, { searchNearby = false } = {}) => {
    setActiveTab('map');
    const pinTapZoom = getSettings().pinTapZoom ?? 15;
    mapRef.current?.flyToLocation(stop.lat, stop.lng, pinTapZoom);
    if (searchNearby) {
      setSelectedStop(null);
      setMapSearchMode(true);
      setMapSearchResults([]);
      setSelectedSearchPin(null);
      setMapSearchQuery('');
      return;
    }
    setSelectedStop(stop);
  }, []);

  const handleSearchArea = useCallback(() => {
    setActiveTab('map');
    setMapSearchMode(true);
    setMapSearchResults([]);
    setSelectedSearchPin(null);
    setMapSearchQuery('');
  }, []);

  const handleMapSearchQuery = useCallback((val) => {
    setMapSearchQuery(val);
    clearTimeout(mapSearchDebounce.current);
    if (val.length < 2) { setMapSearchResults([]); return; }
    mapSearchDebounce.current = setTimeout(async () => {
      setMapSearching(true);
      const mapCenter = mapRef.current?.getCenter();
      const center = mapCenter ? { lat: mapCenter.lat, lng: mapCenter.lng } : null;
      const radiusMeters = (getSettings().searchRadiusMi ?? 100) * MI_TO_METERS;
      const results = await searchNearby(val, center, radiusMeters, (partial) => {
        // Show OSM results immediately while Google Places is still loading
        setMapSearchResults(partial);
        mapRef.current?.ensureSearchResultVisible(partial);
      });
      setMapSearchResults(results);
      mapRef.current?.ensureSearchResultVisible(results);
      setMapSearching(false);
    }, 500);
  }, []);

  const exitMapSearch = useCallback(() => {
    setMapSearchMode(false);
    setMapSearchQuery('');
    setMapSearchResults([]);
    setSelectedSearchPin(null);
    clearTimeout(mapSearchDebounce.current);
  }, []);

  // Guess a pin type from Nominatim category/type
  function guessPinType(result) {
    const cat = result.category || '';
    const type = result.type || '';
    if (cat === 'amenity' && ['fuel', 'charging_station'].includes(type)) return 'GAS_STATION';
    if (cat === 'amenity' && ['charging_station'].includes(type)) return 'EV_CHARGER';
    if (cat === 'amenity' && ['restaurant', 'cafe', 'fast_food', 'bar', 'food_court', 'ice_cream'].includes(type)) return 'RESTAURANT';
    if (cat === 'tourism' && ['camp_site', 'caravan_site'].includes(type)) return 'CAMPGROUND';
    if (cat === 'tourism' && ['hotel', 'motel', 'hostel', 'guest_house', 'apartment', 'chalet'].includes(type)) return 'HOTEL';
    if (cat === 'tourism' || cat === 'leisure' || cat === 'natural') return 'ATTRACTION';
    if (cat === 'aeroway') return 'AIRPORT';
    if (cat === 'amenity' && type === 'parking') return 'PARKING';
    return 'GENERAL';
  }

  const handleAddSearchPin = useCallback(async (pin, mode = 'afterNearest') => {
    const saveForLater = !!pin?.saveForLater;
    const beforeAdd = [...routeStops]; // snapshot before adding
    const newStop = await tripData.addStop({
      name: pin.name,
      address: pin.displayName,
      lat: pin.lat,
      lng: pin.lng,
      pinType: guessPinType(pin),
      notes: '',
      metadata: saveForLater ? { savedForLater: true } : undefined,
    });
    if (!saveForLater && beforeAdd.length > 0 && newStop) {
      let insertAfterIdx;
      if (mode === 'next') {
        // Insert after the last reached stop; -1 means none reached, so insertAfterIdx + 1 = 0 (front of list)
        insertAfterIdx = beforeAdd.reduce((acc, s, i) => s.reached ? i : acc, -1);
      } else {
        const nearestIdx = beforeAdd.reduce((best, s, i) => {
          const d = Math.hypot(s.lat - pin.lat, s.lng - pin.lng);
          return d < best.d ? { i, d } : best;
        }, { i: 0, d: Infinity }).i;
        insertAfterIdx = mode === 'beforeNearest' ? nearestIdx - 1 : nearestIdx;
      }
      const newOrder = [
        ...beforeAdd.slice(0, insertAfterIdx + 1),
        newStop,
        ...beforeAdd.slice(insertAfterIdx + 1),
      ];
      await tripData.reorderStops([...newOrder, ...savedStops]);
    }
    exitMapSearch();
    setSelectedStop(newStop);
  }, [routeStops, savedStops, tripData, exitMapSearch]);

  const handleReorderRouteStops = useCallback(async (newRouteStops) => {
    await tripData.reorderStops([...newRouteStops, ...savedStops]);
  }, [tripData, savedStops]);

  const handleFindTrails = useCallback(() => {
    const center = mapRef.current?.getCenter();
    const zoom = mapRef.current?.getZoom();
    if (center) {
      window.open(
        `https://www.alltrails.com/explore?lat=${center.lat.toFixed(4)}&lng=${center.lng.toFixed(4)}${Number.isFinite(zoom) ? `&zoom=${Math.max(ALLTRAILS_MIN_ZOOM, Math.min(ALLTRAILS_MAX_ZOOM, Math.round(zoom)))}` : ''}`,
        '_blank', 'noopener'
      );
    } else {
      window.open('https://www.alltrails.com/explore', '_blank', 'noopener');
    }
  }, []);

  const handleLongPress = useCallback(async (latlng) => {
    const { reverseGeocode } = await import('../services/geocoding.js');
    const geo = await reverseGeocode(latlng.lat, latlng.lng);
    setShowSearch({ prefill: { lat: latlng.lat, lng: latlng.lng, name: geo?.name || 'New Stop', address: geo?.displayName } });
  }, []);

  const handleAddStop = useCallback(async (stopData) => {
    const beforeAdd = [...routeStops];
    const newStop = await tripData.addStop(stopData);
    setShowSearch(false);
    // Insert near the nearest existing route stop (same logic as map search pin)
    if (beforeAdd.length > 0 && newStop && !stopData.metadata?.savedForLater) {
      const nearestIdx = beforeAdd.reduce((best, s, i) => {
        const d = Math.hypot(s.lat - stopData.lat, s.lng - stopData.lng);
        return d < best.d ? { i, d } : best;
      }, { i: 0, d: Infinity }).i;
      const newOrder = [
        ...beforeAdd.slice(0, nearestIdx + 1),
        newStop,
        ...beforeAdd.slice(nearestIdx + 1),
      ];
      await tripData.reorderStops([...newOrder, ...savedStops]);
    }
  }, [tripData, routeStops, savedStops]);

  // Mark reached from any tab — set targetDate to now and shift subsequent stop dates
  const handleMarkReached = useCallback(async (stopId, reached = true) => {
    await tripData.markReached(stopId, reached);
    if (reached) {
      const now = new Date();
      const nowIso = now.toISOString();
      const arrivedStop = routeStops.find(s => s.id === stopId);

      // Set arrived pin's targetDate to now
      await tripData.updateStop(stopId, { targetDate: nowIso });

      // Shift subsequent unreached stops if there's a meaningful date offset
      if (arrivedStop?.targetDate) {
        const offsetMs = now.getTime() - new Date(arrivedStop.targetDate).getTime();
        if (Math.abs(offsetMs) > 60 * 60 * 1000) { // Only shift if offset > 1 hour
          const arrivedIdx = routeStops.findIndex(s => s.id === stopId);
          const subsequent = routeStops.slice(arrivedIdx + 1).filter(s => !s.reached && s.targetDate);
          for (const s of subsequent) {
            const newDate = new Date(new Date(s.targetDate).getTime() + offsetMs);
            await tripData.updateStop(s.id, { targetDate: newDate.toISOString() });
          }
        }
      }

      const stop = stops.find(s => s.id === stopId);
      if (stop) setPhotoPromptStop(stop);
    }
  }, [tripData, stops, routeStops]);

  // Move a saved-for-later stop into the main route, inserted after the nearest route stop
  const handleAddSavedToRoute = useCallback(async (stop) => {
    const updatedMetadata = { ...stop.metadata };
    delete updatedMetadata.savedForLater;
    await tripData.updateStop(stop.id, { metadata: updatedMetadata });
    // After updating metadata, reorder: insert after nearest route stop
    const newRouteStops = [...routeStops, { ...stop, metadata: updatedMetadata }];
    if (routeStops.length > 0) {
      const nearestIdx = routeStops.reduce((best, s, i) => {
        const d = Math.hypot(s.lat - stop.lat, s.lng - stop.lng);
        return d < best.d ? { i, d } : best;
      }, { i: 0, d: Infinity }).i;
      const withoutStop = newRouteStops.filter(s => s.id !== stop.id);
      const reordered = [
        ...withoutStop.slice(0, nearestIdx + 1),
        { ...stop, metadata: updatedMetadata },
        ...withoutStop.slice(nearestIdx + 1),
      ];
      await tripData.reorderStops([...reordered, ...savedStops.filter(s => s.id !== stop.id)]);
    } else {
      await tripData.reorderStops([{ ...stop, metadata: updatedMetadata }, ...savedStops.filter(s => s.id !== stop.id)]);
    }
    setSelectedStop(null);
  }, [tripData, routeStops, savedStops]);

  const nextStop = routeStops.find(s => !s.reached);
  const mapOverlayBottom = activeTab === 'map' && nextStop
    ? MAP_CONTROLS_BOTTOM_WITH_NEXT_STOP
    : MAP_CONTROLS_BOTTOM;

  const filteredMapStops = stopTypeFilter
    ? (stopTypeFilter === '__saved__'
      ? savedStops
      : routeStops.filter(s => s.pinType === stopTypeFilter))
    : stops;

  const formatWeatherTemp = useCallback((celsius) => {
    if (!Number.isFinite(celsius)) return '';
    if (units === 'metric') return `${Math.round(celsius)}°`;
    return `${Math.round((celsius * 9) / 5 + 32)}°`;
  }, [units]);
  const formatWindSpeed = useCallback((kmh) => {
    if (!Number.isFinite(kmh)) return '';
    if (units === 'metric') return `${Math.round(kmh)} km/h`;
    return `${Math.round(kmh * 0.621371)} mph`;
  }, [units]);

  const weatherPins = useMemo(() => {
    if (!['weather-current', 'weather-scheduled'].includes(mapLayer)) return [];
    const firstDatedIdx = routeStops.findIndex(s => s.targetDate);
    let fallbackBaseDate = new Date();
    fallbackBaseDate.setHours(12, 0, 0, 0);
    if (firstDatedIdx >= 0) {
      const anchorDate = new Date(routeStops[firstDatedIdx].targetDate);
      if (!Number.isNaN(anchorDate.getTime())) {
        anchorDate.setDate(anchorDate.getDate() - firstDatedIdx);
        fallbackBaseDate = anchorDate;
      }
    }
    return routeStops.map((stop, idx) => {
      const weather = weatherByStopId[stop.id];
      if (!weather) return null;
      if (mapLayer === 'weather-current') {
        const current = buildCurrentWeather(weather);
        if (!current) return null;
        return {
          id: `current-${stop.id}`,
          stopId: stop.id,
          lat: stop.lat,
          lng: stop.lng,
          emoji: current.emoji,
          tempLabel: formatWeatherTemp(current.temperature),
        };
      }
      const fallbackDate = new Date(fallbackBaseDate);
      fallbackDate.setDate(fallbackDate.getDate() + idx);
      const scheduled = buildScheduledDayWeather(weather, stop.targetDate || fallbackDate.toISOString());
      if (!scheduled) return null;
      return {
        id: `scheduled-${stop.id}`,
        stopId: stop.id,
        lat: stop.lat,
        lng: stop.lng,
        emoji: scheduled.emoji,
        tempLabel: formatWeatherTemp(scheduled.maxTemp),
      };
    }).filter(Boolean);
  }, [mapLayer, routeStops, weatherByStopId, formatWeatherTemp]);

  const aqiPins = useMemo(() => {
    if (mapLayer !== 'aqi') return [];
    return Object.values(aqiGridData).map(entry => ({
      id: `aqigrid-${entry.lat}-${entry.lng}`,
      lat: entry.lat,
      lng: entry.lng,
      aqi: entry.aqi,
      level: aqiMeta(entry.aqi),
      pm2_5: entry.pm2_5,
      pm10: entry.pm10,
    }));
  }, [mapLayer, aqiGridData]);

  // Build fire pins — only shown on the AQI layer.
  // When stops exist, limit to fires within a generous 1500 km radius of the trip centroid
  // so we don't render tens of thousands of global detections.
  const firePins = useMemo(() => {
    if (mapLayer !== 'aqi' || !fireData.length) return [];
    const byIntensity = fireIntensityMin > 0
      ? fireData.filter(f => f.frp != null && f.frp >= fireIntensityMin)
      : fireData;
    if (routeStops.length === 0) return byIntensity;
    const lats = routeStops.map(s => s.lat);
    const lngs = routeStops.map(s => s.lng);
    const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    const MAX_DEG = 1500 / 111; // ~1500 km in degrees (rough)
    return byIntensity.filter(f =>
      Math.abs(f.lat - cLat) <= MAX_DEG && Math.abs(f.lng - cLng) <= MAX_DEG
    );
  }, [mapLayer, fireData, fireIntensityMin, routeStops]);

  // Stops that have been downloaded for offline use
  const offlinePins = useMemo(() => {
    if (mapLayer !== 'offline') return [];
    try {
      const snapshot = JSON.parse(localStorage.getItem(`tripify-offline-${id}`) || 'null');
      if (!snapshot) return [];
      const cachedIds = new Set([
        ...(snapshot.routeStops || []).map(s => s.id),
        ...(snapshot.savedStops || []).map(s => s.id),
      ]);
      return stops.filter(s => cachedIds.has(s.id));
    } catch {
      return [];
    }
  }, [mapLayer, stops, id]);

  const handleMapTapWeather = useCallback(async (latlng) => {
    if (!latlng) return;
    setMapWeatherModal({ loading: true, lat: latlng.lat, lng: latlng.lng });
    try {
      const weather = await getWeather(latlng.lat, latlng.lng);
      const current = buildCurrentWeather(weather);
      setMapWeatherModal({
        loading: false,
        lat: latlng.lat,
        lng: latlng.lng,
        weather: current,
      });
    } catch {
      setMapWeatherModal({
        loading: false,
        lat: latlng.lat,
        lng: latlng.lng,
        error: 'Weather unavailable for this area right now.',
      });
    }
  }, []);

  const handleMapTapAqi = useCallback(async (latlng) => {
    if (!latlng) return;
    setMapAqiModal({ loading: true, lat: latlng.lat, lng: latlng.lng });
    try {
      const data = await getAqiForStop(latlng.lat, latlng.lng);
      setMapAqiModal({
        loading: false,
        lat: latlng.lat,
        lng: latlng.lng,
        aqi: data?.aqi,
        level: aqiMeta(data?.aqi),
        pm2_5: data?.pm2_5,
        pm10: data?.pm10,
      });
    } catch {
      setMapAqiModal({
        loading: false,
        lat: latlng.lat,
        lng: latlng.lng,
        error: 'Air quality data unavailable for this area.',
      });
    }
  }, []);

  const ATTRACTIONS_TOP_N = 20;

  // Score a POI element by importance (higher = more prominent)
  const attractionScore = (el) => {
    const t = el.tags || {};
    let score = 0;
    if (t.wikipedia) score += 30;
    if (t.wikidata) score += 20;
    if (t['name:en']) score += 10;
    if (t.name) score += 5;
    if (t.tourism === 'attraction') score += 8;
    if (t.tourism === 'viewpoint') score += 4;
    if (t.historic) score += 6;
    if (t.leisure === 'nature_reserve') score += 4;
    if (t.natural === 'peak') score += 7;
    if (t.natural === 'waterfall') score += 7;
    if (t.natural === 'geyser') score += 9;
    if (t.natural === 'hot_spring') score += 6;
    return score;
  };

  const handleBoundsChange = useCallback((bounds, zoom) => {
    if (activeTab !== 'map') return;
    clearTimeout(attractionDebounce.current);
    attractionDebounce.current = setTimeout(async () => {
      const s = bounds.getSouth().toFixed(4);
      const w = bounds.getWest().toFixed(4);
      const n = bounds.getNorth().toFixed(4);
      const e = bounds.getEast().toFixed(4);
      // Request more results when zoomed out so we have enough candidates to rank
      const outLimit = zoom < 10 ? 100 : 50;
      const query = `[out:json][timeout:15];(node["tourism"="attraction"](${s},${w},${n},${e});node["tourism"="viewpoint"](${s},${w},${n},${e});node["natural"="peak"]["name"](${s},${w},${n},${e});node["natural"="waterfall"]["name"](${s},${w},${n},${e});node["natural"="geyser"]["name"](${s},${w},${n},${e});node["natural"="hot_spring"]["name"](${s},${w},${n},${e});node["historic"]["name"](${s},${w},${n},${e});node["leisure"="nature_reserve"]["name"](${s},${w},${n},${e});way["tourism"="attraction"](${s},${w},${n},${e}););out center ${outLimit};`;
      try {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
        });
        if (!res.ok) {
          console.warn(`[attractions] Overpass HTTP error ${res.status} (zoom=${zoom}, bounds=${s},${w},${n},${e})`);
          return;
        }
        const data = await res.json();
        const elements = (data.elements || []).filter(el => el.tags?.name);
        elements.sort((a, b) => attractionScore(b) - attractionScore(a));
        const top = elements.slice(0, ATTRACTIONS_TOP_N).map(el => ({
          id: `${el.type}-${el.id}`,
          name: el.tags['name:en'] || el.tags.name,
          lat: el.lat ?? el.center?.lat,
          lng: el.lon ?? el.center?.lon,
          wikipedia: el.tags.wikipedia,
          wikidata: el.tags.wikidata,
          tags: el.tags,
        })).filter(p => p.lat != null && p.lng != null);
        setAttractionPins(top);
      } catch (err) {
        console.warn(`[attractions] Overpass fetch failed (zoom=${zoom}, bounds=${s},${w},${n},${e}):`, err.message);
      }
    }, 600);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const prepareOffline = useCallback(async () => {
    try {
      setOfflinePreparing(true);
      setOfflineStatus('Preparing offline download…');
      const allStops = [...routeStops, ...savedStops];
      // Extract state/region names from Nominatim-style comma-delimited addresses
      const areaNames = [];
      for (const stop of allStops) {
        const state = stop.address?.split(',').slice(-2, -1)[0]?.trim();
        if (state && !areaNames.includes(state)) areaNames.push(state);
      }

      // Build tile URLs across zoom levels; tile radius is derived from the
      // configured offline radius (miles → km → tiles at each zoom level).
      const radiusMi = settings.offlineRadiusMi ?? 5;
      const radiusKm = radiusMi * MI_TO_KM;
      // z=15 is included to capture street-level detail (gas stations, park names, etc.)
      // but is tightly capped so it doesn't balloon the download.
      const zoomLevels = [8, 10, 12, 14, 15];
      const urls = new Set();

      // Helper: add tile URLs for a lat/lng point at all zoom levels
      const addTilesForPoint = (lat, lng) => {
        for (const z of zoomLevels) {
          const center = latLngToTile(lat, lng, z);
          // Tile size in km at given zoom and latitude
          const tileKm = (EARTH_CIRCUMFERENCE_KM * Math.cos((lat * Math.PI) / 180)) / (2 ** z);
          // Number of tiles to extend in each direction (min 0, enough to cover the radius)
          const tileRadius = tileKm > 0 ? Math.max(0, Math.ceil(radiusKm / tileKm)) : 0;
          // Cap per-zoom radius to avoid runaway downloads at high zooms
          const maxTileRadius = z >= 15 ? 3 : z >= 14 ? 4 : z >= 12 ? 6 : z >= 10 ? 3 : 1;
          const r = Math.min(tileRadius, maxTileRadius);
          for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
              const tx = center.x + dx;
              const ty = center.y + dy;
              // Stadia Alidade Smooth (light) — matches the live normal (light) map
              urls.add(stadiaOfflineUrl(`https://tiles.stadiamaps.com/tiles/alidade_smooth/${z}/${tx}/${ty}.png`));
              urls.add(stadiaOfflineUrl(`https://tiles.stadiamaps.com/tiles/alidade_smooth/${z}/${tx}/${ty}@2x.png`));
              // Stadia Alidade Smooth Dark — matches the live normal (dark) map
              urls.add(stadiaOfflineUrl(`https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/${z}/${tx}/${ty}.png`));
              urls.add(stadiaOfflineUrl(`https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/${z}/${tx}/${ty}@2x.png`));
              // Stadia Toner Labels — label overlay used on satellite view
              urls.add(stadiaOfflineUrl(`https://tiles.stadiamaps.com/tiles/stamen_toner_labels/${z}/${tx}/${ty}.png`));
              urls.add(stadiaOfflineUrl(`https://tiles.stadiamaps.com/tiles/stamen_toner_labels/${z}/${tx}/${ty}@2x.png`));
              // Satellite (ArcGIS) — note tile URL uses z/y/x order
              urls.add(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`);
              // Trails (OpenTopoMap)
              urls.add(`https://a.tile.opentopomap.org/${z}/${tx}/${ty}.png`);
            }
          }
        }
      };

      // Download tiles for every stop (with radius)
      for (const stop of allStops) {
        addTilesForPoint(stop.lat, stop.lng);
      }

      // Also download tiles along the route geometry so in-between sections work offline.
      // Sample a point every ~25 km along the polyline to cover corridor between stops.
      if (route?.geometry?.coordinates?.length > 1) {
        setOfflineStatus('Downloading route corridor tiles…');
        const coords = route.geometry.coordinates; // [lng, lat] pairs
        const SAMPLE_KM = 25;
        const METERS_PER_DEG = 111_000;
        let distSinceLast = SAMPLE_KM * 1000; // force first point to be sampled
        for (let i = 1; i < coords.length; i++) {
          const [lng, lat] = coords[i];
          const [plng, plat] = coords[i - 1];
          const segMeters = Math.sqrt(
            ((lat - plat) * METERS_PER_DEG) ** 2 +
            ((lng - plng) * METERS_PER_DEG * Math.cos(lat * Math.PI / 180)) ** 2
          );
          distSinceLast += segMeters;
          if (distSinceLast >= SAMPLE_KM * 1000) {
            addTilesForPoint(lat, lng);
            distSinceLast = 0;
          }
        }
      }

      let downloaded = 0;
      const totalUrls = urls.size;
      if ('caches' in window) {
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        await Promise.all([...urls].map(url =>
          fetch(url, { mode: 'no-cors' })
            .then(res => { cache.put(url, res); downloaded++; })
            .catch(() => { downloaded++; })
        ));
      }

      const snapshot = {
        tripId: id,
        tripTitle: trip?.title,
        updatedAt: new Date().toISOString(),
        route,
        routeStops,
        savedStops,
        downloadedAreas: areaNames,
        tileCount: totalUrls,
        radiusMi,
        // totalUrls counts each individual tile URL (one per tile per layer).
        // Rough estimate: ~15 KB per tile URL on average.
        estimatedSizeMB: Math.round((totalUrls * 15) / 1024 * 10) / 10,
      };
      localStorage.setItem(`tripify-offline-${id}`, JSON.stringify(snapshot));
      setOfflineStatus(`Downloaded ~${totalUrls} tiles (${radiusMi} mi radius, including route corridor) across normal, dark, satellite, and trail maps.`);
    } catch {
      setOfflineStatus('Offline prep partially completed.');
    } finally {
      setOfflinePreparing(false);
    }
  }, [id, trip?.title, route, routeStops, savedStops, settings]);

  useEffect(() => {
    const handler = () => {
      setActiveTab('map');
      prepareOffline();
    };
    window.addEventListener('tripify:offline-prep-request', handler);
    return () => window.removeEventListener('tripify:offline-prep-request', handler);
  }, [prepareOffline]);

  const openWhatsAroundInAi = useCallback((stop) => {
    setSelectedStop(null);
    setActiveTab('ai');
    setAiPromptRequest({
      id: Date.now(),
      text: `What are places to visit and things to do around ${stop.name}${stop.address ? ` near ${stop.address}` : ''}?`,
    });
  }, []);

  if (loading) return <div className="workspace-loading"><div className="spinner" /></div>;
  if (error) return (
    <div className="workspace-error">
      <p>{error}</p>
      <button className="btn-primary" onClick={() => navigate('/')}>← Back</button>
    </div>
  );

  return (
    <div className={`workspace${darkMode ? ' workspace-dark' : ''}`}>
      {/* ── Top bar ── */}
      <div className="ws-topbar">
        <button className="ws-back" onClick={() => navigate('/')} aria-label="Back">←</button>
        <div className="ws-title">
          <span className="ws-trip-name">{trip?.title}</span>
          {saveState !== 'idle' && (
            <span className={`ws-save-state ws-save-${saveState}`}>
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : '⚠ Error saving'}
            </span>
          )}
        </div>
        <button className="ws-search-btn" onClick={() => setShowSearch(true)} aria-label="Search">🔍</button>
      </div>

      {isOffline && (
        <div className="ws-offline-banner" role="status">
          📵 Offline — viewing cached trip data
        </div>
      )}

      {/* ── Main area ── */}
      <div className="ws-body">
        {/* Map always rendered */}
        <div className="ws-map-layer">
          <TripMap
            ref={mapRef}
            stops={filteredMapStops}
            route={stopTypeFilter === '__saved__' ? null : route}
            completedFraction={completedFraction}
            userLocation={userLocation}
            onStopSelect={stop => handleOpenStop(stop)}
            onLongPress={handleLongPress}
            onMapTap={
              ['weather-current', 'weather-scheduled'].includes(mapLayer) ? handleMapTapWeather :
              mapLayer === 'aqi' ? handleMapTapAqi : undefined
            }
            darkMode={darkMode}
            searchPins={mapSearchResults}
            onSearchPinSelect={pin => setSelectedSearchPin(pin)}
            searchSelectedId={selectedSearchPin?.id}
            mapLayer={mapLayer}
            weatherPins={weatherPins}
            hideStopPins={['weather-current', 'weather-scheduled'].includes(mapLayer)}
            onWeatherPinClick={pin => {
              const stop = routeStops.find(s => s.id === pin.stopId);
              if (stop) handleOpenStop(stop);
            }}
            offlinePins={offlinePins}
            offlineRadiusMeters={(settings.offlineRadiusMi ?? 5) * MI_TO_METERS}
            aqiPins={aqiPins}
            aqiTilesAvailable={aqiTilesAvailable}
            aqiOverlayRadiusMeters={aqiGridRadiusMeters}
            onAqiPinClick={pin => {
              setMapAqiModal({
                loading: false,
                lat: pin.lat,
                lng: pin.lng,
                aqi: pin.aqi,
                level: pin.level,
                pm2_5: pin.pm2_5,
                pm10: pin.pm10,
              });
            }}
            firePins={firePins}
            onFirePinClick={pin => setMapFireModal(pin)}
            attractionPins={attractionPins}
            onAttractionPinClick={pin => setSelectedAttraction(pin)}
            onBoundsChange={handleBoundsChange}
            mapTileProvider={settings.mapTileProvider ?? 'stadia'}
          />

          {/* ── Map overlay control buttons ── */}
          {/* Bottom offset increases when next-stop strip (≈100px) is visible to prevent overlap */}
          <div className="ws-map-controls" style={{ bottom: mapOverlayBottom }}>
            <button className="map-ctrl-btn" title="Add a stop" onClick={() => setShowSearch(true)}>
              <span className="map-ctrl-icon">+</span>
            </button>
            <button className="map-ctrl-btn" title="My location" onClick={handleMyLocation}>
              <span className="map-ctrl-icon">◎</span>
            </button>
            <button className="map-ctrl-btn" title="Fit trip" onClick={handleFitTrip}>
              <span className="map-ctrl-icon">⊡</span>
            </button>
            {availableStopTypes.length > 1 && (
              <button
                className={`map-ctrl-btn${showMapFilters ? ' map-ctrl-active' : ''}`}
                title="Filters"
                onClick={() => setShowMapFilters(prev => !prev)}
              >
                <span className="map-ctrl-icon">⚙️</span>
              </button>
            )}
            <button
              className={`map-ctrl-btn${showMapLayers ? ' map-ctrl-active' : ''}`}
              title="Map layers"
              onClick={() => setShowMapLayers(prev => !prev)}
            >
              <span className="map-ctrl-icon">🛰️</span>
            </button>
            <button
              className={`map-ctrl-btn map-ctrl-search${mapSearchMode ? ' map-ctrl-active' : ''}`}
              title={mapSearchMode ? 'Exit search' : 'Search this area'}
              onClick={mapSearchMode ? exitMapSearch : handleSearchArea}
            >
              <span className="map-ctrl-icon">{mapSearchMode ? '✕' : '🔍'}</span>
            </button>
            <button className="map-ctrl-btn map-ctrl-trails" title="Find trails on AllTrails" onClick={handleFindTrails}>
              <span className="map-ctrl-icon">🥾</span>
            </button>
          </div>
          {showMapLayers && (
            <div className="ws-map-filter-menu" style={{ bottom: mapOverlayBottom, right: '68px' }}>
              {MAP_LAYER_OPTIONS.map(([key, label]) => (
                <button
                  key={key}
                  className={`map-filter-menu-btn${mapLayer === key ? ' active' : ''}`}
                  onClick={() => {
                    setMapLayer(key);
                    setShowMapLayers(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {showMapFilters && availableStopTypes.length > 1 && (
            <div className="ws-map-filter-menu" style={{ bottom: mapOverlayBottom }}>
              <button
                className={`map-filter-menu-btn${!stopTypeFilter ? ' active' : ''}`}
                onClick={() => {
                  setStopTypeFilter(null);
                  setShowMapFilters(false);
                }}
              >
                All stops
              </button>
              {availableStopTypes.map(type => {
                const typeMeta = type === '__saved__' ? { emoji: '🔖', label: 'Saved for later' } : (PIN_TYPES[type] || PIN_TYPES.GENERAL);
                return (
                  <button
                    key={type}
                    className={`map-filter-menu-btn${stopTypeFilter === type ? ' active' : ''}`}
                    onClick={() => {
                      setStopTypeFilter(stopTypeFilter === type ? null : type);
                      setShowMapFilters(false);
                    }}
                  >
                    <span>{typeMeta.emoji}</span>
                    <span>{typeMeta.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Map search bar ── */}
          {mapSearchMode && (
            <div className="ws-map-search-bar">
              <button className="ws-mapsearch-back" onClick={exitMapSearch} aria-label="Close search">←</button>
              <input
                className="ws-mapsearch-input"
                autoFocus
                value={mapSearchQuery}
                onChange={e => handleMapSearchQuery(e.target.value)}
                placeholder="Search this area (e.g. Costco, gas station…)"
              />
              {mapSearching && <div className="spinner xs" />}
            </div>
          )}

          {/* ── Selected search pin info card ── */}
          {selectedSearchPin && (
            <div className="ws-search-pin-card">
              <div className="ws-spc-handle" />
              <button className="ws-spc-close" onClick={() => setSelectedSearchPin(null)} aria-label="Close">×</button>
              <div className="ws-spc-name">{selectedSearchPin.name}</div>
              {(selectedSearchPin.category || selectedSearchPin.type) && (
                <div className="ws-spc-type">{selectedSearchPin.type || selectedSearchPin.category}</div>
              )}
              <div className="ws-spc-addr">{selectedSearchPin.displayName}</div>
              {selectedSearchPin.extratags?.rating != null && (
                <div className="ws-spc-detail">⭐ <span>{selectedSearchPin.extratags.rating}{selectedSearchPin.extratags.user_ratings_total ? ` (${selectedSearchPin.extratags.user_ratings_total} reviews)` : ''}</span></div>
              )}
              {selectedSearchPin.extratags?.opening_hours && (
                <div className="ws-spc-detail">⏰ <span>{selectedSearchPin.extratags.opening_hours}</span></div>
              )}
              {selectedSearchPin.extratags?.phone && (
                <div className="ws-spc-detail">📞 <a href={`tel:${selectedSearchPin.extratags.phone}`}>{selectedSearchPin.extratags.phone}</a></div>
              )}
              {selectedSearchPin.extratags?.website && (
                <div className="ws-spc-detail">🌐 <a href={selectedSearchPin.extratags.website} target="_blank" rel="noopener noreferrer">Website</a></div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                <button
                  className="btn-primary ws-spc-add"
                  onClick={() => handleAddSearchPin(selectedSearchPin, 'next')}
                >
                  ↑ Add as next stop
                </button>
                <button
                  className="btn-primary ws-spc-add"
                  onClick={() => handleAddSearchPin(selectedSearchPin, 'afterNearest')}
                >
                  + Add after nearest pin
                </button>
                <button
                  className="btn-primary ws-spc-add"
                  onClick={() => handleAddSearchPin(selectedSearchPin, 'beforeNearest')}
                >
                  ↓ Add before nearest pin
                </button>
                <button
                  className="btn-secondary ws-spc-add"
                  onClick={() => handleAddSearchPin({ ...selectedSearchPin, saveForLater: true })}
                >
                  🔖 Save for later
                </button>
              </div>
            </div>
          )}
          {weatherLoading && ['weather-current', 'weather-scheduled'].includes(mapLayer) && (
            <div className="ws-offline-status">Loading weather along your route…</div>
          )}
          {aqiLoading && mapLayer === 'aqi' && (
            <div className="ws-offline-status">Loading air quality data…</div>
          )}
          {mapLayer === 'aqi' && !aqiLoading && fireData.length > 0 && (
            <div className="ws-fire-filter">
              <span className="ws-fire-filter-label">🔥 Fire intensity:</span>
              {[
                { label: 'All', value: 0 },
                { label: 'Moderate+', value: FIRE_FRP_MODERATE },
                { label: 'High+', value: FIRE_FRP_HIGH },
                { label: 'Extreme', value: FIRE_FRP_EXTREME },
              ].map(opt => (
                <button
                  key={opt.value}
                  className={`ws-fire-filter-btn${fireIntensityMin === opt.value ? ' active' : ''}`}
                  onClick={() => setFireIntensityMin(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {offlineStatus && <div className="ws-offline-status">{offlineStatus}</div>}

          {/* ── Next stop strip (map tab only) ── */}
          {activeTab === 'map' && nextStop && (
            <div className="ws-next-strip">
              <div className="ws-next-info">
                <span className="ws-next-label">Next stop</span>
                <span className="ws-next-name">{nextStop.name}</span>
                {route?.legs?.[reachedCount] && (
                  <span className="ws-next-dist">
                    {formatDistance(route.legs[reachedCount]?.distance, units)} ·{' '}
                    {formatDuration(route.legs[reachedCount]?.duration)}
                  </span>
                )}
              </div>

              {/* Geographic progress pill */}
              {route && (
                <div className="ws-geo-progress">
                  <span className="ws-geo-done">{formatDistance(completedDist, units)}</span>
                  <div className="ws-geo-bar">
                    <div
                      className="ws-geo-fill"
                      style={{ width: `${Math.min(100, route.distance > 0 ? completedDist / route.distance * 100 : 0)}%` }}
                    />
                  </div>
                  <span className="ws-geo-left">{formatDistance(remainingDist, units)} left</span>
                </div>
              )}

              <div className="ws-next-actions">
                <button
                  className="ws-nav-btn"
                  onClick={() => {
                    const from = userLocation ? `${userLocation[0]},${userLocation[1]}` : '';
                    const to = `${nextStop.lat},${nextStop.lng}`;
                    const isApple = /iPhone|iPad|Mac/.test(navigator.userAgent);
                    const url = isApple
                      ? `maps://maps.apple.com/?daddr=${to}`
                      : `https://www.google.com/maps/dir/?api=1&destination=${to}`;
                    window.open(url, '_blank');
                  }}
                >
                  Directions
                </button>
                <button className="ws-reach-btn" onClick={() => handleMarkReached(nextStop.id)}>
                  ✓ Arrived
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Panel overlays (non-map tabs) ── */}
        {activeTab !== 'map' && (
          <div className="ws-panel">
            {activeTab === 'stops' && (
              <StopList
                stops={stops}
                route={route}
                units={units}
                onSelect={stop => handleOpenStop(stop)}
                onReorder={handleReorderRouteStops}
                onReached={handleMarkReached}
                onDelete={tripData.deleteStop}
                onAdd={() => setShowSearch(true)}
                filterType={stopTypeFilter}
                onFilterChange={setStopTypeFilter}
                stopsTab={stopsTab}
                onStopsTabChange={setStopsTab}
              />
            )}
            {activeTab === 'days' && (
              <div className="ws-days-wrap">
                <div className="ws-days-tabs">
                  <button
                    className={`ws-days-subtab${!activeSubTab || activeSubTab === 'itinerary' ? ' active' : ''}`}
                    onClick={() => setActiveSubTab('itinerary')}
                  >
                    📅 Itinerary
                  </button>
                  <button
                    className={`ws-days-subtab${activeSubTab === 'today' ? ' active' : ''}`}
                    onClick={() => setActiveSubTab('today')}
                  >
                    ☀️ Today
                  </button>
                </div>
                {(!activeSubTab || activeSubTab === 'itinerary') && (
                  <DaysView
                    days={days}
                    stops={stops}
                    tripId={id}
                    onAddDay={tripData.addDay}
                    onUpdateDay={tripData.updateDay}
                    onDeleteDay={tripData.deleteDay}
                    onAddEntry={tripData.addEntry}
                    onUpdateEntry={tripData.updateEntry}
                    onDeleteEntry={tripData.deleteEntry}
                    onAddReservation={tripData.addReservation}
                    onUpdateReservation={tripData.updateReservation}
                  />
                )}
                {activeSubTab === 'today' && (
                  <TodayView
                    days={days}
                    reservations={reservations}
                    stops={stops}
                    onNavigate={tab => setActiveTab(tab)}
                  />
                )}
              </div>
            )}
            {activeTab === 'items' && (
              <ItemsView
                categories={categories}
                tripId={id}
                onAddCategory={tripData.addCategory}
                onDeleteCategory={tripData.deleteCategory}
                onAddItem={tripData.addItem}
                onUpdateItem={tripData.updateItem}
                onDeleteItem={tripData.deleteItem}
                canEdit={trip?.memberRole !== 'VIEWER'}
              />
            )}
            {activeTab === 'ai' && (
              <AiView
                tripId={id}
                tripName={trip?.title}
                stops={stops}
                route={route}
                units={units}
                autoPromptRequest={aiPromptRequest}
                onAutoPromptDone={() => setAiPromptRequest(null)}
                onOpenMapSearch={(query) => {
                  setActiveTab('map');
                  setMapSearchMode(true);
                  setMapSearchQuery(query);
                  setMapSearchResults([]);
                  setSelectedSearchPin(null);
                  // Trigger the search after switching tabs
                  setTimeout(() => handleMapSearchQuery(query), 100);
                }}
                onFlyToStop={(stop) => {
                  handleOpenStop(stop);
                }}
              />
            )}
            {activeTab === 'more' && (
              <MoreView
                trip={trip}
                stops={stops}
                route={route}
                references={references}
                days={days}
                reservations={reservations}
                categories={categories}
                units={units}
                onAddReference={tripData.addReference}
                onDeleteReference={tripData.deleteReference}
                onUpdateTrip={tripData.updateTrip}
                onDeleteTrip={async () => { await tripData.deleteTrip(); navigate('/'); }}
                onNavigate={tab => setActiveTab(tab)}
                onDownloadOffline={prepareOffline}
                offlineDownloading={offlinePreparing}
                offlineStatus={offlineStatus}
                tripId={id}
                offlineRadiusMi={settings.offlineRadiusMi ?? 5}
              />
            )}
            {activeTab === 'gallery' && (
              <GalleryView
                stops={stops}
                onBack={() => setActiveTab('more')}
                onOpenStop={stop => handleOpenStop(stop)}
                onDeletePhoto={async (stop) => {
                  const updatedMeta = { ...stop.metadata };
                  delete updatedMeta.photo;
                  await tripData.updateStop(stop.id, { metadata: updatedMeta });
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Bottom tab bar ── */}
      <div className="ws-tabbar">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`ws-tab${activeTab === tab.key ? ' ws-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="ws-tab-icon">{tab.icon}</span>
            <span className="ws-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Stop detail sheet ── */}
      {selectedStop && (
        <StopSheet
          stop={selectedStop}
          stops={stops}
          days={days}
          route={route}
          units={units}
          userLocation={userLocation}
          onClose={() => setSelectedStop(null)}
          onUpdate={async (updates) => {
            await tripData.updateStop(selectedStop.id, updates);
            setSelectedStop(prev => ({ ...prev, ...updates }));
          }}
          onOpenNearbySearch={() => handleOpenStop(selectedStop, { searchNearby: true })}
          onAskWhatsAround={() => openWhatsAroundInAi(selectedStop)}
          onAddToRoute={handleAddSavedToRoute}
          onReach={() => {
            const wasReached = selectedStop.reached;
            handleMarkReached(selectedStop.id, !wasReached);
            setSelectedStop(prev => ({ ...prev, reached: !prev.reached }));
          }}
          onDelete={async () => {
            await tripData.deleteStop(selectedStop.id);
            setSelectedStop(null);
          }}
          canEdit={trip?.memberRole !== 'VIEWER'}
        />
      )}

      {/* ── Add stop / search sheet ── */}
      {showSearch && (
        <SearchSheet
          prefill={typeof showSearch === 'object' ? showSearch.prefill : null}
          onAdd={handleAddStop}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* ── Photo prompt after reaching a stop ── */}
      {photoPromptStop && (
        <div className="sheet-overlay" onClick={() => setPhotoPromptStop(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h3>📸 Add a photo?</h3>
              <button className="sheet-close" onClick={() => setPhotoPromptStop(null)}>×</button>
            </div>
            <div className="sheet-body" style={{ paddingBottom: '24px' }}>
              <p style={{ fontSize: '.9rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Capture the moment at <strong>{photoPromptStop.name}</strong>!
              </p>
              <input
                ref={photoFileRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const compressed = await compressImage(file, 1200, 0.82);
                    await tripData.uploadStopPhoto(photoPromptStop.id, compressed);
                  } catch (err) {
                    console.error('Photo upload failed:', err);
                  } finally {
                    setPhotoPromptStop(null);
                    if (photoFileRef.current) photoFileRef.current.value = '';
                  }
                }}
              />
              <input
                id="photo-gallery-input"
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const compressed = await compressImage(file, 1200, 0.82);
                    await tripData.uploadStopPhoto(photoPromptStop.id, compressed);
                  } catch (err) {
                    console.error('Photo upload failed:', err);
                  } finally {
                    setPhotoPromptStop(null);
                    document.getElementById('photo-gallery-input').value = '';
                  }
                }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-primary" style={{ flex: 1 }} onClick={() => photoFileRef.current?.click()}>
                  📷 Take Photo
                </button>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => document.getElementById('photo-gallery-input')?.click()}>
                  🖼 Gallery
                </button>
              </div>
              <button className="btn-ghost btn-sm" style={{ width: '100%', marginTop: '10px' }} onClick={() => setPhotoPromptStop(null)}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
      {mapWeatherModal && (
        <div className="sheet-overlay" onClick={() => setMapWeatherModal(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h3>🌦 Weather here</h3>
              <button className="sheet-close" onClick={() => setMapWeatherModal(null)}>×</button>
            </div>
            <div className="sheet-body" style={{ paddingBottom: '24px' }}>
              <p className="sheet-address">
                {mapWeatherModal.lat.toFixed(4)}, {mapWeatherModal.lng.toFixed(4)}
              </p>
              {mapWeatherModal.loading && <div className="sheet-detail-row">Loading…</div>}
              {!mapWeatherModal.loading && mapWeatherModal.error && (
                <div className="sheet-detail-row">{mapWeatherModal.error}</div>
              )}
              {!mapWeatherModal.loading && mapWeatherModal.weather && (
                <>
                  <div className="sheet-detail-row" style={{ fontSize: '1.2rem' }}>
                    <span style={{ marginRight: '8px' }}>{mapWeatherModal.weather.emoji}</span>
                    <strong>{mapWeatherModal.weather.label}</strong>
                  </div>
                  <div className="sheet-detail-row">
                    🌡 {formatWeatherTemp(mapWeatherModal.weather.temperature)} · 💨 {formatWindSpeed(mapWeatherModal.weather.windSpeed)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {mapAqiModal && (
        <div className="sheet-overlay" onClick={() => setMapAqiModal(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h3>🌫 Air Quality here</h3>
              <button className="sheet-close" onClick={() => setMapAqiModal(null)}>×</button>
            </div>
            <div className="sheet-body" style={{ paddingBottom: '24px' }}>
              <p className="sheet-address">
                {mapAqiModal.lat.toFixed(4)}, {mapAqiModal.lng.toFixed(4)}
              </p>
              {mapAqiModal.loading && <div className="sheet-detail-row">Loading…</div>}
              {!mapAqiModal.loading && mapAqiModal.error && (
                <div className="sheet-detail-row">{mapAqiModal.error}</div>
              )}
              {!mapAqiModal.loading && mapAqiModal.aqi != null && (
                <>
                  <div className="sheet-detail-row" style={{ fontSize: '1.2rem' }}>
                    <span style={{
                      display: 'inline-block', width: 14, height: 14, borderRadius: 3,
                      background: mapAqiModal.level?.color || '#888',
                      marginRight: 8, verticalAlign: 'middle',
                    }} />
                    <strong>AQI {mapAqiModal.aqi}</strong>
                    {mapAqiModal.level && <span style={{ marginLeft: 8, fontSize: '0.9rem', color: 'var(--text-muted)' }}>{mapAqiModal.level.label}</span>}
                  </div>
                  {mapAqiModal.pm2_5 != null && (
                    <div className="sheet-detail-row">PM2.5: {mapAqiModal.pm2_5.toFixed(1)} µg/m³</div>
                  )}
                  {mapAqiModal.pm10 != null && (
                    <div className="sheet-detail-row">PM10: {mapAqiModal.pm10.toFixed(1)} µg/m³</div>
                  )}
                  <div className="sheet-detail-row" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>
                    Data: Open-Meteo Air Quality API
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {mapFireModal && (
        <div className="sheet-overlay" onClick={() => setMapFireModal(null)}>
          <div className="sheet sheet-sm" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h3>🔥 Active Fire</h3>
              <button className="sheet-close" onClick={() => setMapFireModal(null)}>×</button>
            </div>
            <div className="sheet-body">
              <div className="sheet-detail-row">
                📍 {mapFireModal.lat.toFixed(4)}, {mapFireModal.lng.toFixed(4)}
              </div>
              {mapFireModal.acq_date && (
                <div className="sheet-detail-row">
                  🗓 Detected: {mapFireModal.acq_date}{mapFireModal.acq_time ? ` at ${mapFireModal.acq_time.padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2')} UTC` : ''}
                </div>
              )}
              {mapFireModal.confidence != null && (
                <div className="sheet-detail-row">
                  🎯 Confidence: {mapFireModal.confidence}
                </div>
              )}
              {mapFireModal.frp != null && (
                <div className="sheet-detail-row">
                  ⚡ Fire Radiative Power: {Number(mapFireModal.frp).toFixed(1)} MW
                </div>
              )}
              {mapFireModal.brightness != null && (
                <div className="sheet-detail-row">
                  🌡 Brightness: {Number(mapFireModal.brightness).toFixed(1)} K
                </div>
              )}
              {mapFireModal.satellite && (
                <div className="sheet-detail-row">
                  🛰 Satellite: {mapFireModal.satellite}
                </div>
              )}
              <div className="sheet-detail-row" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>
                Data: NASA FIRMS (last 24 h)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Attraction detail sheet ── */}
      {selectedAttraction && (
        <div className="sheet-overlay" onClick={() => setSelectedAttraction(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-header">
              <span className="sheet-title">⭐ {selectedAttraction.name}</span>
              <button className="sheet-close" onClick={() => setSelectedAttraction(null)}>✕</button>
            </div>
            <div className="sheet-body">
              {selectedAttraction.tags?.tourism && (
                <div className="sheet-detail-row">🏷 {selectedAttraction.tags.tourism}</div>
              )}
              {selectedAttraction.tags?.historic && (
                <div className="sheet-detail-row">🏛 Historic: {selectedAttraction.tags.historic}</div>
              )}
              {selectedAttraction.tags?.natural && (
                <div className="sheet-detail-row">🌿 Natural: {selectedAttraction.tags.natural}</div>
              )}
              {selectedAttraction.wikipedia && (() => {
                const [lang, ...rest] = selectedAttraction.wikipedia.split(':');
                const wikiLang = rest.length ? lang : 'en';
                const article = rest.length ? rest.join(':') : lang;
                return (
                  <div className="sheet-detail-row">
                    <a
                      href={`https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(article)}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--primary)' }}
                    >
                      📖 Wikipedia
                    </a>
                  </div>
                );
              })()}
              <div className="sheet-detail-row" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>
                📍 {selectedAttraction.lat.toFixed(5)}, {selectedAttraction.lng.toFixed(5)}
              </div>
              <div style={{ marginTop: 12 }}>
                <button
                  className="btn-primary btn-sm"
                  onClick={() => {
                    setSelectedAttraction(null);
                    setShowSearch({
                      prefill: {
                        lat: selectedAttraction.lat,
                        lng: selectedAttraction.lng,
                        name: selectedAttraction.name,
                      },
                    });
                  }}
                >
                  + Add as stop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Compress an image File to a base64 JPEG at max width/height and given quality
function compressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function latLngToTile(lat, lng, zoom) {
  const x = Math.floor(((lng + 180) / 360) * (2 ** zoom));
  const y = Math.floor(
    (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2 * (2 ** zoom)
  );
  return { x, y };
}
