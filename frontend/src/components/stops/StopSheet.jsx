import React, { useState } from 'react';
import { PIN_TYPES, PIN_TYPE_LIST } from '../../constants/pinTypes.js';
import { formatDistance, formatDuration } from '../../services/routing.js';

const TYPE_METADATA = {
  HOTEL: [
    { key: 'confirmationNumber', label: 'Confirmation #', type: 'text' },
    { key: 'checkIn', label: 'Check-in', type: 'datetime-local' },
    { key: 'checkOut', label: 'Check-out', type: 'datetime-local' },
    { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'website', label: 'Website', type: 'url' },
  ],
  STAY: [
    { key: 'confirmationNumber', label: 'Confirmation #', type: 'text' },
    { key: 'checkIn', label: 'Check-in', type: 'datetime-local' },
    { key: 'checkOut', label: 'Check-out', type: 'datetime-local' },
    { key: 'phone', label: 'Phone', type: 'tel' },
  ],
  CAMPGROUND: [
    { key: 'siteNumber', label: 'Site #', type: 'text' },
    { key: 'confirmationNumber', label: 'Confirmation #', type: 'text' },
    { key: 'checkIn', label: 'Check-in', type: 'datetime-local' },
    { key: 'checkOut', label: 'Check-out', type: 'datetime-local' },
    { key: 'phone', label: 'Phone', type: 'tel' },
  ],
  HIKING_TRAIL: [
    { key: 'trailLength', label: 'Length (mi)', type: 'text' },
    { key: 'elevationGain', label: 'Elevation gain (ft)', type: 'text' },
    { key: 'difficulty', label: 'Difficulty', type: 'text' },
    { key: 'trailUrl', label: 'Trail URL', type: 'url' },
  ],
};

const RESERVATION_PROVIDERS = [
  { name: 'Hotels', appUrl: 'hotels://', webBase: 'https://www.hotels.com/search.do?q-destination=' },
  { name: 'Booking', appUrl: 'booking://searchresults?ss=', webBase: 'https://www.booking.com/searchresults.html?ss=' },
  { name: 'Airbnb', appUrl: 'airbnb://search?query=', webBase: 'https://www.airbnb.com/s/' },
  { name: 'VRBO', appUrl: 'vrbo://search?query=', webBase: 'https://www.vrbo.com/search/keywords:' },
  { name: 'recreation.gov', appUrl: 'recreationgov://', webBase: 'https://www.recreation.gov/search?q=' },
  { name: 'parks.canada.ca', appUrl: 'parkscanada://', webBase: 'https://parks.canada.ca/recherche-search?query=' },
  { name: 'Xanterra', appUrl: 'xanterra://', webBase: 'https://www.xanterra.com/search/?q=' },
];

// Approximate kilometers per degree of latitude/longitude at mid-latitudes
const KM_PER_DEGREE = 111;

export default function StopSheet({ stop, stops, route, userLocation, onClose, onUpdate, onOpenNearbySearch, onAskWhatsAround, onReach, onDelete, canEdit }) {
  const [tab, setTab] = useState('info');
  const [name, setName] = useState(stop.name);
  const [pinType, setPinType] = useState(stop.pinType);
  const [notes, setNotes] = useState(stop.notes || '');
  const [targetDate, setTargetDate] = useState(
    stop.targetDate ? new Date(stop.targetDate).toISOString().slice(0, 16) : ''
  );
  const [metadata, setMetadata] = useState(stop.metadata || {});
  const [showReservationMenu, setShowReservationMenu] = useState(false);
  const [saving, setSaving] = useState(false);

  const isSaved = !!stop?.metadata?.savedForLater;
  const pt = PIN_TYPES[stop.pinType] || PIN_TYPES.GENERAL;

  // For route stops: use the stop's index in the route stops list for leg lookup
  const routeStops = stops.filter(s => !s?.metadata?.savedForLater);
  const stopIdx = routeStops.findIndex(s => s.id === stop.id);
  const prevStop = stopIdx > 0 ? routeStops[stopIdx - 1] : null;
  const leg = !isSaved ? route?.legs?.[stopIdx] : null;

  // For saved stops: find nearest route stop by straight-line distance
  const nearestRouteStop = isSaved && routeStops.length > 0
    ? routeStops.reduce((best, s) => {
        const d = Math.hypot(s.lat - stop.lat, s.lng - stop.lng);
        return d < best.d ? { stop: s, d } : best;
      }, { stop: routeStops[0], d: Infinity }).stop
    : null;

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({ name, pinType, notes, targetDate: targetDate || null, metadata });
    setSaving(false);
    setTab('info');
  };

  const handleDirections = (fromCurrentLocation) => {
    const to = `${stop.lat},${stop.lng}`;
    const fromCoords = fromCurrentLocation
      ? (userLocation ? `${userLocation[0]},${userLocation[1]}` : '')
      : (prevStop ? `${prevStop.lat},${prevStop.lng}` : nearestRouteStop ? `${nearestRouteStop.lat},${nearestRouteStop.lng}` : '');
    const isApple = /iPhone|iPad|Mac/.test(navigator.userAgent);
    const url = isApple
      ? `maps://maps.apple.com/?saddr=${fromCoords}&daddr=${to}`
      : `https://www.google.com/maps/dir/?api=1&origin=${fromCoords}&destination=${to}`;
    window.open(url, '_blank');
  };

  const metaFields = TYPE_METADATA[pinType] || [];
  const isStayType = ['HOTEL', 'STAY', 'CAMPGROUND'].includes(pinType);

  const openReservationProvider = (provider) => {
    const q = encodeURIComponent(stop.name || '');
    const webUrl = `${provider.webBase}${q}`;
    if (!provider.appUrl) {
      window.open(webUrl, '_blank');
      return;
    }
    const appUrl = `${provider.appUrl}${q}`;
    const fallback = setTimeout(() => window.open(webUrl, '_blank', 'noopener'), 900);
    window.location.href = appUrl;
    setTimeout(() => clearTimeout(fallback), 1200);
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />

        {/* Header */}
        <div className="sheet-header">
          <div className="sheet-title-row">
            <span className="sheet-emoji">{pt.emoji}</span>
            <div>
              <h3 className="sheet-name">{stop.name}</h3>
              <span className="sheet-type">{pt.label}</span>
            </div>
          </div>
          <button className="sheet-close" onClick={onClose}>×</button>
        </div>

        {/* Tab pills */}
        <div className="sheet-tabs">
          {['info', canEdit && 'edit'].filter(Boolean).map(t => (
            <button
              key={t}
              className={`sheet-tab-pill${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'info' ? 'Info' : '✏️ Edit'}
            </button>
          ))}
        </div>

        <div className="sheet-body">
          {/* ── Info tab ── */}
          {tab === 'info' && (
            <>
              {metadata?.photo && (
                <img
                  src={metadata.photo}
                  alt={`${stop.name} stop`}
                  className="sheet-photo"
                />
              )}
              {stop.address && <p className="sheet-address">{stop.address}</p>}
              {stop.targetDate && (
                <div className="sheet-detail-row">
                  🗓 {new Date(stop.targetDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              )}
              {leg && (
                <div className="sheet-detail-row">
                  🛣 {formatDistance(leg.distance)} · {formatDuration(leg.duration)} from previous stop
                </div>
              )}
              {isSaved && nearestRouteStop && (
                <div className="sheet-detail-row">
                  📍 Nearest route pin: <strong>{nearestRouteStop.name}</strong>
                  {' '}                  ({(Math.hypot(nearestRouteStop.lat - stop.lat, nearestRouteStop.lng - stop.lng) * KM_PER_DEGREE).toFixed(0)} km away)
                </div>
              )}
              {stop.notes && <div className="sheet-notes">{stop.notes}</div>}
              {isStayType && (metadata?.checkIn || metadata?.checkOut) && (
                <div className="sheet-detail-row">
                  🕒
                  <span style={{ marginLeft: '6px' }}>
                    {metadata.checkIn ? `Check-in: ${new Date(metadata.checkIn).toLocaleString()}` : 'Check-in: —'}
                    {' · '}
                    {metadata.checkOut ? `Check-out: ${new Date(metadata.checkOut).toLocaleString()}` : 'Check-out: —'}
                  </span>
                </div>
              )}

              {/* Type-specific metadata display */}
              {metaFields.map(f => metadata[f.key] && (
                <div key={f.key} className="sheet-detail-row">
                  <strong>{f.label}:</strong> {metadata[f.key]}
                </div>
              ))}

              {/* Action buttons */}
              <div className="sheet-actions">
                <button className="sheet-action-btn" onClick={() => handleDirections(true)}>
                  📍 From Here
                </button>
                {!isSaved && prevStop && (
                  <button className="sheet-action-btn" onClick={() => handleDirections(false)}>
                    🔁 From Prev
                  </button>
                )}
                {isSaved && nearestRouteStop && (
                  <button className="sheet-action-btn" onClick={() => handleDirections(false)}>
                    🔁 From Nearest
                  </button>
                )}
                <button className="sheet-action-btn" onClick={onOpenNearbySearch}>
                  🔍 Nearby
                </button>
                <button className="sheet-action-btn" onClick={onAskWhatsAround}>
                  ✨ What’s around
                </button>
                {isStayType && (
                  <button className="sheet-action-btn" onClick={() => setShowReservationMenu(true)}>
                    🏨 Open reservation
                  </button>
                )}
                {canEdit && (
                  <button
                    className={`sheet-action-btn${stop.reached ? ' btn-green' : ' btn-orange'}`}
                    onClick={onReach}
                  >
                    {stop.reached ? '↩ Unarrived' : '✓ Arrived'}
                  </button>
                )}
                {canEdit && (
                  <button className="sheet-action-btn btn-danger" onClick={() => { onClose(); onDelete(); }}>
                    🗑 Remove
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── Edit tab ── */}
          {tab === 'edit' && canEdit && (
            <div className="sheet-edit-form">
              <label>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} />

              <label>Type</label>
              <div className="pin-type-grid">
                {PIN_TYPE_LIST.map(pt => (
                  <button
                    key={pt.value}
                    className={`pin-type-btn${pinType === pt.value ? ' active' : ''}`}
                    onClick={() => setPinType(pt.value)}
                    style={pinType === pt.value ? { borderColor: pt.color, background: pt.color + '22' } : {}}
                  >
                    <span>{pt.emoji}</span>
                    <span>{pt.label}</span>
                  </button>
                ))}
              </div>

              <label>Target Date & Time</label>
              <input type="datetime-local" value={targetDate} onChange={e => setTargetDate(e.target.value)} />

              <label>Notes</label>
              <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes…" />

              {metaFields.length > 0 && <div className="meta-section-label">Details</div>}
              {metaFields.map(f => (
                <div key={f.key}>
                  <label>{f.label}</label>
                  <input
                    type={f.type}
                    value={metadata[f.key] || ''}
                    onChange={e => setMetadata(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}

              <div className="sheet-edit-actions">
                <button className="btn-secondary" onClick={() => setTab('info')}>Cancel</button>
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showReservationMenu && (
        <div className="sheet-overlay" onClick={() => setShowReservationMenu(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h3>Open reservation in…</h3>
              <button className="sheet-close" onClick={() => setShowReservationMenu(false)}>×</button>
            </div>
            <div className="sheet-body">
              <div className="reservation-provider-grid">
                {RESERVATION_PROVIDERS.map(provider => (
                  <button
                    key={provider.name}
                    className="sheet-action-btn"
                    onClick={() => openReservationProvider(provider)}
                  >
                    {provider.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
