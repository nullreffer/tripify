import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar.jsx';
import TripCard from '../components/TripCard.jsx';
import InviteModal from '../components/InviteModal.jsx';
import MiniMap from '../components/import/MiniMap.jsx';
import { searchLocations } from '../services/geocoding.js';
import { PIN_TYPES, PIN_TYPE_LIST } from '../constants/pinTypes.js';


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

  // Import flow states
  const [importMode, setImportMode] = useState(false);
  // step: 'upload' | 'processing' | 'review' | 'creating'
  const [importStep, setImportStep] = useState('upload');
  const [importCurrentMsg, setImportCurrentMsg] = useState('');
  const [geocodeProgress, setGeocodeProgress] = useState(null); // { current, total }
  const [previewData, setPreviewData] = useState(null);
  const [confirmedStops, setConfirmedStops] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [editingStop, setEditingStop] = useState(false);
  const [editQuery, setEditQuery] = useState('');
  const [editResults, setEditResults] = useState([]);
  const [editSearching, setEditSearching] = useState(false);

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

  const resetImport = () => {
    setImportStep('upload');
    setImportCurrentMsg('');
    setGeocodeProgress(null);
    setPreviewData(null);
    setConfirmedStops([]);
    setReviewIndex(0);
    setEditingStop(false);
    setEditQuery('');
    setEditResults([]);
  };

  const closeModal = () => {
    setShowModal(false);
    setNewTripTitle('');
    setImportMode(false);
    resetImport();
  };

  const handleImportSheet = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected if needed.
    e.target.value = '';

    resetImport();
    setImportStep('processing');
    setImportCurrentMsg('Uploading file…');

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE}/api/import/trip/preview`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }

      // Read the NDJSON stream line-by-line.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let event;
        try { event = JSON.parse(trimmed); } catch { return; }

        if (event.type === 'status') {
          setImportCurrentMsg(event.message);
        } else if (event.type === 'geocoding') {
          setGeocodeProgress({ current: event.current, total: event.total });
          setImportCurrentMsg(`Locating "${event.name}"… (${event.current}/${event.total})`);
        } else if (event.type === 'done') {
          const data = event.data;
          setPreviewData(data);
          setConfirmedStops(data.stops.map(s => ({ ...s })));
          setReviewIndex(0);
          setEditingStop(false);
          setEditQuery('');
          setEditResults([]);
          setImportStep('review');
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) processLine(line);
      }
      // Process any leftover bytes.
      if (buffer.trim()) processLine(buffer);

    } catch (err) {
      setError(err.message);
      setImportStep('upload');
      setImportCurrentMsg('');
    }
  };

  const handleConfirmStop = () => {
    const next = reviewIndex + 1;
    if (next >= confirmedStops.length) {
      // All stops reviewed — show a final summary before creating.
      setReviewIndex(next);
    } else {
      setEditingStop(false);
      setEditQuery('');
      setEditResults([]);
      setReviewIndex(next);
    }
  };

  const handleEditSearch = async () => {
    if (!editQuery.trim()) return;
    setEditSearching(true);
    const results = await searchLocations(editQuery);
    setEditResults(results);
    setEditSearching(false);
  };

  const handleSelectEditResult = (result) => {
    const updated = [...confirmedStops];
    updated[reviewIndex] = {
      ...updated[reviewIndex],
      address: result.displayName,
      lat: result.lat,
      lng: result.lng,
      geocodeOk: true,
    };
    setConfirmedStops(updated);
    setEditingStop(false);
    setEditQuery('');
    setEditResults([]);
  };

  const handleCreateConfirmed = async () => {
    setImportStep('creating');
    setImportCurrentMsg('Creating your trip…');

    try {
      const res = await fetch(`${API_BASE}/api/import/trip/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: previewData.title,
          description: previewData.description,
          startDate: previewData.startDate,
          endDate: previewData.endDate,
          stops: confirmedStops,
          items: previewData.items,
          days: previewData.days,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');

      await fetchTrips();
      setTimeout(() => { closeModal(); navigate(`/trips/${data.tripId}`); }, 400);
    } catch (err) {
      setError(err.message);
      setImportStep('review');
      setReviewIndex(confirmedStops.length); // keep on summary screen
    }
  };

  // ── Render helper: pin type selector in edit mode ──────────────────────────
  const renderPinTypeSelect = (stop, idx) => (
    <select
      className="import-pin-select"
      value={stop.pinType || 'GENERAL'}
      onChange={e => {
        const updated = [...confirmedStops];
        updated[idx] = { ...updated[idx], pinType: e.target.value };
        setConfirmedStops(updated);
      }}
    >
      {PIN_TYPE_LIST.map(pt => (
        <option key={pt.value} value={pt.value}>{pt.emoji} {pt.label}</option>
      ))}
    </select>
  );

  // ── Render import modal body based on current step ──────────────────────────
  const renderImportBody = () => {
    if (importStep === 'upload') {
      return (
        <div className="modal-form">
          <p className="modal-import-hint">
            Upload an Excel or CSV file — AI will read your trip data, geocode each stop, and let you confirm each location before creating the trip.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.ods,.tsv"
            style={{ display: 'none' }}
            onChange={handleImportSheet}
          />
          <button
            className="btn-primary btn-full"
            onClick={() => fileRef.current?.click()}
          >
            📂 Choose File
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setImportMode(false)} style={{ marginTop: '8px' }}>
            ← Back
          </button>
        </div>
      );
    }

    if (importStep === 'processing') {
      const pct = geocodeProgress ? Math.round((geocodeProgress.current / geocodeProgress.total) * 100) : null;
      return (
        <div className="import-processing-body">
          <div className="spinner import-spinner" />
          <p className="import-processing-status">{importCurrentMsg || 'Processing…'}</p>
          {pct !== null && (
            <div className="import-progress-track">
              <div className="import-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          )}
          <p className="import-processing-hint">This may take up to a minute. Please don't close this window.</p>
        </div>
      );
    }

    if (importStep === 'review') {
      const allDone = reviewIndex >= confirmedStops.length;

      if (allDone) {
        // Summary screen — show all stops for a final overview before creating.
        const unlocated = confirmedStops.filter(s => !s.lat || !s.lng);
        return (
          <div className="import-review-body">
            <p className="import-review-summary-title">✅ All stops reviewed</p>
            <p className="import-review-summary-sub">
              <strong>{previewData.title}</strong> — {confirmedStops.length} stop{confirmedStops.length !== 1 ? 's' : ''}
              {unlocated.length > 0 && <span className="import-warn"> · {unlocated.length} without a precise location</span>}
            </p>
            <ul className="import-stop-summary-list">
              {confirmedStops.map((s, i) => {
                const pt = PIN_TYPES[s.pinType] || PIN_TYPES.GENERAL;
                return (
                  <li key={i} className="import-stop-summary-item">
                    <span className="import-stop-summary-emoji">{pt.emoji}</span>
                    <span className="import-stop-summary-name">{s.name}</span>
                    {!s.lat && <span className="import-stop-no-loc-badge">⚠ no location</span>}
                    <button
                      className="import-stop-summary-edit"
                      onClick={() => { setReviewIndex(i); setEditingStop(true); setEditQuery(s.name); setEditResults([]); }}
                      title="Re-review this stop"
                    >✎</button>
                  </li>
                );
              })}
            </ul>
            <button className="btn-primary btn-full" style={{ marginTop: '12px' }} onClick={handleCreateConfirmed}>
              🚀 Create Trip
            </button>
          </div>
        );
      }

      const stop = confirmedStops[reviewIndex];
      const pt = PIN_TYPES[stop.pinType] || PIN_TYPES.GENERAL;
      const hasLocation = Number.isFinite(stop.lat) && Number.isFinite(stop.lng) && stop.lat !== 0 && stop.lng !== 0;

      return (
        <div className="import-review-body">
          <div className="import-review-progress">
            <span>Stop {reviewIndex + 1} of {confirmedStops.length}</span>
            <div className="import-review-progress-bar">
              <div className="import-review-progress-fill" style={{ width: `${((reviewIndex) / confirmedStops.length) * 100}%` }} />
            </div>
          </div>

          {!editingStop ? (
            <>
              <div className="import-review-stop-card">
                <div className="import-review-stop-header">
                  <span className="import-review-stop-emoji">{pt.emoji}</span>
                  <div>
                    <div className="import-review-stop-name">{stop.name}</div>
                    <div className="import-review-stop-address">
                      {stop.address || <span className="import-review-no-address">No address found</span>}
                    </div>
                  </div>
                </div>
                {renderPinTypeSelect(stop, reviewIndex)}
              </div>

              {hasLocation ? (
                <div className="import-review-map-wrapper">
                  <MiniMap lat={stop.lat} lng={stop.lng} pinType={stop.pinType} />
                </div>
              ) : (
                <div className="import-review-no-location">
                  ⚠️ Location could not be automatically found. Please search for it below.
                </div>
              )}

              <div className="import-review-actions">
                <button
                  className="import-action-edit"
                  onClick={() => { setEditingStop(true); setEditQuery(stop.name); setEditResults([]); }}
                >
                  ✎ Edit location
                </button>
                {hasLocation && (
                  <button className="import-action-confirm" onClick={handleConfirmStop}>
                    ✓ Looks good
                  </button>
                )}
                {!hasLocation && (
                  <button className="import-action-skip" onClick={handleConfirmStop} title="Add stop without a precise location">
                    Skip →
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="import-edit-location">
              <p className="import-edit-label">Search for a new location for <strong>{stop.name}</strong>:</p>
              <div className="import-edit-row">
                <input
                  className="import-edit-input"
                  value={editQuery}
                  onChange={e => { setEditQuery(e.target.value); setEditResults([]); }}
                  onKeyDown={e => e.key === 'Enter' && handleEditSearch()}
                  placeholder="e.g. Grand Canyon National Park, AZ"
                  autoFocus
                />
                <button className="import-edit-search-btn" onClick={handleEditSearch} disabled={editSearching}>
                  {editSearching ? '…' : '🔍'}
                </button>
              </div>

              {editResults.length > 0 && (
                <ul className="import-search-results">
                  {editResults.slice(0, 6).map((r, i) => (
                    <li key={i} className="import-search-result" onClick={() => handleSelectEditResult(r)}>
                      <span className="import-search-result-name">{r.name}</span>
                      <span className="import-search-result-addr">{r.displayName}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button className="btn-ghost btn-sm" onClick={() => { setEditingStop(false); setEditQuery(''); setEditResults([]); }}>
                  Cancel
                </button>
                {!hasLocation && (
                  <button className="import-action-skip" onClick={() => { setEditingStop(false); handleConfirmStop(); }}>
                    Skip →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (importStep === 'creating') {
      return (
        <div className="import-processing-body">
          <div className="spinner import-spinner" />
          <p className="import-processing-status">{importCurrentMsg || 'Creating your trip…'}</p>
        </div>
      );
    }

    return null;
  };

  const isReviewStep = importMode && (importStep === 'review');

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
          <div className={`modal${isReviewStep ? ' modal--wide' : ''}`} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="modal-title">
                {!importMode && 'New Trip'}
                {importMode && importStep === 'upload' && 'Import from Spreadsheet'}
                {importMode && importStep === 'processing' && 'Importing…'}
                {importMode && importStep === 'review' && (reviewIndex < (confirmedStops?.length || 0) ? 'Review Stops' : 'Confirm Trip')}
                {importMode && importStep === 'creating' && 'Creating Trip…'}
              </h3>
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
              renderImportBody()
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
