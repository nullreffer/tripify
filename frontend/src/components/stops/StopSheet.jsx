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

export default function StopSheet({ stop, stops, route, userLocation, onClose, onUpdate, onOpenNearbySearch = () => {}, onReach, onDelete, canEdit }) {
  const [tab, setTab] = useState('info');
  const [name, setName] = useState(stop.name);
  const [pinType, setPinType] = useState(stop.pinType);
  const [notes, setNotes] = useState(stop.notes || '');
  const [targetDate, setTargetDate] = useState(
    stop.targetDate ? new Date(stop.targetDate).toISOString().slice(0, 16) : ''
  );
  const [metadata, setMetadata] = useState(stop.metadata || {});
  const [saving, setSaving] = useState(false);

  const pt = PIN_TYPES[stop.pinType] || PIN_TYPES.GENERAL;
  const stopIdx = stops.findIndex(s => s.id === stop.id);
  const prevStop = stopIdx > 0 ? stops[stopIdx - 1] : null;
  const leg = route?.legs?.[stopIdx];

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
      : (prevStop ? `${prevStop.lat},${prevStop.lng}` : '');
    const isApple = /iPhone|iPad|Mac/.test(navigator.userAgent);
    const url = isApple
      ? `maps://maps.apple.com/?saddr=${fromCoords}&daddr=${to}`
      : `https://www.google.com/maps/dir/?api=1&origin=${fromCoords}&destination=${to}`;
    window.open(url, '_blank');
  };

  const metaFields = TYPE_METADATA[pinType] || [];

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
          {['info', canEdit && 'edit', 'nearby'].filter(Boolean).map(t => (
            <button
              key={t}
              className={`sheet-tab-pill${tab === t ? ' active' : ''}`}
              onClick={() => {
                if (t === 'nearby') {
                  onOpenNearbySearch();
                  return;
                }
                setTab(t);
              }}
            >
              {t === 'info' ? 'Info' : t === 'edit' ? '✏️ Edit' : '🔍 Nearby'}
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
              {stop.notes && <div className="sheet-notes">{stop.notes}</div>}

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
                {prevStop && (
                  <button className="sheet-action-btn" onClick={() => handleDirections(false)}>
                    🔁 From Prev
                  </button>
                )}
                {canEdit && (
                  <button
                    className={`sheet-action-btn${stop.reached ? ' btn-green' : ' btn-orange'}`}
                    onClick={onReach}
                  >
                    {stop.reached ? '↩ Unreached' : '✓ Reached'}
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
    </div>
  );
}
