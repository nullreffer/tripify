import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrip } from '../hooks/useTrip.js';
import { getRoute, formatDistance, formatDuration } from '../services/routing.js';
import { getSettings, useSettingsListener } from '../services/settings.js';
import TripMap from '../components/map/TripMap.jsx';
import StopList from '../components/stops/StopList.jsx';
import StopSheet from '../components/stops/StopSheet.jsx';
import SearchSheet from '../components/stops/SearchSheet.jsx';
import ItemsView from '../components/items/ItemsView.jsx';
import AiView from '../components/ai/AiView.jsx';
import MoreView from '../components/more/MoreView.jsx';
import DaysView from '../components/days/DaysView.jsx';
import TodayView from '../components/days/TodayView.jsx';

const TABS = [
  { key: 'map',   label: 'Map',   icon: '🗺️' },
  { key: 'stops', label: 'Stops', icon: '📍' },
  { key: 'days',  label: 'Days',  icon: '📅' },
  { key: 'items', label: 'Items', icon: '✅' },
  { key: 'ai',    label: 'AI',    icon: '✨' },
  { key: 'more',  label: 'More',  icon: '⋯' },
];

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

  // ── Geographic progress ─────────────────────────────────────────────
  const reachedCount = stops.filter(s => s.reached).length;
  const lastReachedIdx = stops.reduce((acc, s, i) => s.reached ? i : acc, -1);
  const completedDist = route?.legs
    ? route.legs.slice(0, Math.max(0, lastReachedIdx)).reduce((s, l) => s + (l.distance || 0), 0)
    : 0;
  const remainingDist = route ? (route.distance || 0) - completedDist : 0;
  const units = settings.units;

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
    const center = mapRef.current?.getCenter();
    if (center) {
      setShowSearch({ prefill: { lat: center.lat, lng: center.lng, name: 'Current area' } });
    } else {
      setShowSearch(true);
    }
  }, []);

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

  const nextStop = stops.find(s => !s.reached);

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
            stops={stops}
            route={route}
            userLocation={userLocation}
            onStopSelect={stop => { setSelectedStop(stop); setActiveTab('map'); }}
            onLongPress={handleLongPress}
            darkMode={darkMode}
          />

          {/* ── Map overlay control buttons ── */}
          <div className="ws-map-controls">
            <button className="map-ctrl-btn" title="Add a stop" onClick={() => setShowSearch(true)}>
              <span className="map-ctrl-icon">+</span>
            </button>
            <button className="map-ctrl-btn" title="My location" onClick={handleMyLocation}>
              <span className="map-ctrl-icon">◎</span>
            </button>
            <button className="map-ctrl-btn" title="Fit trip" onClick={handleFitTrip}>
              <span className="map-ctrl-icon">⊡</span>
            </button>
            <button className="map-ctrl-btn map-ctrl-search" title="Search this area" onClick={handleSearchArea}>
              <span className="map-ctrl-icon">🔍</span>
            </button>
            <button className="map-ctrl-btn map-ctrl-trails" title="Find trails on AllTrails" onClick={handleFindTrails}>
              <span className="map-ctrl-icon">🥾</span>
            </button>
          </div>

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
                <button className="ws-reach-btn" onClick={() => tripData.markReached(nextStop.id)}>
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
                onReached={tripData.markReached}
                onDelete={tripData.deleteStop}
                onAdd={() => setShowSearch(true)}
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
            tripData.markReached(selectedStop.id, !selectedStop.reached);
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
    </div>
  );
}
