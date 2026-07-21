import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrip } from '../hooks/useTrip.js';
import { getRoute, formatDistance, formatDuration } from '../services/routing.js';
import TripMap from '../components/map/TripMap.jsx';
import StopList from '../components/stops/StopList.jsx';
import StopSheet from '../components/stops/StopSheet.jsx';
import SearchSheet from '../components/stops/SearchSheet.jsx';
import ItemsView from '../components/items/ItemsView.jsx';
import AiView from '../components/ai/AiView.jsx';
import MoreView from '../components/more/MoreView.jsx';
import { useAuth } from '../App.jsx';

const TABS = [
  { key: 'map',   label: 'Map',   icon: '🗺️' },
  { key: 'stops', label: 'Stops', icon: '📍' },
  { key: 'items', label: 'Items', icon: '✅' },
  { key: 'ai',    label: 'AI',    icon: '✨' },
  { key: 'more',  label: 'More',  icon: '⋯' },
];

export default function TripWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tripData = useTrip(id);
  const { trip, stops, categories, references, loading, error, saveState } = tripData;

  const [activeTab, setActiveTab] = useState('map');
  const [selectedStop, setSelectedStop] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [route, setRoute] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [darkMode, setDarkMode] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // Detect dark mode changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = e => setDarkMode(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Get user location
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        () => {}
      );
    }
  }, []);

  // Recalculate route whenever stops change
  useEffect(() => {
    if (stops.length < 2) { setRoute(null); return; }
    getRoute(stops).then(setRoute);
  }, [stops]);

  const handleLongPress = useCallback(async (latlng) => {
    const { reverseGeocode } = await import('../services/geocoding.js');
    const geo = await reverseGeocode(latlng.lat, latlng.lng);
    setShowSearch({ prefill: { lat: latlng.lat, lng: latlng.lng, name: geo?.name || 'New Stop', address: geo?.address } });
  }, []);

  const handleAddStop = useCallback(async (stopData) => {
    await tripData.addStop(stopData);
    setShowSearch(false);
  }, [tripData]);

  const nextStop = stops.find(s => !s.reached);
  const reachedCount = stops.filter(s => s.reached).length;

  if (loading) return <div className="workspace-loading"><div className="spinner" /></div>;
  if (error) return <div className="workspace-error"><p>{error}</p><button onClick={() => navigate('/')}>← Back</button></div>;

  return (
    <div className={`workspace${darkMode ? ' workspace-dark' : ''}`}>
      {/* Top bar */}
      <div className="ws-topbar">
        <button className="ws-back" onClick={() => navigate('/')} aria-label="Back">←</button>
        <div className="ws-title">
          <span className="ws-trip-name">{trip?.title}</span>
          {saveState !== 'idle' && (
            <span className={`ws-save-state ws-save-${saveState}`}>
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Error saving'}
            </span>
          )}
        </div>
        <button className="ws-search-btn" onClick={() => setShowSearch(true)} aria-label="Search">🔍</button>
      </div>

      {/* Main content area */}
      <div className="ws-body">
        {/* Map — always rendered, panels overlay it */}
        <div className="ws-map-layer">
          <TripMap
            stops={stops}
            route={route}
            userLocation={userLocation}
            selectedStop={selectedStop}
            onStopSelect={setSelectedStop}
            onLongPress={handleLongPress}
            darkMode={darkMode}
          />
          {/* Map overlaid controls */}
          <div className="ws-map-controls">
            <button className="map-ctrl-btn" title="Add a stop" onClick={() => setShowSearch(true)}>+</button>
          </div>
          {/* Next stop strip */}
          {activeTab === 'map' && nextStop && (
            <div className="ws-next-strip">
              <div className="ws-next-info">
                <span className="ws-next-label">Next stop</span>
                <span className="ws-next-name">{nextStop.name}</span>
                {route?.legs?.[reachedCount] && (
                  <span className="ws-next-dist">
                    {formatDistance(route.legs[reachedCount]?.distance)} · {formatDuration(route.legs[reachedCount]?.duration)}
                  </span>
                )}
              </div>
              <div className="ws-next-actions">
                <button
                  className="ws-nav-btn"
                  onClick={() => {
                    const from = userLocation
                      ? `${userLocation[0]},${userLocation[1]}`
                      : '';
                    const to = `${nextStop.lat},${nextStop.lng}`;
                    const url = /iPhone|iPad|Mac/.test(navigator.userAgent)
                      ? `maps://maps.apple.com/?daddr=${to}`
                      : `https://www.google.com/maps/dir/?api=1&destination=${to}`;
                    window.open(url, '_blank');
                  }}
                >
                  Directions
                </button>
                <button
                  className="ws-reach-btn"
                  onClick={() => tripData.markReached(nextStop.id)}
                >
                  ✓ Reached
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Panel overlays */}
        {activeTab !== 'map' && (
          <div className="ws-panel">
            {activeTab === 'stops' && (
              <StopList
                stops={stops}
                route={route}
                onSelect={stop => { setSelectedStop(stop); setActiveTab('map'); }}
                onReorder={tripData.reorderStops}
                onReached={tripData.markReached}
                onDelete={tripData.deleteStop}
                onAdd={() => setShowSearch(true)}
              />
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
              <AiView tripId={id} tripName={trip?.title} />
            )}
            {activeTab === 'more' && (
              <MoreView
                trip={trip}
                stops={stops}
                route={route}
                references={references}
                onAddReference={tripData.addReference}
                onDeleteReference={tripData.deleteReference}
                onUpdateTrip={tripData.updateTrip}
              />
            )}
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
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

      {/* Stop detail sheet */}
      {selectedStop && (
        <StopSheet
          stop={selectedStop}
          stops={stops}
          route={route}
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

      {/* Add stop / search sheet */}
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
