import React, { useMemo, useRef, useState } from 'react';
import { ITEM_COLORS } from '../../constants/pinTypes.js';

const API = import.meta.env.VITE_API_URL || '';

const ITEM_STATUSES = [
  { key: 'need_to_buy', label: 'Need to Buy', icon: '🛒', color: '#ef4444' },
  { key: 'have', label: 'Have', icon: '📦', color: '#94a3b8' },
  { key: 'need_to_pack', label: 'Need to Pack', icon: '🎒', color: '#f97316' },
  { key: 'packed', label: 'Packed', icon: '✅', color: '#22c55e' },
  { key: 'used', label: 'Used', icon: '🗑', color: '#64748b' },
];

function nextStatus(current) {
  const keys = ITEM_STATUSES.map(s => s.key);
  const idx = keys.indexOf(current);
  return keys[(idx + 1) % keys.length];
}

function StatusBadge({ status, onClick }) {
  const s = ITEM_STATUSES.find(x => x.key === status) || ITEM_STATUSES[1];
  return (
    <button
      className="item-status-btn"
      style={{ color: s.color }}
      onClick={onClick}
      title={`Status: ${s.label}${onClick ? ' (click to cycle)' : ''}`}
      disabled={!onClick}
    >
      {s.icon}
    </button>
  );
}

function ColorDot({ color, selected, onClick }) {
  const noColor = color == null;
  return (
    <button
      className={`color-dot${selected ? ' selected' : ''}`}
      style={{ background: noColor ? 'transparent' : color, border: noColor ? '1.5px dashed #94a3b8' : 'none' }}
      onClick={onClick}
      title={color ?? 'none'}
    />
  );
}

function associationLabel(assoc) {
  if (assoc.entry) {
    const date = assoc.entry.day?.date ? new Date(assoc.entry.day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
    return `${date ? `${date} · ` : ''}${assoc.entry.title}`;
  }
  if (assoc.day) {
    const date = assoc.day.date ? new Date(assoc.day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
    return `${date ? `${date} · ` : ''}${assoc.day.location || assoc.day.title || 'Trip day'}`;
  }
  return 'Linked';
}

function ItemForm({ initial = {}, onSave, onCancel, submitLabel = 'Save Item' }) {
  const [name, setName] = useState(initial.name || '');
  const [quantity, setQuantity] = useState(initial.quantity ?? '');
  const [unit, setUnit] = useState(initial.unit || '');
  const [notes, setNotes] = useState(initial.notes || '');
  const [required, setRequired] = useState(Boolean(initial.required));
  const [status, setStatus] = useState(initial.status || 'have');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      quantity: quantity === '' ? null : Number(quantity),
      unit: unit.trim() || null,
      notes: notes.trim() || null,
      required,
      status
    });
  };

  return (
    <div className="item-detail-panel">
      <div className="item-detail-grid">
        <div className="entry-form-row">
          <label>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>
        <div className="entry-form-row">
          <label>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            {ITEM_STATUSES.map(itemStatus => (
              <option key={itemStatus.key} value={itemStatus.key}>{itemStatus.icon} {itemStatus.label}</option>
            ))}
          </select>
        </div>
        <div className="entry-form-row">
          <label>Quantity</label>
          <input type="number" min="0" step="0.25" value={quantity} onChange={e => setQuantity(e.target.value)} />
        </div>
        <div className="entry-form-row">
          <label>Unit</label>
          <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. pairs" />
        </div>
        <div className="entry-form-row item-detail-notes">
          <label>Notes</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
        </div>
      </div>
      <label className="item-required-toggle">
        <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />
        Required item
      </label>
      <div className="entry-form-actions">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={handleSave} disabled={!name.trim()}>{submitLabel}</button>
      </div>
    </div>
  );
}

function ItemRow({ item, catId, onUpdate, onDelete, canEdit }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [showColors, setShowColors] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const status = item.status || 'have';
  const isPacked = status === 'packed' || item.done;

  const saveEdit = async () => {
    if (name.trim() && name !== item.name) {
      await onUpdate(catId, item.id, { name: name.trim() });
    }
    setEditing(false);
  };

  return (
    <div className={`item-row-wrap${isPacked ? ' item-done' : ''}`}>
      <div className="item-row">
        <StatusBadge
          status={status}
          onClick={canEdit ? () => {
            const ns = nextStatus(status);
            onUpdate(catId, item.id, { status: ns, done: ns === 'packed' });
          } : undefined}
        />

        <div className="item-main">
          {editing ? (
            <input
              className="item-edit-input"
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
              autoFocus
            />
          ) : (
            <span className="item-name" onDoubleClick={() => canEdit && setEditing(true)}>
              {item.name}
              {item.required && <span className="item-required-badge" title="Required">*</span>}
            </span>
          )}
          <div className="item-meta">
            {item.quantity != null && (
              <span className="item-qty">{item.quantity}{item.unit ? ` ${item.unit}` : ''}</span>
            )}
            {item.notes && <span className="item-notes-preview">{item.notes}</span>}
            {(item.associations || []).length > 0 && (
              <span className="item-association-count">🔗 {(item.associations || []).length}</span>
            )}
          </div>
        </div>

        <div className="item-row-actions">
          {canEdit && (
            <button
              className={`item-pack-btn${isPacked ? ' packed' : ''}`}
              onClick={() => onUpdate(catId, item.id, { status: isPacked ? 'need_to_pack' : 'packed', done: !isPacked })}
              title={isPacked ? 'Mark not packed' : 'Mark packed'}
            >
              {isPacked ? '☑' : '☐'}
            </button>
          )}
          {showColors && canEdit && (
            <div className="color-picker-row">
              {ITEM_COLORS.map(c => (
                <ColorDot key={c.label} color={c.value} selected={item.color === c.value} onClick={() => { onUpdate(catId, item.id, { color: c.value }); setShowColors(false); }} />
              ))}
            </div>
          )}
          {canEdit && (
            <button className="item-color-btn" onClick={() => setShowColors(prev => !prev)} title="Color">
              {item.color && item.color !== 'none' ? <span style={{ color: item.color }}>●</span> : '○'}
            </button>
          )}
          <button className="item-detail-btn" onClick={() => setShowDetail(prev => !prev)} title="Details">
            {showDetail ? '▴' : '⋯'}
          </button>
          {canEdit && <button className="item-del-btn" onClick={() => onDelete(catId, item.id)} title="Delete">×</button>}
        </div>
      </div>

      {showDetail && (
        <div className="item-row-detail">
          {canEdit ? (
            <ItemForm
              initial={item}
              submitLabel="Update Item"
              onCancel={() => setShowDetail(false)}
              onSave={async (updates) => {
                await onUpdate(catId, item.id, { ...updates, done: updates.status === 'packed' });
                setShowDetail(false);
              }}
            />
          ) : (
            <div className="item-detail-panel">
              <div className="item-detail-readonly">
                <div><strong>Status:</strong> {ITEM_STATUSES.find(s => s.key === status)?.label || 'Have'}</div>
                <div><strong>Quantity:</strong> {item.quantity != null ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : '—'}</div>
                <div><strong>Required:</strong> {item.required ? 'Yes' : 'No'}</div>
                <div><strong>Notes:</strong> {item.notes || '—'}</div>
              </div>
            </div>
          )}

          {(item.associations || []).length > 0 && (
            <div className="item-associations-panel">
              <div className="item-associations-title">Linked itinerary items</div>
              <div className="item-associations-list">
                {(item.associations || []).map(assoc => (
                  <span key={assoc.id} className="item-association-pill">{associationLabel(assoc)}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategorySection({ cat, onAddItem, onUpdateItem, onDeleteItem, onDeleteCategory, canEdit }) {
  const [open, setOpen] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const packed = cat.items?.filter(i => i.status === 'packed' || i.done).length || 0;
  const total = cat.items?.length || 0;
  const allPacked = total > 0 && packed === total;

  const markAllPacked = async (e) => {
    e.stopPropagation();
    const unpacked = cat.items?.filter(i => i.status !== 'packed' && !i.done) || [];
    await Promise.allSettled(unpacked.map(item => onUpdateItem(cat.id, item.id, { status: 'packed', done: true })));
  };

  return (
    <div className="items-category">
      <div className="cat-header" onClick={() => setOpen(o => !o)}>
        <span className="cat-toggle">{open ? '▾' : '▸'}</span>
        <span className="cat-name">{cat.name}</span>
        <span className="cat-progress">{packed}/{total} packed</span>
        {canEdit && total > 0 && !allPacked && (
          <button className="cat-mark-all-btn" onClick={markAllPacked} title="Mark all packed">✅</button>
        )}
        {canEdit && (
          <button className="cat-del-btn" onClick={e => { e.stopPropagation(); if (confirm(`Delete "${cat.name}"?`)) onDeleteCategory(cat.id); }}>×</button>
        )}
      </div>

      {open && (
        <div className="cat-body">
          {cat.items?.map(item => (
            <ItemRow key={item.id} item={item} catId={cat.id} onUpdate={onUpdateItem} onDelete={onDeleteItem} canEdit={canEdit} />
          ))}

          {canEdit && (
            <div className="add-item-block">
              {showAddForm ? (
                <ItemForm
                  submitLabel="Add Item"
                  onCancel={() => setShowAddForm(false)}
                  onSave={async (itemData) => {
                    await onAddItem(cat.id, itemData);
                    setShowAddForm(false);
                  }}
                />
              ) : (
                <button className="add-entry-btn add-item-advanced-btn" onClick={() => setShowAddForm(true)}>
                  + Add item
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ItemsView({ categories, tripId, onAddCategory, onDeleteCategory, onAddItem, onUpdateItem, onDeleteItem, canEdit }) {
  const [newCatName, setNewCatName] = useState('');
  const [showAddCat, setShowAddCat] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const fileRef = useRef(null);
  const totalDone = useMemo(() => categories.reduce((s, c) => s + (c.items?.filter(i => i.status === 'packed' || i.done).length || 0), 0), [categories]);
  const totalItems = useMemo(() => categories.reduce((s, c) => s + (c.items?.length || 0), 0), [categories]);

  const addCat = async () => {
    const n = newCatName.trim();
    if (!n) return;
    setNewCatName('');
    setShowAddCat(false);
    await onAddCategory(n);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportStatus('Asking AI to parse your packing list…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/api/trips/${tripId}/import/items`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImportStatus(`Created ${data.categoriesCreated} lists!`);
      window.dispatchEvent(new CustomEvent('items-imported', { detail: data.categories }));
      setTimeout(() => setImportStatus(''), 2000);
    } catch (err) {
      setImportStatus(`Error: ${err.message}`);
      setTimeout(() => setImportStatus(''), 4000);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="items-view">
      <div className="items-header">
        <div>
          <h2>Packing List</h2>
          {totalItems > 0 && <div className="items-progress">{totalDone}/{totalItems} packed</div>}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="btn-secondary btn-sm" title="Import from spreadsheet" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? '…' : '📊'}
            </button>
            <button className="btn-primary btn-sm" onClick={() => setShowAddCat(true)}>+ List</button>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.ods,.tsv" style={{ display: 'none' }} onChange={handleImportFile} />
      {importStatus && <div className="items-import-status">{importStatus}</div>}

      {showAddCat && (
        <div className="add-cat-form">
          <input
            autoFocus
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCat(); if (e.key === 'Escape') setShowAddCat(false); }}
            placeholder="List name (e.g. Clothing)…"
          />
          <div className="add-cat-actions">
            <button className="btn-secondary btn-sm" onClick={() => setShowAddCat(false)}>Cancel</button>
            <button className="btn-primary btn-sm" onClick={addCat}>Add</button>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="items-empty">
          <span>No lists yet</span>
          {canEdit && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="btn-primary" onClick={() => setShowAddCat(true)}>Create a list</button>
              <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={importing}>
                {importing ? 'Importing…' : '📊 Import from spreadsheet'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="items-categories">
          {categories.map(cat => (
            <CategorySection
              key={cat.id}
              cat={cat}
              onAddItem={onAddItem}
              onUpdateItem={onUpdateItem}
              onDeleteItem={onDeleteItem}
              onDeleteCategory={onDeleteCategory}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
