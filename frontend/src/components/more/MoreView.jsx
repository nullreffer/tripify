import React, { useState } from 'react';
import { formatDistance, formatDuration } from '../../services/routing.js';

const REF_TYPES = ['GOOGLE_SHEET', 'BOOKING', 'DOCUMENT', 'LINK', 'OTHER'];
const REF_ICONS = { GOOGLE_SHEET: '📊', BOOKING: '🏨', DOCUMENT: '📄', LINK: '🔗', OTHER: '📎' };

// ── Readiness Dashboard ───────────────────────────────────────────────────────
function ReadinessDashboard({ stops, days, reservations, categories, route, onNavigate }) {
  const totalStops = stops.length;
  const reachedStops = stops.filter(s => s.reached).length;

  // Schedule conflicts: entries on same day with overlapping times
  const conflicts = [];
  for (const day of days) {
    const timed = (day.entries || []).filter(e => e.startTime && e.endTime);
    for (let i = 0; i < timed.length - 1; i++) {
      for (let j = i + 1; j < timed.length; j++) {
        const aEnd = timed[i].endTime;
        const bStart = timed[j].startTime;
        if (aEnd > bStart) {
          conflicts.push({ day, a: timed[i], b: timed[j] });
        }
      }
    }
  }

  // Nights without accommodation
  const nightsWithoutAccommodation = days.filter(d =>
    !(d.entries || []).some(e => e.type === 'ACCOMMODATION')
  ).length;

  // Packing progress
  const totalItems = categories.reduce((s, c) => s + (c.items?.length || 0), 0);
  const packedItems = categories.reduce((s, c) =>
    s + (c.items?.filter(i => i.status === 'packed' || i.done).length || 0), 0);
  const packingPct = totalItems > 0 ? Math.round((packedItems / totalItems) * 100) : null;

  // Shower streak without shower
  let noShowerStreak = 0;
  for (const d of days) {
    if (d.shower === 'YES') break;
    if (d.shower === 'NO') noShowerStreak++;
  }

  const items = [
    {
      icon: '🗺',
      label: 'Route',
      value: totalStops > 0 ? `${totalStops} stops planned` : 'No stops yet',
      status: totalStops > 0 ? 'ok' : 'warn',
      tab: 'stops',
    },
    {
      icon: '📅',
      label: 'Schedule',
      value: conflicts.length > 0 ? `${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}` : 'No conflicts',
      status: conflicts.length > 0 ? 'warn' : 'ok',
      tab: 'days',
    },
    {
      icon: '🏕',
      label: 'Accommodations',
      value: nightsWithoutAccommodation > 0
        ? `${nightsWithoutAccommodation} night${nightsWithoutAccommodation > 1 ? 's' : ''} without accommodation`
        : days.length > 0 ? 'All nights covered' : 'No days planned',
      status: nightsWithoutAccommodation > 0 ? 'warn' : 'ok',
      tab: 'days',
    },
    {
      icon: '📋',
      label: 'Packing',
      value: packingPct !== null ? `${packingPct}% packed` : 'No items',
      status: packingPct !== null && packingPct < 80 ? 'warn' : 'ok',
      tab: 'items',
    },
    ...(noShowerStreak >= 3 ? [{
      icon: '🚿',
      label: 'Showers',
      value: `No shower planned for ${noShowerStreak} days`,
      status: 'warn',
      tab: 'days',
    }] : []),
    {
      icon: '📍',
      label: 'Progress',
      value: totalStops > 0 ? `${reachedStops} of ${totalStops} stops reached` : 'Trip not started',
      status: 'ok',
      tab: 'map',
    },
  ];

  return (
    <div className="readiness-dashboard">
      <h3>Trip Readiness</h3>
      {items.map((item, i) => (
        <button
          key={i}
          className={`readiness-row readiness-${item.status}`}
          onClick={() => onNavigate && onNavigate(item.tab)}
        >
          <span className="readiness-icon">{item.icon}</span>
          <div className="readiness-body">
            <span className="readiness-label">{item.label}</span>
            <span className="readiness-value">{item.value}</span>
          </div>
          <span className="readiness-indicator">{item.status === 'ok' ? '✓' : '⚠️'}</span>
        </button>
      ))}
    </div>
  );
}

export default function MoreView({ trip, stops, route, references, days, reservations, categories, onAddReference, onDeleteReference, onUpdateTrip, onNavigate }) {
  const [editingTrip, setEditingTrip] = useState(false);
  const [title, setTitle] = useState(trip?.title || '');
  const [description, setDescription] = useState(trip?.description || '');
  const [startDate, setStartDate] = useState(trip?.startDate ? trip.startDate.slice(0, 10) : '');
  const [endDate, setEndDate] = useState(trip?.endDate ? trip.endDate.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);

  const [addingRef, setAddingRef] = useState(false);
  const [refName, setRefName] = useState('');
  const [refUrl, setRefUrl] = useState('');
  const [refType, setRefType] = useState('LINK');

  const reached = stops.filter(s => s.reached).length;
  const totalDist = route?.distance ? formatDistance(route.distance) : null;
  const totalDur = route?.duration ? formatDuration(route.duration) : null;

  const saveTrip = async () => {
    setSaving(true);
    await onUpdateTrip({ title, description, startDate: startDate || null, endDate: endDate || null });
    setSaving(false);
    setEditingTrip(false);
  };

  const addRef = async () => {
    if (!refName.trim() || !refUrl.trim()) return;
    await onAddReference({ name: refName.trim(), url: refUrl.trim(), refType });
    setRefName(''); setRefUrl(''); setRefType('LINK'); setAddingRef(false);
  };

  return (
    <div className="more-view">
      {/* Readiness Dashboard */}
      <ReadinessDashboard
        stops={stops}
        days={days || []}
        reservations={reservations || []}
        categories={categories || []}
        route={route}
        onNavigate={onNavigate}
      />

      {/* Trip Info */}
      <div className="more-section">
        <div className="more-section-hd">
          <h3>Trip Details</h3>
          {!editingTrip && <button className="btn-ghost btn-sm" onClick={() => setEditingTrip(true)}>✏️ Edit</button>}
        </div>

        {editingTrip ? (
          <div className="more-edit-form">
            <label>Trip name</label>
            <input value={title} onChange={e => setTitle(e.target.value)} />
            <label>Description</label>
            <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this trip about?" />
            <div className="more-dates">
              <div>
                <label>Start date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <label>End date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="more-edit-actions">
              <button className="btn-secondary btn-sm" onClick={() => setEditingTrip(false)}>Cancel</button>
              <button className="btn-primary btn-sm" onClick={saveTrip} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        ) : (
          <div className="more-trip-info">
            {trip?.description && <p className="more-description">{trip.description}</p>}
            {(trip?.startDate || trip?.endDate) && (
              <div className="more-dates-display">
                {trip.startDate && <span>📅 {new Date(trip.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                {trip.startDate && trip.endDate && <span>→</span>}
                {trip.endDate && <span>{new Date(trip.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="more-section">
        <h3>Trip Stats</h3>
        <div className="more-stats">
          <div className="more-stat">
            <span className="stat-num">{stops.length}</span>
            <span className="stat-label">stops</span>
          </div>
          <div className="more-stat">
            <span className="stat-num">{reached}</span>
            <span className="stat-label">reached</span>
          </div>
          {totalDist && (
            <div className="more-stat">
              <span className="stat-num">{totalDist}</span>
              <span className="stat-label">total dist</span>
            </div>
          )}
          {totalDur && (
            <div className="more-stat">
              <span className="stat-num">{totalDur}</span>
              <span className="stat-label">drive time</span>
            </div>
          )}
        </div>
      </div>

      {/* References */}
      <div className="more-section">
        <div className="more-section-hd">
          <h3>Links & Docs</h3>
          <button className="btn-primary btn-sm" onClick={() => setAddingRef(true)}>+ Add</button>
        </div>

        {addingRef && (
          <div className="add-ref-form">
            <select value={refType} onChange={e => setRefType(e.target.value)}>
              {REF_TYPES.map(t => <option key={t} value={t}>{REF_ICONS[t]} {t.replace('_', ' ')}</option>)}
            </select>
            <input value={refName} onChange={e => setRefName(e.target.value)} placeholder="Name" />
            <input value={refUrl} onChange={e => setRefUrl(e.target.value)} placeholder="URL" type="url" />
            <div className="add-ref-actions">
              <button className="btn-secondary btn-sm" onClick={() => setAddingRef(false)}>Cancel</button>
              <button className="btn-primary btn-sm" onClick={addRef}>Add</button>
            </div>
          </div>
        )}

        {references.length === 0 && !addingRef && (
          <p className="more-empty">No links added yet</p>
        )}

        <div className="ref-list">
          {references.map(ref => (
            <div key={ref.id} className="ref-item">
              <span className="ref-icon">{REF_ICONS[ref.refType] || '🔗'}</span>
              <a href={ref.url} target="_blank" rel="noopener noreferrer" className="ref-name">{ref.name}</a>
              <button className="ref-del-btn" onClick={() => onDeleteReference(ref.id)}>×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Members */}
      <div className="more-section">
        <h3>Members</h3>
        {(trip?.members || []).map(m => (
          <div key={m.userId} className="member-row">
            <div className="member-avatar">{m.user?.name?.[0]?.toUpperCase() || '?'}</div>
            <div className="member-info">
              <span className="member-name">{m.user?.name || 'Unknown'}</span>
              <span className="member-email">{m.user?.email}</span>
            </div>
            <span className={`member-role-badge member-role-${m.role.toLowerCase()}`}>{m.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
