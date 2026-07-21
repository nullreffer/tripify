import React, { useState } from 'react';
import { ITEM_COLORS } from '../../constants/pinTypes.js';

function ColorDot({ color, selected, onClick }) {
  return (
    <button
      className={`color-dot${selected ? ' selected' : ''}`}
      style={{ background: color === 'none' ? 'transparent' : color, border: color === 'none' ? '1.5px dashed #94a3b8' : 'none' }}
      onClick={onClick}
      title={color}
    />
  );
}

function ItemRow({ item, catId, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [showColors, setShowColors] = useState(false);

  const saveEdit = async () => {
    if (name.trim() && name !== item.name) {
      await onUpdate(catId, item.id, { name: name.trim() });
    }
    setEditing(false);
  };

  return (
    <div className={`item-row${item.done ? ' item-done' : ''}`}>
      <button
        className={`item-check${item.done ? ' checked' : ''}`}
        style={item.color && item.color !== 'none' ? { borderColor: item.color, background: item.done ? item.color : 'transparent' } : {}}
        onClick={() => onUpdate(catId, item.id, { done: !item.done })}
      >
        {item.done && '✓'}
      </button>

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
        <span className="item-name" onDoubleClick={() => setEditing(true)} onClick={() => onUpdate(catId, item.id, { done: !item.done })}>
          {item.name}
        </span>
      )}

      <div className="item-row-actions">
        {showColors && (
          <div className="color-picker-row">
            {ITEM_COLORS.map(c => (
              <ColorDot key={c} color={c} selected={item.color === c} onClick={() => { onUpdate(catId, item.id, { color: c }); setShowColors(false); }} />
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
  const done = cat.items?.filter(i => i.done).length || 0;
  const total = cat.items?.length || 0;

  const addItem = async () => {
    const n = newItemName.trim();
    if (!n) return;
    setNewItemName('');
    await onAddItem(cat.id, n);
  };

  return (
    <div className="items-category">
      <div className="cat-header" onClick={() => setOpen(o => !o)}>
        <span className="cat-toggle">{open ? '▾' : '▸'}</span>
        <span className="cat-name">{cat.name}</span>
        <span className="cat-progress">{done}/{total}</span>
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

export default function ItemsView({ categories, onAddCategory, onDeleteCategory, onAddItem, onUpdateItem, onDeleteItem, canEdit }) {
  const [newCatName, setNewCatName] = useState('');
  const [showAddCat, setShowAddCat] = useState(false);
  const totalDone = categories.reduce((s, c) => s + (c.items?.filter(i => i.done).length || 0), 0);
  const totalItems = categories.reduce((s, c) => s + (c.items?.length || 0), 0);

  const addCat = async () => {
    const n = newCatName.trim();
    if (!n) return;
    setNewCatName('');
    setShowAddCat(false);
    await onAddCategory(n);
  };

  return (
    <div className="items-view">
      <div className="items-header">
        <div>
          <h2>Packing List</h2>
          {totalItems > 0 && <div className="items-progress">{totalDone}/{totalItems} packed</div>}
        </div>
        {canEdit && (
          <button className="btn-primary btn-sm" onClick={() => setShowAddCat(true)}>+ List</button>
        )}
      </div>

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
          {canEdit && <button className="btn-primary" onClick={() => setShowAddCat(true)}>Create a list</button>}
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
