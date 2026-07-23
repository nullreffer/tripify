import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrip } from '../hooks/useTrip.js';
import { getRoute, formatDistance, formatDuration } from '../services/routing.js';
import { getSettings, useSettingsListener } from '../services/settings.js';
import { searchNearby } from '../services/geocoding.js';
import TripMap from '../components/map/TripMap.jsx';
import StopList from '../components/stops/StopList.jsx';
import StopSheet from '../components/stops/StopSheet.jsx';
import SearchSheet from '../components/stops/SearchSheet.jsx';
import ItemsView from '../components/items/ItemsView.jsx';
import AiView from '../components/ai/AiView.jsx';
import MoreView from '../components/more/MoreView.jsx';
import DaysView from '../components/days/DaysView.jsx';
import TodayView from '../components/days/TodayView.jsx';
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

function resolveMapStyle(setting) {
  if (setting === 'light') return false;
  if (setting === 'dark')  return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export default function TripWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tripData = useTrip(id);
  const { trip, stops, categories, references, days, reservations, loading, error, saveState } = tripData;

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

  // Map area search mode
  const [mapSearchMode, setMapSearchMode] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState([]);
  const [mapSearching, setMapSearching] = useState(false);
  const [selectedSearchPin, setSelectedSearchPin] = useState(null);
  const [showMapFilters, setShowMapFilters] = useState(false);
  const mapSearchDebounce = useRef(null);

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
  useEffect(() => {
    if (stops.length < 2) { setRoute(null); return; }
    getRoute(stops).then(setRoute);
  }, [stops]);

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
  const reachedCount = stops.filter(s => s.reached).length;
  const lastReachedIdx = stops.reduce((acc, s, i) => s.reached ? i : acc, -1);
  const completedDist = route?.legs
    ? route.legs.slice(0, Math.max(0, lastReachedIdx)).reduce((s, l) => s + (l.distance || 0), 0)
    : 0;
  const remainingDist = route ? (route.distance || 0) - completedDist : 0;
  const units = settings.units;
  const availableStopTypes = [...new Set(stops.map(s => s.pinType).filter(Boolean))];

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
      const bounds = mapRef.current?.getBounds();
      const leafletBounds = bounds ? {
        north: bounds.getNorth(), south: bounds.getSouth(),
        east:  bounds.getEast(),  west:  bounds.getWest(),
      } : null;
      const results = await searchNearby(val, leafletBounds);
      setMapSearchResults(results);
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

  const handleAddSearchPin = useCallback(async (pin) => {
    const beforeAdd = [...stops]; // snapshot before adding
    const newStop = await tripData.addStop({
      name: pin.name,
      address: pin.displayName,
      lat: pin.lat,
      lng: pin.lng,
      pinType: guessPinType(pin),
      notes: '',
    });
    // Insert after nearest existing stop
    if (beforeAdd.length > 0 && newStop) {
      const nearestIdx = beforeAdd.reduce((best, s, i) => {
        const d = Math.hypot(s.lat - pin.lat, s.lng - pin.lng);
        return d < best.d ? { i, d } : best;
      }, { i: 0, d: Infinity }).i;
      const newOrder = [
        ...beforeAdd.slice(0, nearestIdx + 1),
        newStop,
        ...beforeAdd.slice(nearestIdx + 1),
      ];
      await tripData.reorderStops(newOrder);
    }
    exitMapSearch();
    setSelectedStop(newStop);
  }, [stops, tripData, exitMapSearch]);

  const handleFindTrails = useCallback(() => {
    const center = mapRef.current?.getCenter();
    if (center) {
      window.open(
        `https://www.alltrails.com/explore?lat=${center.lat.toFixed(4)}&lng=${center.lng.toFixed(4)}&zoom=11`,
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
    await tripData.addStop(stopData);
    setShowSearch(false);
  }, [tripData]);

  // Mark reached from any tab — always show photo prompt when marking as reached
  const handleMarkReached = useCallback(async (stopId, reached = true) => {
    await tripData.markReached(stopId, reached);
    if (reached !== false) {
      const stop = stops.find(s => s.id === stopId);
      if (stop) setPhotoPromptStop(stop);
    }
  }, [tripData, stops]);

  const nextStop = stops.find(s => !s.reached);
  const mapOverlayBottom = activeTab === 'map' && nextStop
    ? MAP_CONTROLS_BOTTOM_WITH_NEXT_STOP
    : MAP_CONTROLS_BOTTOM;

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

      {/* ── Main area ── */}
      <div className="ws-body">
        {/* Map always rendered */}
        <div className="ws-map-layer">
          <TripMap
            ref={mapRef}
            stops={stopTypeFilter ? stops.filter(s => s.pinType === stopTypeFilter) : stops}
            route={route}
            userLocation={userLocation}
            onStopSelect={stop => { setSelectedStop(stop); setActiveTab('map'); }}
            onLongPress={handleLongPress}
            darkMode={darkMode}
            searchPins={mapSearchResults}
            onSearchPinSelect={pin => setSelectedSearchPin(pin)}
            searchSelectedId={selectedSearchPin?.id}
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
                const typeMeta = PIN_TYPES[type] || PIN_TYPES.GENERAL || { emoji: '📍', label: type };
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
              <button
                className="btn-primary ws-spc-add"
                onClick={() => handleAddSearchPin(selectedSearchPin)}
              >
                + Add to Route
              </button>
            </div>
          )}

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
                <button className="ws-reach-btn" onClick={async () => {
                    await tripData.markReached(nextStop.id);
                    setPhotoPromptStop(nextStop);
                  }}>
                  ✓ Reached
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
                onSelect={stop => { setSelectedStop(stop); setActiveTab('map'); }}
                onReorder={tripData.reorderStops}
                onReached={handleMarkReached}
                onDelete={tripData.deleteStop}
                onAdd={() => setShowSearch(true)}
                filterType={stopTypeFilter}
                onFilterChange={setStopTypeFilter}
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
              <AiView tripId={id} tripName={trip?.title} stops={stops} route={route} units={units} />
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
          route={route}
          units={units}
          userLocation={userLocation}
          onClose={() => setSelectedStop(null)}
          onUpdate={async (updates) => {
            await tripData.updateStop(selectedStop.id, updates);
            setSelectedStop(prev => ({ ...prev, ...updates }));
          }}
          onReach={() => {
            const wasReached = selectedStop.reached;
            tripData.markReached(selectedStop.id, !wasReached);
            setSelectedStop(prev => ({ ...prev, reached: !prev.reached }));
            if (!wasReached) setPhotoPromptStop(selectedStop);
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
