import React, { useState } from 'react';
import { formatDistance, formatDuration } from '../../services/routing.js';

const REF_TYPES = ['GOOGLE_SHEET', 'BOOKING', 'DOCUMENT', 'LINK', 'OTHER'];
const REF_ICONS = { GOOGLE_SHEET: '📊', BOOKING: '🏨', DOCUMENT: '📄', LINK: '🔗', OTHER: '📎' };

export default function MoreView({ trip, stops, route, references, onAddReference, onDeleteReference, onUpdateTrip }) {
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
