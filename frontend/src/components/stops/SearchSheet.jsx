import React, { useState, useRef, useEffect } from 'react';
import { searchLocations } from '../../services/geocoding.js';
import { PIN_TYPE_LIST } from '../../constants/pinTypes.js';

export default function SearchSheet({ prefill, onAdd, onClose }) {
  const [query, setQuery] = useState(prefill?.name || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(prefill ? {
    name: prefill.name,
    lat: prefill.lat,
    lng: prefill.lng,
    displayName: prefill.address,
  } : null);
  const [pinType, setPinType] = useState('GENERAL');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const debounce = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleQueryChange = (val) => {
    setQuery(val);
    clearTimeout(debounce.current);
    if (val.length < 3) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchLocations(val);
      setResults(res);
      setSearching(false);
    }, 400);
  };

  const handleSelect = (r) => {
    setSelected(r);
    setQuery(r.name);
    setResults([]);
  };

  const handleAdd = async () => {
    if (!selected) return;
    setAdding(true);
    await onAdd({ name: selected.name, address: selected.displayName, lat: selected.lat, lng: selected.lng, pinType, notes });
    setAdding(false);
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet sheet-tall" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />

        <div className="sheet-header">
          <h3>Add a Stop</h3>
          <button className="sheet-close" onClick={onClose}>×</button>
        </div>

        <div className="sheet-body">
          {/* Search input */}
          <div className="search-input-wrap">
            <span className="search-icon">🔍</span>
            <input
              ref={inputRef}
              className="search-input"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="Search for a place…"
              autoComplete="off"
            />
            {searching && <div className="spinner xs" />}
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="search-results">
              {results.map(r => (
                <div key={r.id} className="search-result" onClick={() => handleSelect(r)}>
                  <div className="search-result-name">{r.name}</div>
                  <div className="search-result-sub">{r.displayName}</div>
                </div>
              ))}
            </div>
          )}

          {/* Selected location form */}
          {selected && (
            <div className="search-selected">
              <div className="search-selected-label">
                📍 <strong>{selected.name}</strong>
                <span className="search-coords"> ({Number(selected.lat).toFixed(4)}, {Number(selected.lng).toFixed(4)})</span>
              </div>

              <label>Stop type</label>
              <div className="pin-type-grid compact">
                {PIN_TYPE_LIST.map(pt => (
                  <button
                    key={pt.value}
                    className={`pin-type-btn${pinType === pt.value ? ' active' : ''}`}
                    onClick={() => setPinType(pt.value)}
                    style={pinType === pt.value ? { borderColor: pt.color, background: pt.color + '22' } : {}}
                  >
                    <span>{pt.emoji}</span>
                    <span>{pt.label}</span>
                  </button>
                ))}
              </div>

              <label>Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any notes about this stop…"
                rows={2}
              />

              <button className="btn-primary btn-full" onClick={handleAdd} disabled={adding}>
                {adding ? 'Adding…' : '+ Add Stop'}
              </button>
            </div>
          )}

          {/* Empty state */}
          {!selected && results.length === 0 && !searching && (
            <p className="search-hint">Search for a city, landmark, address…</p>
          )}
        </div>
      </div>
    </div>
  );
}
