import React, { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function InviteModal({ trip, onClose }) {
  const [role, setRole] = useState('VIEWER');
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const generateLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/trips/${trip.id}/invites`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      const data = await res.json();
      if (res.ok) setLink(data.link);
      else setError(data.error);
    } catch {
      setError('Failed to generate link.');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join "${trip.title}" on Azitrip`,
          text: `You've been invited to join the trip "${trip.title}" on Azitrip!`,
          url: link
        });
      } catch {
        // User cancelled share or it failed — fall back to copy
        copyLink();
      }
    } else {
      copyLink();
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text in the input
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="invite-title">Invite someone to "{trip.title}"</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-form">
          {!link ? (
            <>
              <label>Permission level</label>
              <div className="role-selector">
                <button
                  type="button"
                  className={`role-option${role === 'PLANNER' ? ' role-option-active' : ''}`}
                  onClick={() => setRole('PLANNER')}
                >
                  <span className="role-icon">✏️</span>
                  <div>
                    <strong>Planner</strong>
                    <p>Can view and edit the trip</p>
                  </div>
                </button>
                <button
                  type="button"
                  className={`role-option${role === 'VIEWER' ? ' role-option-active' : ''}`}
                  onClick={() => setRole('VIEWER')}
                >
                  <span className="role-icon">👀</span>
                  <div>
                    <strong>Tagging Along</strong>
                    <p>Can view the trip only</p>
                  </div>
                </button>
              </div>

              {error && <p className="field-error">{error}</p>}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={generateLink}
                  disabled={loading}
                >
                  {loading ? 'Generating…' : 'Create Invite Link'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="invite-link-label">
                Share this one-time link — it can only be used once.
              </p>
              <div className="invite-link-box">
                <input
                  type="text"
                  readOnly
                  value={link}
                  onClick={e => e.target.select()}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>Done</button>
                <button type="button" className="btn-primary" onClick={handleShare}>
                  {copied ? '✓ Copied!' : navigator.share ? '📤 Share' : '📋 Copy Link'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default InviteModal;
