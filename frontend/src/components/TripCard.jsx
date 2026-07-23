import React from 'react';

const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #fda085 0%, #f6d365 100%)',
  'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
];

function getGradient(id) {
  const sum = [...id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return GRADIENTS[sum % GRADIENTS.length];
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

const ROLE_LABELS = {
  OWNER: { label: 'Owner', emoji: '👑' },
  PLANNER: { label: 'Planner', emoji: '✏️' },
  VIEWER: { label: 'Tagging Along', emoji: '👀' }
};

function TripCard({ trip, onInvite, onClick }) {
  const role = trip.memberRole || 'OWNER';
  const roleInfo = ROLE_LABELS[role] || ROLE_LABELS.OWNER;
  const canInvite = role === 'OWNER' || role === 'PLANNER';

  const memberAvatars = trip.members?.slice(0, 4) || [];

  return (
    <div className="trip-card" onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined }}>
      <div
        className="trip-card-banner"
        style={trip.coverImage
          ? { backgroundImage: `url(${trip.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: getGradient(trip.id) }
        }
      />
      <div className="trip-card-body">
        <div className="trip-card-top">
          <h3 className="trip-card-title">{trip.title}</h3>
          {canInvite && (
            <button
              className="invite-btn"
              onClick={e => { e.stopPropagation(); onInvite(trip); }}
              title="Invite someone"
              aria-label="Invite someone to this trip"
            >
              + Invite
            </button>
          )}
        </div>

        <div className="trip-card-meta">
          <span className="trip-card-date">Created {formatDate(trip.createdAt)}</span>
          <span className={`trip-role-badge role-${role.toLowerCase()}`}>
            {roleInfo.emoji} {roleInfo.label}
          </span>
        </div>

        {memberAvatars.length > 0 && (
          <div className="member-avatars">
            {memberAvatars.map(m => (
              <div key={m.user?.id || m.id} className="member-avatar" title={m.user?.name || ''}>
                {m.user?.avatar
                  ? <img src={m.user.avatar} alt={m.user.name} referrerPolicy="no-referrer" />
                  : <span>{m.user?.name?.[0]?.toUpperCase() || '?'}</span>}
              </div>
            ))}
            {trip.members?.length > 4 && (
              <div className="member-avatar member-avatar-more">+{trip.members.length - 4}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TripCard;

