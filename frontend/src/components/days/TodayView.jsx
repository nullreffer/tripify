import React from 'react';

const ENTRY_ICONS = {
  ACTIVITY:      '🥾',
  TRAVEL:        '🚗',
  ACCOMMODATION: '🏕',
  NOTE:          '📝',
};

function formatTime(t) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function isSameDay(isoDate, jsDate) {
  if (!isoDate) return false;
  const d = new Date(isoDate);
  return d.getFullYear() === jsDate.getFullYear() &&
         d.getMonth() === jsDate.getMonth() &&
         d.getDate() === jsDate.getDate();
}

export default function TodayView({ days, reservations, stops, onNavigate }) {
  const today = new Date();
  const todayDay = days.find(d => isSameDay(d.date, today));

  // If no day matches today, find the nearest upcoming day
  const upcomingDay = todayDay || days
    .filter(d => d.date && new Date(d.date) > today)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  // Next shower
  const nextShowerDay = days.find(d =>
    d.shower === 'YES' && d.date && new Date(d.date) >= today
  );

  // Today's reminders — items not yet packed
  const allItems = [];
  // (items passed via stops or categories — surface required unpacked items)

  // Upcoming reservations (next 3 days)
  const upcoming = reservations
    .filter(r => r.checkIn && new Date(r.checkIn) >= today)
    .sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn))
    .slice(0, 3);

  if (!todayDay && !upcomingDay) {
    return (
      <div className="today-view">
        <div className="today-empty">
          <p>📅 No days planned yet.</p>
          <p className="today-empty-sub">Add days in the Days tab to see your daily view.</p>
        </div>
      </div>
    );
  }

  const displayDay = todayDay || upcomingDay;
  const isToday = !!todayDay;

  return (
    <div className="today-view">
      {/* Header */}
      <div className="today-header">
        <div className="today-label">{isToday ? 'TODAY' : 'NEXT DAY'}</div>
        <div className="today-date">{formatDate(displayDay.date) || 'No date set'}</div>
        {displayDay.location && (
          <div className="today-location">📍 {displayDay.location}</div>
        )}
      </div>

      {/* Schedule */}
      <div className="today-section">
        <div className="today-section-title">Schedule</div>
        {(displayDay.entries || []).length === 0 ? (
          <div className="today-no-entries">No entries for this day yet.</div>
        ) : (
          <div className="today-timeline">
            {(displayDay.entries || []).map(entry => (
              <div className="today-entry" key={entry.id}>
                <div className="today-entry-time">
                  {entry.startTime ? formatTime(entry.startTime) : '—'}
                </div>
                <div className="today-entry-dot" />
                <div className="today-entry-body">
                  <span className="today-entry-icon">{ENTRY_ICONS[entry.type]}</span>
                  <div>
                    <div className="today-entry-title">{entry.title}</div>
                    {entry.type === 'TRAVEL' && entry.fromLocation && (
                      <div className="today-entry-sub">{entry.fromLocation} → {entry.toLocation || '?'}</div>
                    )}
                    {entry.type === 'ACCOMMODATION' && entry.reservation && (
                      <div className="today-entry-sub">
                        {entry.reservation.siteNumber && `Site ${entry.reservation.siteNumber}`}
                        {entry.reservation.loop && ` · Loop ${entry.reservation.loop}`}
                        {entry.reservation.confirmationNumber && (
                          <span> · #{entry.reservation.confirmationNumber}</span>
                        )}
                      </div>
                    )}
                    {entry.description && (
                      <div className="today-entry-desc">{entry.description}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shower */}
      <div className="today-section today-logistics">
        <div className="today-logistics-row">
          <span className="today-logistics-icon">🚿</span>
          <span className="today-logistics-label">Shower</span>
          <span className="today-logistics-value">
            {displayDay.shower === 'YES' ? 'Available today' :
             displayDay.shower === 'NO' ? (nextShowerDay
               ? `Next: ${formatDate(nextShowerDay.date)}`
               : 'None planned')
             : 'Unknown'}
          </span>
        </div>
      </div>

      {/* Upcoming reservations */}
      {upcoming.length > 0 && (
        <div className="today-section">
          <div className="today-section-title">Upcoming Reservations</div>
          {upcoming.map(r => (
            <div className="today-res-card" key={r.id}>
              <div className="today-res-name">{r.name}</div>
              {r.checkIn && (
                <div className="today-res-dates">
                  Check-in: {formatDate(r.checkIn)}
                  {r.checkOut && ` · Check-out: ${formatDate(r.checkOut)}`}
                </div>
              )}
              {r.confirmationNumber && (
                <div className="today-res-conf">Confirmation: {r.confirmationNumber}</div>
              )}
              {r.siteNumber && (
                <div className="today-res-conf">
                  Site {r.siteNumber}{r.loop && ` · Loop ${r.loop}`}
                </div>
              )}
              {r.url && (
                <a className="today-res-link" href={r.url} target="_blank" rel="noopener noreferrer">
                  Open Reservation ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Map shortcut */}
      <div className="today-actions">
        <button className="today-action-btn" onClick={() => onNavigate('map')}>🗺️ Open Map</button>
      </div>
    </div>
  );
}
