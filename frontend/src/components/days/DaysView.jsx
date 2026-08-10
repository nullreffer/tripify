import React, { useMemo, useState } from 'react';
import ReservationSheet from './ReservationSheet.jsx';

const ENTRY_ICONS = {
  ACTIVITY: '🥾',
  TRAVEL: '🚗',
  ACCOMMODATION: '🏕',
  NOTE: '📝',
};

const ENTRY_LABELS = {
  ACTIVITY: 'Activity',
  TRAVEL: 'Travel',
  ACCOMMODATION: 'Accommodation',
  NOTE: 'Note',
};

const ITEM_STATUS_LABELS = {
  need_to_buy: 'Need to Buy',
  have: 'Have',
  need_to_pack: 'Need to Pack',
  packed: 'Packed',
  used: 'Used',
};

const SHOWER_ICONS = { YES: '🚿', NO: '❌', UNKNOWN: '❓' };

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(t) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hour = Number(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

function formatDuration(mins) {
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function parseTimeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return (hours * 60) + minutes;
}

function getEntryWindow(entry) {
  const start = parseTimeToMinutes(entry.startTime);
  const end = parseTimeToMinutes(entry.endTime);
  if (start == null) return null;
  if (end == null) return { start, end: null };
  return { start, end: end < start ? end + 1440 : end };
}

function isSameCalendarDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function addWarning(map, entryId, warning) {
  if (!map[entryId]) map[entryId] = [];
  if (!map[entryId].includes(warning)) map[entryId].push(warning);
}

function getEntryWarnings(day) {
  const warnings = {};
  const timedEntries = (day.entries || [])
    .map(entry => ({ entry, window: getEntryWindow(entry) }))
    .filter(item => item.window)
    .sort((a, b) => a.window.start - b.window.start || a.entry.order - b.entry.order);

  for (const { entry, window } of timedEntries) {
    if (entry.type === 'TRAVEL' && entry.durationMins && window.end != null) {
      const scheduledDuration = window.end - window.start;
      if (scheduledDuration < entry.durationMins) {
        addWarning(warnings, entry.id, `Travel needs ${formatDuration(entry.durationMins)}, but only ${formatDuration(scheduledDuration)} is scheduled.`);
      }
    }

    const checkIn = entry.reservation?.checkIn ? new Date(entry.reservation.checkIn) : null;
    const dayDate = day.date ? new Date(day.date) : null;
    if (checkIn && dayDate && isSameCalendarDay(dayDate, checkIn)) {
      const arrival = window.end ?? window.start;
      const checkInMinutes = (checkIn.getHours() * 60) + checkIn.getMinutes();
      if (arrival > checkInMinutes) {
        addWarning(warnings, entry.id, `Arrival is after reservation check-in at ${formatTime(`${String(checkIn.getHours()).padStart(2, '0')}:${String(checkIn.getMinutes()).padStart(2, '0')}`)}.`);
      }
    }
  }

  for (let i = 0; i < timedEntries.length - 1; i += 1) {
    const current = timedEntries[i];
    const next = timedEntries[i + 1];
    const currentEnd = current.window.end ?? current.window.start;
    const gap = next.window.start - currentEnd;

    if (current.window.end != null && next.window.start < current.window.end) {
      addWarning(warnings, current.entry.id, `Overlaps with "${next.entry.title}".`);
      addWarning(warnings, next.entry.id, `Overlaps with "${current.entry.title}".`);
    } else if (gap >= 0 && gap < 15) {
      addWarning(warnings, current.entry.id, `Only ${gap} minutes before "${next.entry.title}".`);
      addWarning(warnings, next.entry.id, `Only ${gap} minutes after "${current.entry.title}".`);
    }

    if (current.entry.type === 'TRAVEL' && current.entry.durationMins && current.window.start + current.entry.durationMins > next.window.start) {
      addWarning(warnings, current.entry.id, `Impossible arrival before "${next.entry.title}".`);
      addWarning(warnings, next.entry.id, `Starts before travel from "${current.entry.title}" could finish.`);
    }
  }

  return warnings;
}

function statusChip(item) {
  return ITEM_STATUS_LABELS[item.status] || 'Have';
}

function flattenItems(categories) {
  return (categories || []).flatMap(category => (category.items || []).map(item => ({
    ...item,
    categoryName: category.name
  })));
}

function RescheduleSheet({ days, onClose, onSubmit }) {
  const [delayHours, setDelayHours] = useState('1');
  const [fromDayId, setFromDayId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const validDelay = Number(delayHours);

  const handleSubmit = async () => {
    if (!Number.isFinite(validDelay) || validDelay <= 0) return;
    setSubmitting(true);
    try {
      await onSubmit({
        delayMinutes: Math.round(validDelay * 60),
        fromDayId: fromDayId || undefined
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sheet-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet res-sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h3>🕐 Running Behind</h3>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>

        <div className="res-form">
          <div className="res-form-row">
            <label>How many hours behind are you?</label>
            <input
              type="number"
              min="0.25"
              step="0.25"
              value={delayHours}
              onChange={e => setDelayHours(e.target.value)}
              autoFocus
            />
          </div>
          <div className="res-form-row">
            <label>Start rescheduling from</label>
            <select value={fromDayId} onChange={e => setFromDayId(e.target.value)}>
              <option value="">Today / upcoming entries</option>
              {days.map(day => (
                <option key={day.id} value={day.id}>
                  {formatDate(day.date) || 'Undated day'}{day.location ? ` · ${day.location}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="sheet-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting || !Number.isFinite(validDelay) || validDelay <= 0}>
            {submitting ? 'Updating…' : 'Shift itinerary'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EntryForm({ initial = {}, onSave, onCancel }) {
  const [type, setType] = useState(initial.type || 'ACTIVITY');
  const [title, setTitle] = useState(initial.title || '');
  const [description, setDescription] = useState(initial.description || '');
  const [startTime, setStartTime] = useState(initial.startTime || '');
  const [endTime, setEndTime] = useState(initial.endTime || '');
  const [durationMins, setDuration] = useState(initial.durationMins || '');
  const [fromLocation, setFrom] = useState(initial.fromLocation || '');
  const [toLocation, setTo] = useState(initial.toLocation || '');

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

function DayForm({ initial = {}, onSave, onCancel }) {
  const [date, setDate] = useState(initial.date ? initial.date.slice(0, 10) : '');
  const [title, setTitle] = useState(initial.title || '');
  const [location, setLocation] = useState(initial.location || '');
  const [shower, setShower] = useState(initial.shower || 'UNKNOWN');

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

function EntryCard({
  entry,
  dayId,
  categories,
  canEdit,
  warnings = [],
  onUpdate,
  onDelete,
  onReservation,
  onAddItemAssociation,
  onDeleteItemAssociation,
  tripId
}) {
  const [editing, setEditing] = useState(false);
  const [showRes, setShowRes] = useState(false);
  const [showConfirm, setConfirm] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');
  const associatedIds = useMemo(
    () => new Set((entry.itemAssociations || []).map(assoc => assoc.item?.id || assoc.itemId)),
    [entry.itemAssociations]
  );
  const availableItems = useMemo(
    () => flattenItems(categories).filter(item => !associatedIds.has(item.id)),
    [categories, associatedIds]
  );

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
      <div className={`entry-card${warnings.length ? ' entry-card-warning' : ''}`}>
        <div className="entry-card-left">
          <span className="entry-icon">{ENTRY_ICONS[entry.type]}</span>
          <div className="entry-card-body">
            <div className="entry-card-header">
              <span className="entry-type-badge">{ENTRY_LABELS[entry.type]}</span>
              {entry.startTime && (
                <span className="entry-time">
                  {formatTime(entry.startTime)}
                  {entry.endTime && ` – ${formatTime(entry.endTime)}`}
                  {entry.durationMins && ` · ${formatDuration(entry.durationMins)}`}
                </span>
              )}
              {warnings.length > 0 && <span className="entry-warning-badge">⚠️ {warnings.length}</span>}
            </div>
            <div className="entry-title">{entry.title}</div>
            {entry.type === 'TRAVEL' && entry.fromLocation && (
              <div className="entry-travel">{entry.fromLocation} → {entry.toLocation || '?'}</div>
            )}
            {entry.description && <div className="entry-desc">{entry.description}</div>}
            {warnings.length > 0 && (
              <div className="entry-warning-list">
                {warnings.map(warning => <div key={warning} className="entry-warning-text">⚠️ {warning}</div>)}
              </div>
            )}
            {entry.reservation && (
              <div className="entry-res-badge" onClick={() => setShowRes(true)}>
                🎫 {entry.reservation.confirmationNumber
                  ? `Confirmation: ${entry.reservation.confirmationNumber}`
                  : entry.reservation.name}
              </div>
            )}
            {((entry.itemAssociations || []).length > 0 || canEdit) && (
              <div className="entry-items-block">
                <div className="entry-items-header">
                  <span>🎒 Items</span>
                  {canEdit && (
                    <button className="entry-inline-btn" onClick={() => setShowItemPicker(prev => !prev)}>
                      {showItemPicker ? 'Hide' : 'Link item'}
                    </button>
                  )}
                </div>
                {(entry.itemAssociations || []).length > 0 && (
                  <div className="entry-items-list">
                    {entry.itemAssociations.map(assoc => (
                      <div key={assoc.id} className="entry-item-chip">
                        <span>{assoc.item?.name}</span>
                        <span className="entry-item-chip-status">{statusChip(assoc.item || {})}</span>
                        {canEdit && (
                          <button
                            className="entry-item-chip-remove"
                            onClick={() => onDeleteItemAssociation(assoc.item?.id || assoc.itemId, assoc.id)}
                            title="Remove item link"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canEdit && showItemPicker && (
                  <div className="entry-item-picker">
                    <select value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)}>
                      <option value="">Choose an existing item…</option>
                      {availableItems.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name}{item.categoryName ? ` · ${item.categoryName}` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn-primary btn-sm"
                      disabled={!selectedItemId}
                      onClick={() => {
                        onAddItemAssociation(selectedItemId, { entryId: entry.id });
                        setSelectedItemId('');
                        setShowItemPicker(false);
                      }}
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="entry-card-actions">
          {entry.type === 'ACCOMMODATION' && (
            <button className="entry-action-btn" title="Reservation" onClick={() => setShowRes(true)}>🎫</button>
          )}
          {canEdit && <button className="entry-action-btn" title="Edit" onClick={() => setEditing(true)}>✏️</button>}
          {canEdit && <button className="entry-action-btn danger" title="Delete" onClick={() => setConfirm(true)}>🗑</button>}
        </div>
      </div>

      {canEdit && showConfirm && (
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

function DayCard({
  day,
  categories,
  canEdit,
  warningsByEntry,
  onUpdate,
  onDelete,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onReservation,
  onAddItemAssociation,
  onDeleteItemAssociation,
  tripId
}) {
  const [expanded, setExpanded] = useState(true);
  const [addingEntry, setAdding] = useState(false);
  const [editingDay, setEditing] = useState(false);
  const [showConfirm, setConfirm] = useState(false);
  const dayWarningCount = Object.values(warningsByEntry || {}).reduce((sum, entryWarnings) => sum + entryWarnings.length, 0);

  return (
    <div className="day-card">
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
          {dayWarningCount > 0 && <span className="day-warning-badge">⚠️ {dayWarningCount}</span>}
          <span className="day-shower" title="Shower available">{SHOWER_ICONS[day.shower]}</span>
          {canEdit && <button className="entry-action-btn" title="Edit day" onClick={() => setEditing(true)}>✏️</button>}
          {canEdit && <button className="entry-action-btn danger" title="Delete day" onClick={() => setConfirm(true)}>🗑</button>}
        </div>
      </div>

      {canEdit && editingDay && (
        <div className="day-form-wrap">
          <DayForm
            initial={day}
            onSave={data => { onUpdate(day.id, data); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {expanded && (
        <div className="day-entries">
          {(day.entries || []).map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              dayId={day.id}
              categories={categories}
              canEdit={canEdit}
              warnings={warningsByEntry?.[entry.id] || []}
              onUpdate={onUpdateEntry}
              onDelete={onDeleteEntry}
              onReservation={onReservation}
              onAddItemAssociation={onAddItemAssociation}
              onDeleteItemAssociation={onDeleteItemAssociation}
              tripId={tripId}
            />
          ))}

          {canEdit && addingEntry ? (
            <div className="entry-card adding">
              <EntryForm
                onSave={data => { onAddEntry(day.id, data); setAdding(false); }}
                onCancel={() => setAdding(false)}
              />
            </div>
          ) : canEdit ? (
            <button className="add-entry-btn" onClick={() => setAdding(true)}>
              + Add activity, travel, or accommodation
            </button>
          ) : null}
        </div>
      )}

      {canEdit && showConfirm && (
        <div className="confirm-popover">
          <span>Delete this day and all its entries?</span>
          <button className="btn-danger-sm" onClick={() => { onDelete(day.id); setConfirm(false); }}>Delete</button>
          <button className="btn-ghost-sm" onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

export default function DaysView({
  days,
  tripId,
  stops = [],
  categories = [],
  canEdit = true,
  onAddDay,
  onUpdateDay,
  onDeleteDay,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onAddReservation,
  onUpdateReservation,
  onReschedule,
  onAddItemAssociation,
  onDeleteItemAssociation
}) {
  const [addingDay, setAddingDay] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleSummary, setRescheduleSummary] = useState(null);

  const warningsByDay = useMemo(() => {
    const result = {};
    for (const day of days) result[day.id] = getEntryWarnings(day);
    return result;
  }, [days]);

  const handleReservation = async (entryId, data) => {
    const day = days.find(d => (d.entries || []).some(e => e.id === entryId));
    const entry = day?.entries?.find(e => e.id === entryId);
    if (entry?.reservation) {
      await onUpdateReservation(entry.reservation.id, data);
    } else {
      await onAddReservation({ ...data, entryId });
    }
  };

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
      <div className="days-toolbar">
        <div>
          {noShowerStreak >= 3 && (
            <div className="days-shower-warning">
              🚿 No shower planned for {noShowerStreak} days in a row
            </div>
          )}
        </div>
        {canEdit && (
          <button className="btn-secondary btn-sm" onClick={() => setShowReschedule(true)}>
            🕐 Running Behind
          </button>
        )}
      </div>

      {rescheduleSummary && (
        <div className="days-reschedule-summary">
          <div>
            Shifted {rescheduleSummary.summary?.affectedEntries || 0} entries across {rescheduleSummary.summary?.affectedDays || 0} day(s) by {formatDuration(rescheduleSummary.summary?.delayMinutes || 0)}.
          </div>
          {(rescheduleSummary.reservationConflicts || []).length > 0 && (
            <div className="days-reschedule-conflicts">
              {(rescheduleSummary.reservationConflicts || []).map(conflict => (
                <div key={conflict.entryId}>
                  ⚠️ {conflict.reservationName} check-in ({formatTime(conflict.checkInTime)}) is now before the planned arrival.
                </div>
              ))}
            </div>
          )}
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
          categories={categories}
          canEdit={canEdit}
          warningsByEntry={warningsByDay[day.id]}
          onUpdate={onUpdateDay}
          onDelete={onDeleteDay}
          onAddEntry={onAddEntry}
          onUpdateEntry={onUpdateEntry}
          onDeleteEntry={onDeleteEntry}
          onReservation={handleReservation}
          onAddItemAssociation={onAddItemAssociation}
          onDeleteItemAssociation={onDeleteItemAssociation}
          tripId={tripId}
        />
      ))}

      {canEdit && addingDay ? (
        <div className="day-card adding">
          <DayForm
            onSave={data => { onAddDay(data); setAddingDay(false); }}
            onCancel={() => setAddingDay(false)}
          />
        </div>
      ) : canEdit ? (
        <button className="add-day-btn" onClick={() => setAddingDay(true)}>+ Add Day</button>
      ) : null}

      {showReschedule && (
        <RescheduleSheet
          days={days}
          onClose={() => setShowReschedule(false)}
          onSubmit={async (payload) => {
            const result = await onReschedule(payload);
            setRescheduleSummary(result);
          }}
        />
      )}
    </div>
  );
}
