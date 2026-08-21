import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getNavigationRoute, formatDistance, formatDuration } from '../../services/routing.js';
import { useVoice } from '../../hooks/useVoice.js';

const API_BASE = import.meta.env.VITE_API_URL || '';
const STADIA_API_KEY = import.meta.env.VITE_STADIA_API_KEY || '';
const stadiaUrl = (path) => STADIA_API_KEY ? `${path}?api_key=${STADIA_API_KEY}` : path;

function makeUserIcon() {
  const html = `<div style="width:20px;height:20px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 3px rgba(59,130,246,.4),0 2px 6px rgba(0,0,0,.3);"></div>`;
  return L.divIcon({ html, className: '', iconSize: [20, 20], iconAnchor: [10, 10] });
}
function makeDestIcon() {
  const html = `<div style="width:32px;height:32px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:14px;">🏁</div>`;
  return L.divIcon({ html, className: '', iconSize: [32, 32], iconAnchor: [16, 32] });
}

/** Keeps the map centered on the user's current position. */
function MapFollower({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView([position.lat, position.lng], map.getZoom(), { animate: true });
  }, [position, map]);
  return null;
}

/**
 * NavigationView — full-screen, turn-by-turn, in-app navigation.
 *
 * Props:
 *   origin      — { lat, lng, name }
 *   destination — { lat, lng, name }
 *   tripId      — string (for AI assistant)
 *   currentStop — stop object (for AI context)
 *   nextStop    — stop object (for AI context)
 *   mapLayer    — string
 *   units       — 'imperial' | 'metric'
 *   onStop      — () => void — user exits navigation
 *   onAddStop   — (query) => void — called when voice assistant wants to add a stop
 */
export default function NavigationView({ origin, destination, tripId, currentStop, nextStop, mapLayer = 'normal', units = 'imperial', onStop, onAddStop }) {
  const [navRoute, setNavRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userPos, setUserPos] = useState(origin ? { lat: origin.lat, lng: origin.lng } : null);
  const [stepIdx, setStepIdx] = useState(0);
  const [assistantResponse, setAssistantResponse] = useState(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const watchIdRef = useRef(null);
  const lastAnnouncedRef = useRef(-1);
  const containerRef = useRef(null);

  const handleVoiceResult = useCallback(async (transcript) => {
    if (!tripId) return;
    setAssistantLoading(true);
    setAssistantResponse(null);
    try {
      const res = await fetch(`${API_BASE}/api/trips/${tripId}/ai/navigation-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          transcript,
          currentStop,
          nextStop,
          userLocation: userPos,
          remainingRoute: navRoute ? { distanceMeters: navRoute.distance } : null,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        setAssistantResponse(data);
        if (data.text) speak(data.text);
      }
    } catch { /* silent */ } finally {
      setAssistantLoading(false);
    }
  }, [tripId, currentStop, nextStop, userPos, navRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  const { supported: voiceSupported, listening, startListening, stopListening, speak, cancelSpeech } = useVoice({
    onResult: handleVoiceResult,
  });

  // ── Load route ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!origin || !destination) { setLoading(false); return; }
    getNavigationRoute(origin, destination).then(r => {
      setNavRoute(r);
      setLoading(false);
      if (r?.steps?.[0]) {
        speak(`Starting navigation to ${destination.name}. ${r.steps[0].instruction}`);
      }
    });
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Watch position ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // ── Auto-advance steps ────────────────────────────────────────────────────
  useEffect(() => {
    if (!navRoute?.steps?.length || !userPos) return;
    const steps = navRoute.steps;
    // Find the nearest step ahead
    let nearest = stepIdx;
    let nearestDist = Infinity;
    for (let i = stepIdx; i < steps.length; i++) {
      const loc = steps[i].location;
      if (!loc) continue;
      const [sLng, sLat] = loc;
      const d = Math.hypot(sLat - userPos.lat, sLng - userPos.lng) * 111320;
      if (d < nearestDist) { nearestDist = d; nearest = i; }
      if (d > nearestDist + 500) break; // too far, stop searching
    }
    // Advance step when within 50m of next step waypoint
    if (nearest !== stepIdx && nearestDist < 50) {
      setStepIdx(nearest);
      if (nearest !== lastAnnouncedRef.current && steps[nearest]) {
        lastAnnouncedRef.current = nearest;
        speak(steps[nearest].instruction);
      }
    }
  }, [userPos, navRoute, stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const tileUrl = mapLayer === 'dark'
    ? stadiaUrl('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png')
    : stadiaUrl('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png');

  const routeCoords = navRoute?.geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) || [];
  const currentStep = navRoute?.steps?.[stepIdx];
  const nextStepObj = navRoute?.steps?.[stepIdx + 1];
  const remainingDist = navRoute ? navRoute.distance * (1 - stepIdx / Math.max(1, navRoute.steps.length)) : null;

  return (
    <div className="navview-container" ref={containerRef}>
      {/* Top instruction banner */}
      <div className="navview-banner">
        {loading ? (
          <div className="navview-banner-text">Calculating route…</div>
        ) : currentStep ? (
          <>
            <div className="navview-step-icon">{stepArrow(currentStep.type, currentStep.modifier)}</div>
            <div className="navview-step-info">
              <div className="navview-step-instr">{currentStep.instruction}</div>
              {nextStepObj && (
                <div className="navview-step-next">then: {nextStepObj.instruction}</div>
              )}
            </div>
            <div className="navview-step-dist">{formatDistance(currentStep.distance, units)}</div>
          </>
        ) : (
          <div className="navview-banner-text">🏁 Arrived at {destination?.name}</div>
        )}
      </div>

      {/* Map */}
      <div className="navview-map-wrap">
        <MapContainer
          center={userPos ? [userPos.lat, userPos.lng] : [37.7749, -122.4194]}
          zoom={15}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url={tileUrl} />
          {userPos && <MapFollower position={userPos} />}
          {routeCoords.length > 1 && (
            <Polyline positions={routeCoords} color="#3b82f6" weight={6} opacity={0.85} />
          )}
          {userPos && <Marker position={[userPos.lat, userPos.lng]} icon={makeUserIcon()} />}
          {destination && <Marker position={[destination.lat, destination.lng]} icon={makeDestIcon()} />}
        </MapContainer>
      </div>

      {/* Bottom bar */}
      <div className="navview-bottom">
        <div className="navview-bottom-info">
          <div className="navview-dest-name">{destination?.name}</div>
          {navRoute && (
            <div className="navview-eta">
              {remainingDist != null && formatDistance(remainingDist, units)} remaining
            </div>
          )}
        </div>

        <div className="navview-bottom-actions">
          {/* Voice button */}
          {voiceSupported && (
            <button
              className={`navview-mic-btn${listening ? ' active' : ''}`}
              onClick={listening ? stopListening : startListening}
              title={listening ? 'Stop listening' : 'Voice command'}
            >
              {listening ? '🔴' : '🎙️'}
            </button>
          )}
          <button className="btn-secondary navview-stop-btn" onClick={() => { cancelSpeech(); onStop?.(); }}>
            ✕ Stop
          </button>
        </div>
      </div>

      {/* Assistant response overlay */}
      {(assistantLoading || assistantResponse) && (
        <div className="navview-assistant-overlay">
          {assistantLoading ? (
            <div className="navview-assistant-card">
              <div className="spinner xs" /> Thinking…
            </div>
          ) : assistantResponse && (
            <div className="navview-assistant-card">
              <button className="navview-assistant-close" onClick={() => setAssistantResponse(null)}>×</button>
              <div className="navview-assistant-text">{assistantResponse.text}</div>
              {assistantResponse.action?.type === 'add_stop' && (
                <button
                  className="btn-primary btn-sm"
                  onClick={() => {
                    onAddStop?.(assistantResponse.action.searchQuery);
                    setAssistantResponse(null);
                  }}
                >
                  + Add "{assistantResponse.action.searchQuery}" as next stop
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function stepArrow(type, modifier) {
  if (type === 'arrive') return '🏁';
  if (type === 'depart') return '🚦';
  if (type === 'roundabout' || type === 'rotary') return '🔄';
  if (modifier === 'left' || modifier === 'sharp left') return '⬅';
  if (modifier === 'right' || modifier === 'sharp right') return '➡';
  if (modifier === 'slight left') return '↖';
  if (modifier === 'slight right') return '↗';
  if (modifier === 'uturn') return '↩';
  return '⬆';
}
