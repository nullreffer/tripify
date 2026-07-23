import React, { useState } from 'react';
import ReservationSheet from './ReservationSheet.jsx';

const ENTRY_ICONS = {
  ACTIVITY:      '🥾',
  TRAVEL:        '🚗',
  ACCOMMODATION: '🏕',
  NOTE:          '📝',
};

const ENTRY_LABELS = {
  ACTIVITY:      'Activity',
  TRAVEL:        'Travel',
  ACCOMMODATION: 'Accommodation',
  NOTE:          'Note',
};

const SHOWER_ICONS = { YES: '🚿', NO: '❌', UNKNOWN: '❓' };

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Entry Form ────────────────────────────────────────────────────────────────
function EntryForm({ initial = {}, onSave, onCancel }) {
  const [type, setType]               = useState(initial.type || 'ACTIVITY');
  const [title, setTitle]             = useState(initial.title || '');
  const [description, setDescription] = useState(initial.description || '');
  const [startTime, setStartTime]     = useState(initial.startTime || '');
  const [endTime, setEndTime]         = useState(initial.endTime || '');
  const [durationMins, setDuration]   = useState(initial.durationMins || '');
  const [fromLocation, setFrom]       = useState(initial.fromLocation || '');
  const [toLocation, setTo]           = useState(initial.toLocation || '');

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      type,
      title: title.trim(),
      description: description.trim() || null,
      startTime: startTime || null,
      endTime: endTime || null,
      durationMins: durationMins ? Number(durationMins) : null,
      fromLocation: fromLocation.trim() || null,
      toLocation: toLocation.trim() || null,
    });
  };

  return (
    <div className="entry-form">
      <div className="entry-form-row">
        <label>Type</label>
        <select value={type} onChange={e => setType(e.target.value)}>
          {Object.entries(ENTRY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{ENTRY_ICONS[k]} {v}</option>
          ))}
        </select>
      </div>
      <div className="entry-form-row">
        <label>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Hike Craters of the Moon" autoFocus />
      </div>
      {type === 'TRAVEL' && (
        <>
          <div className="entry-form-row">
            <label>From</label>
            <input value={fromLocation} onChange={e => setFrom(e.target.value)} placeholder="Starting location" />
          </div>
          <div className="entry-form-row">
            <label>To</label>
            <input value={toLocation} onChange={e => setTo(e.target.value)} placeholder="Destination" />
          </div>
        </>
      )}
      <div className="entry-form-row entry-form-times">
        <div>
          <label>Start time</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
        </div>
        <div>
          <label>End time</label>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
        </div>
        <div>
          <label>Duration (min)</label>
          <input type="number" min="0" value={durationMins} onChange={e => setDuration(e.target.value)} placeholder="e.g. 240" />
        </div>
      </div>
      <div className="entry-form-row">
        <label>Notes</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Optional notes" />
      </div>
      <div className="entry-form-actions">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={handleSave} disabled={!title.trim()}>Save</button>
      </div>
    </div>
  );
}

// ── Day Form ──────────────────────────────────────────────────────────────────
function DayForm({ initial = {}, onSave, onCancel }) {
  const [date, setDate]         = useState(initial.date ? initial.date.slice(0, 10) : '');
  const [title, setTitle]       = useState(initial.title || '');
  const [location, setLocation] = useState(initial.location || '');
  const [shower, setShower]     = useState(initial.shower || 'UNKNOWN');

  return (
    <div className="day-form">
      <div className="entry-form-row">
        <label>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className="entry-form-row">
        <label>Location</label>
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Grand Teton NP" autoFocus />
      </div>
      <div className="entry-form-row">
        <label>Day title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Optional label" />
      </div>
      <div className="entry-form-row">
        <label>Shower</label>
        <select value={shower} onChange={e => setShower(e.target.value)}>
          <option value="UNKNOWN">❓ Unknown</option>
          <option value="YES">🚿 Yes</option>
          <option value="NO">❌ No</option>
        </select>
      </div>
      <div className="entry-form-actions">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={() => onSave({ date: date || null, title: title || null, location: location || null, shower })}>Save</button>
      </div>
    </div>
  );
}

// ── Entry Card ────────────────────────────────────────────────────────────────
function EntryCard({ entry, dayId, onUpdate, onDelete, onReservation, tripId }) {
  const [editing, setEditing]     = useState(false);
  const [showRes, setShowRes]     = useState(false);
  const [showConfirm, setConfirm] = useState(false);

  const formatTime = (t) => {
    if (!t) return null;
    const [h, m] = t.split(':');
    const hour = Number(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${m} ${ampm}`;
  };

  const formatDur = (mins) => {
    if (!mins) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  };

  if (editing) {
    return (
      <div className="entry-card editing">
        <EntryForm
          initial={entry}
          onSave={data => { onUpdate(dayId, entry.id, data); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <>
      <div className="entry-card">
        <div className="entry-card-left">
          <span className="entry-icon">{ENTRY_ICONS[entry.type]}</span>
          <div className="entry-card-body">
            <div className="entry-card-header">
              <span className="entry-type-badge">{ENTRY_LABELS[entry.type]}</span>
              {entry.startTime && (
                <span className="entry-time">
                  {formatTime(entry.startTime)}
                  {entry.endTime && ` – ${formatTime(entry.endTime)}`}
                  {entry.durationMins && ` · ${formatDur(entry.durationMins)}`}
                </span>
              )}
            </div>
            <div className="entry-title">{entry.title}</div>
            {entry.type === 'TRAVEL' && entry.fromLocation && (
              <div className="entry-travel">{entry.fromLocation} → {entry.toLocation || '?'}</div>
            )}
            {entry.description && <div className="entry-desc">{entry.description}</div>}
            {entry.reservation && (
              <div className="entry-res-badge" onClick={() => setShowRes(true)}>
                🎫 {entry.reservation.confirmationNumber
                  ? `Confirmation: ${entry.reservation.confirmationNumber}`
                  : entry.reservation.name}
              </div>
            )}
          </div>
        </div>
        <div className="entry-card-actions">
          {entry.type === 'ACCOMMODATION' && (
            <button className="entry-action-btn" title="Reservation" onClick={() => setShowRes(true)}>🎫</button>
          )}
          <button className="entry-action-btn" title="Edit" onClick={() => setEditing(true)}>✏️</button>
          <button className="entry-action-btn danger" title="Delete" onClick={() => setConfirm(true)}>🗑</button>
        </div>
      </div>

      {showConfirm && (
        <div className="confirm-popover">
          <span>Delete this entry?</span>
          <button className="btn-danger-sm" onClick={() => { onDelete(dayId, entry.id); setConfirm(false); }}>Delete</button>
          <button className="btn-ghost-sm" onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      )}

      {showRes && (
        <ReservationSheet
          tripId={tripId}
          entry={entry}
          reservation={entry.reservation}
          onSave={(data) => { onReservation(entry.id, data); setShowRes(false); }}
          onClose={() => setShowRes(false)}
        />
      )}
    </>
  );
}

// ── Day Card ──────────────────────────────────────────────────────────────────
function DayCard({ day, onUpdate, onDelete, onAddEntry, onUpdateEntry, onDeleteEntry, onReservation, tripId }) {
  const [expanded, setExpanded]   = useState(true);
  const [addingEntry, setAdding]  = useState(false);
  const [editingDay, setEditing]  = useState(false);
  const [showConfirm, setConfirm] = useState(false);

  return (
    <div className="day-card">
      {/* Day header */}
      <div className="day-card-header" onClick={() => setExpanded(e => !e)}>
        <div className="day-card-header-left">
          <span className="day-chevron">{expanded ? '▾' : '▸'}</span>
          <div className="day-card-meta">
            {day.date && <span className="day-date">{formatDate(day.date)}</span>}
            {day.location && <span className="day-location">📍 {day.location}</span>}
            {day.title && <span className="day-title-label">{day.title}</span>}
          </div>
        </div>
        <div className="day-card-header-right" onClick={e => e.stopPropagation()}>
          <span className="day-shower" title="Shower available">{SHOWER_ICONS[day.shower]}</span>
          <button className="entry-action-btn" title="Edit day" onClick={() => setEditing(true)}>✏️</button>
          <button className="entry-action-btn danger" title="Delete day" onClick={() => setConfirm(true)}>🗑</button>
        </div>
      </div>

      {/* Edit day form */}
      {editingDay && (
        <div className="day-form-wrap">
          <DayForm
            initial={day}
            onSave={data => { onUpdate(day.id, data); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {/* Entries */}
      {expanded && (
        <div className="day-entries">
          {(day.entries || []).map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              dayId={day.id}
              onUpdate={onUpdateEntry}
              onDelete={onDeleteEntry}
              onReservation={onReservation}
              tripId={tripId}
            />
          ))}

          {addingEntry ? (
            <div className="entry-card adding">
              <EntryForm
                onSave={data => { onAddEntry(day.id, data); setAdding(false); }}
                onCancel={() => setAdding(false)}
              />
            </div>
          ) : (
            <button className="add-entry-btn" onClick={() => setAdding(true)}>
              + Add activity, travel, or accommodation
            </button>
          )}
        </div>
      )}

      {showConfirm && (
        <div className="confirm-popover">
          <span>Delete this day and all its entries?</span>
          <button className="btn-danger-sm" onClick={() => { onDelete(day.id); setConfirm(false); }}>Delete</button>
          <button className="btn-ghost-sm" onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ── Main DaysView ─────────────────────────────────────────────────────────────
export default function DaysView({ days, tripId, stops = [], onAddDay, onUpdateDay, onDeleteDay, onAddEntry, onUpdateEntry, onDeleteEntry, onAddReservation, onUpdateReservation }) {
  const handleReservation = async (entryId, data) => {
    // Find if there's already a reservation for this entry
    const day = days.find(d => (d.entries || []).some(e => e.id === entryId));
    const entry = day?.entries?.find(e => e.id === entryId);
    if (entry?.reservation) {
      await onUpdateReservation(entry.reservation.id, data);
    } else {
      await onAddReservation({ ...data, entryId });
    }
  };

  // Calculate shower info
  const noShowerStreak = (() => {
    let count = 0;
    for (const d of days) {
      if (d.shower === 'YES') break;
      if (d.shower === 'NO') count++;
    }
    return count;
  })();

  return (
    <div className="days-view">
      {/* Shower warning */}
      {noShowerStreak >= 3 && (
        <div className="days-shower-warning">
          🚿 No shower planned for {noShowerStreak} days in a row
        </div>
      )}

      {days.length === 0 && (
        <div className="days-empty">
          {stops.length > 0 ? (
            <>
              <p>Generating your itinerary from stops…</p>
              <p className="days-empty-sub">{stops.length} stop{stops.length !== 1 ? 's' : ''} will be used to build your itinerary.</p>
            </>
          ) : (
            <>
              <p>No stops added yet.</p>
              <p className="days-empty-sub">Add stops to your route and your itinerary will be built automatically.</p>
            </>
          )}
        </div>
      )}

      {days.map(day => (
        <DayCard
          key={day.id}
          day={day}
          onUpdate={onUpdateDay}
          onDelete={onDeleteDay}
          onAddEntry={onAddEntry}
          onUpdateEntry={onUpdateEntry}
          onDeleteEntry={onDeleteEntry}
          onReservation={handleReservation}
          tripId={tripId}
        />
      ))}
    </div>
  );
}
