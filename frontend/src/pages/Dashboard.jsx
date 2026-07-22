import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar.jsx';
import TripCard from '../components/TripCard.jsx';
import InviteModal from '../components/InviteModal.jsx';

const API_BASE = import.meta.env.VITE_API_URL || '';

function Dashboard() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTripTitle, setNewTripTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [inviteTarget, setInviteTarget] = useState(null);
  const [importMode, setImportMode] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    fetchTrips();
  }, []);

  const fetchTrips = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/trips`, { credentials: 'include' });
      if (res.ok) {
        setTrips(await res.json());
      }
    } catch {
      setError('Failed to load trips. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTrip = async (e) => {
    e.preventDefault();
    if (!newTripTitle.trim()) return;

    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/trips`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTripTitle.trim() })
      });

      if (res.ok) {
        const trip = await res.json();
        setNewTripTitle('');
        setShowModal(false);
        navigate(`/trips/${trip.id}`);
      }
    } catch {
      setError('Failed to create trip. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setNewTripTitle('');
    setImportMode(false);
    setImportStatus('');
  };

  const handleImportSheet = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCreating(true);
    setImportStatus('Reading spreadsheet…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      setImportStatus('Asking AI to parse your trip data…');
      const res = await fetch(`${API_BASE}/api/import/trip`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImportStatus(`Created "${data.title}" with ${data.stopsCreated} stops!`);
      await fetchTrips();
      setTimeout(() => { closeModal(); navigate(`/trips/${data.tripId}`); }, 800);
    } catch (err) {
      setError(err.message);
      setImportStatus('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="dashboard">
      <NavBar />

      <main className="main-content">
        <div className="trips-header">
          <h2 className="trips-title">My Trips</h2>
        </div>

        {loading ? (
          <div className="trips-status">
            <div className="spinner" />
          </div>
        ) : error ? (
          <div className="trips-status trips-error">{error}</div>
        ) : trips.length === 0 ? (
          <div className="trips-status trips-empty">
            <span className="empty-icon">🗺️</span>
            <p>No trips yet — hit the + button to create your first one!</p>
          </div>
        ) : (
          <div className="trips-grid">
            {trips.map(trip => (
              <TripCard key={trip.id} trip={trip} onInvite={setInviteTarget} onClick={() => navigate(`/trips/${trip.id}`)} />
            ))}
          </div>
        )}
      </main>

      {/* Floating action button */}
      <button
        className="fab"
        onClick={() => setShowModal(true)}
        aria-label="Create new trip"
        title="New trip"
      >
        +
      </button>

      {/* New trip modal */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="modal-title">New Trip</h3>
              <button className="modal-close" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>

            {!importMode ? (
              <>
                <form onSubmit={handleCreateTrip} className="modal-form">
                  <label htmlFor="trip-title">Trip Name</label>
                  <input
                    id="trip-title"
                    type="text"
                    value={newTripTitle}
                    onChange={e => setNewTripTitle(e.target.value)}
                    placeholder="e.g. Summer in Europe"
                    autoFocus
                    maxLength={100}
                  />
                  <div className="modal-actions">
                    <button type="button" className="btn-secondary" onClick={closeModal}>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={!newTripTitle.trim() || creating}
                    >
                      {creating ? 'Creating…' : 'Create Trip'}
                    </button>
                  </div>
                </form>
                <div className="modal-divider"><span>or</span></div>
                <button className="modal-import-btn" onClick={() => setImportMode(true)}>
                  📊 Import from spreadsheet
                </button>
              </>
            ) : (
              <div className="modal-form">
                <p className="modal-import-hint">
                  Upload an Excel or CSV file — AI will read your trip data and create stops automatically.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.ods,.tsv"
                  style={{ display: 'none' }}
                  onChange={handleImportSheet}
                />
                {importStatus ? (
                  <div className="modal-import-status">{importStatus}</div>
                ) : (
                  <button
                    className="btn-primary btn-full"
                    onClick={() => fileRef.current?.click()}
                    disabled={creating}
                  >
                    {creating ? 'Importing…' : '📂 Choose File'}
                  </button>
                )}
                <button className="btn-ghost btn-sm" onClick={() => setImportMode(false)} style={{ marginTop: '8px' }}>
                  ← Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {inviteTarget && (
        <InviteModal trip={inviteTarget} onClose={() => setInviteTarget(null)} />
      )}
    </div>
  );
}

export default Dashboard;
