import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import CamperLogo from '../assets/logo.svg';

const API_BASE = import.meta.env.VITE_API_URL || '';

function InviteAccept() {
  const { token } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/invites/${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setInvite(data);
      })
      .catch(() => setError('Failed to load invite.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!user) {
      // Store token in sessionStorage, redirect to login, come back after
      sessionStorage.setItem('pendingInvite', token);
      window.location.href = `${API_BASE}/auth/google`;
      return;
    }

    setAccepting(true);
    try {
      const res = await fetch(`${API_BASE}/api/invites/${token}/accept`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        navigate('/', { replace: true });
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to accept invite. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="invite-page">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="invite-page">
      <div className="invite-card">
        <img src={CamperLogo} alt="Azitrip" className="invite-logo" />
        <h1 className="invite-app-name">Azitrip</h1>

        {error ? (
          <>
            <div className="invite-error">{error}</div>
            <button className="btn-primary" onClick={() => navigate('/')}>
              Go home
            </button>
          </>
        ) : (
          <>
            <p className="invite-from">
              <strong>{invite.invitedBy}</strong> invited you to join
            </p>
            <h2 className="invite-trip-name">{invite.tripTitle}</h2>
            <div className={`invite-role-badge role-${invite.role.toLowerCase()}`}>
              {invite.role === 'PLANNER' ? '✏️ Planner' : '👀 Tagging Along'}
            </div>
            <p className="invite-role-desc">
              {invite.role === 'PLANNER'
                ? 'You can view and edit this trip.'
                : 'You can view this trip.'}
            </p>
            <button className="btn-primary invite-accept-btn" onClick={handleAccept} disabled={accepting}>
              {accepting ? 'Joining…' : user ? 'Accept Invite' : 'Sign in & Accept'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default InviteAccept;
