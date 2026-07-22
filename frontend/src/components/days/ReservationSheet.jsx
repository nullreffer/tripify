import React, { useState } from 'react';

const FIELDS = [
  { key: 'provider',          label: 'Provider',             type: 'text' },
  { key: 'confirmationNumber',label: 'Confirmation #',       type: 'text' },
  { key: 'referenceNumber',   label: 'Reference #',          type: 'text' },
  { key: 'url',               label: 'Booking URL',          type: 'url' },
  { key: 'phone',             label: 'Phone',                type: 'tel' },
  { key: 'checkIn',           label: 'Check-in',             type: 'date' },
  { key: 'checkOut',          label: 'Check-out',            type: 'date' },
  { key: 'siteNumber',        label: 'Site #',               type: 'text' },
  { key: 'roomNumber',        label: 'Room #',               type: 'text' },
  { key: 'loop',              label: 'Loop',                 type: 'text' },
  { key: 'holder',            label: 'Reservation holder',   type: 'text' },
  { key: 'cost',              label: 'Cost',                 type: 'text' },
  { key: 'cancellationDeadline', label: 'Cancellation deadline', type: 'date' },
  { key: 'notes',             label: 'Notes',                type: 'textarea' },
];

function toInputValue(field, value) {
  if (!value) return '';
  if (field.type === 'date') return value.slice(0, 10);
  return value;
}

export default function ReservationSheet({ entry, reservation, onSave, onClose }) {
  const [name, setName]   = useState(reservation?.name || entry?.title || '');
  const [values, setValues] = useState(() => {
    const init = {};
    for (const f of FIELDS) {
      init[f.key] = toInputValue(f, reservation?.[f.key]);
    }
    return init;
  });

  const set = (key, val) => setValues(prev => ({ ...prev, [key]: val }));

  const handleSave = () => {
    const data = { name };
    for (const f of FIELDS) {
      data[f.key] = values[f.key] || null;
    }
    onSave(data);
  };

  return (
    <div className="sheet-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet res-sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h3>{reservation ? 'Edit Reservation' : 'Add Reservation'}</h3>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>

        <div className="res-form">
          <div className="res-form-row">
            <label>Reservation name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Gros Ventre Campground"
              autoFocus
            />
          </div>

          {FIELDS.map(f => (
            <div className="res-form-row" key={f.key}>
              <label>{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea
                  value={values[f.key]}
                  onChange={e => set(f.key, e.target.value)}
                  rows={2}
                  placeholder={`Optional ${f.label.toLowerCase()}`}
                />
              ) : (
                <input
                  type={f.type}
                  value={values[f.key]}
                  onChange={e => set(f.key, e.target.value)}
                  placeholder={f.type === 'text' || f.type === 'tel' ? `Optional` : undefined}
                />
              )}
            </div>
          ))}
        </div>

        <div className="sheet-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={!name.trim()}>
            {reservation ? 'Update' : 'Save'} Reservation
          </button>
        </div>
      </div>
    </div>
  );
}
