import React, { useState, useRef } from 'react';
import { ITEM_COLORS } from '../../constants/pinTypes.js';

const API = import.meta.env.VITE_API_URL || '';

const ITEM_STATUSES = [
  { key: 'need_to_buy',  label: 'Need to Buy',  icon: '🛒', color: '#ef4444' },
  { key: 'have',         label: 'Have',          icon: '📦', color: '#94a3b8' },
  { key: 'need_to_pack', label: 'Need to Pack',  icon: '🎒', color: '#f97316' },
  { key: 'packed',       label: 'Packed',        icon: '✅', color: '#22c55e' },
  { key: 'used',         label: 'Used',          icon: '🗑', color: '#64748b' },
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
      title={`Status: ${s.label} (click to cycle)`}
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

function ItemRow({ item, catId, onUpdate, onDelete }) {
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
    <div className={`item-row${isPacked ? ' item-done' : ''}`}>
      <StatusBadge
        status={status}
        onClick={() => {
          const ns = nextStatus(status);
          onUpdate(catId, item.id, { status: ns, done: ns === 'packed' });
        }}
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
          <span className="item-name" onDoubleClick={() => setEditing(true)}>
            {item.name}
            {item.required && <span className="item-required-badge" title="Required">*</span>}
          </span>
        )}
        <div className="item-meta">
          {item.quantity != null && (
            <span className="item-qty">{item.quantity}{item.unit ? ` ${item.unit}` : ''}</span>
          )}
          {item.notes && <span className="item-notes-preview">{item.notes}</span>}
        </div>
      </div>

      <div className="item-row-actions">
        <button
          className={`item-pack-btn${isPacked ? ' packed' : ''}`}
          onClick={() => onUpdate(catId, item.id, { status: isPacked ? 'need_to_pack' : 'packed', done: !isPacked })}
          title={isPacked ? 'Mark not packed' : 'Mark packed'}
        >
          {isPacked ? '☑' : '☐'}
        </button>
        {showColors && (
          <div className="color-picker-row">
            {ITEM_COLORS.map(c => (
              <ColorDot key={c.label} color={c.value} selected={item.color === c.value} onClick={() => { onUpdate(catId, item.id, { color: c.value }); setShowColors(false); }} />
            ))}
          </div>
        )}
        <button className="item-color-btn" onClick={() => setShowColors(prev => !prev)} title="Color">
          {item.color && item.color !== 'none' ? <span style={{ color: item.color }}>●</span> : '○'}
        </button>
        <button className="item-del-btn" onClick={() => onDelete(catId, item.id)} title="Delete">×</button>
      </div>
    </div>
  );
}

function CategorySection({ cat, onAddItem, onUpdateItem, onDeleteItem, onDeleteCategory, canEdit }) {
  const [newItemName, setNewItemName] = useState('');
  const [open, setOpen] = useState(true);
  const packed = cat.items?.filter(i => i.status === 'packed' || i.done).length || 0;
  const total = cat.items?.length || 0;

  const addItem = async () => {
    const n = newItemName.trim();
    if (!n) return;
    setNewItemName('');
    await onAddItem(cat.id, { name: n });
  };

  return (
    <div className="items-category">
      <div className="cat-header" onClick={() => setOpen(o => !o)}>
        <span className="cat-toggle">{open ? '▾' : '▸'}</span>
        <span className="cat-name">{cat.name}</span>
        <span className="cat-progress">{packed}/{total} packed</span>
        {canEdit && (
          <button className="cat-del-btn" onClick={e => { e.stopPropagation(); if (confirm(`Delete "${cat.name}"?`)) onDeleteCategory(cat.id); }}>×</button>
        )}
      </div>

      {open && (
        <div className="cat-body">
          {cat.items?.map(item => (
            <ItemRow key={item.id} item={item} catId={cat.id} onUpdate={onUpdateItem} onDelete={onDeleteItem} />
          ))}

          {canEdit && (
            <div className="add-item-row">
              <input
                className="add-item-input"
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
                placeholder="Add item…"
              />
              {newItemName && (
                <button className="add-item-btn" onClick={addItem}>+</button>
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
  const totalDone = categories.reduce((s, c) => s + (c.items?.filter(i => i.status === 'packed' || i.done).length || 0), 0);
  const totalItems = categories.reduce((s, c) => s + (c.items?.length || 0), 0);

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
      // Force a page reload of categories by triggering a window event the hook can react to
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

      {/* Hidden file input for import */}
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
