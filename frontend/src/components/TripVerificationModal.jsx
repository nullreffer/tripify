import React from 'react';

export default function TripVerificationModal({ open, onClose, draft, onConfirm }) {
  if (!open) return null;
  const { draft: parsed } = draft || {};
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Verify auto-generated trip</h3>
        {!parsed && <p>No draft data available.</p>}
        {parsed && (
          <div>
            <p><strong>Title:</strong> {parsed.title || 'Untitled'}</p>
            <p><strong>Start:</strong> {parsed.start_date || '—'} &nbsp; <strong>End:</strong> {parsed.end_date || '—'}</p>
            <div>
              <h4>Stops</h4>
              {parsed.stops && parsed.stops.length ? parsed.stops.map((s, i) => (
                <div key={i} className="stop">
                  <div><strong>{s.name}</strong></div>
                  <div>{s.address || s.geocode?.display_name || 'No address'}</div>
                  <div>Arrival: {s.arrival_date || '—'} Dep: {s.departure_date || '—'}</div>
                  <div>{s.notes}</div>
                </div>
              )) : <div>No stops</div>}
            </div>
            <div className="modal-actions">
              <button onClick={() => onConfirm(parsed)}>Save trip</button>
              <button onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
