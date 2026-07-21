import React, { useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PIN_TYPES } from '../../constants/pinTypes.js';
import { formatDistance, formatDuration } from '../../services/routing.js';

function StopRow({ stop, index, nextStop, route, onSelect, onReached, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const pt = PIN_TYPES[stop.pinType] || PIN_TYPES.GENERAL;
  const leg = route?.legs?.[index];
  const isNext = stop.id === nextStop?.id;

  return (
    <div ref={setNodeRef} style={style} className={`stop-row${stop.reached ? ' stop-row-done' : ''}${isNext ? ' stop-row-next' : ''}`}>
      <div className="stop-row-drag" {...attributes} {...listeners}>⋮⋮</div>
      <div className="stop-row-num">{stop.reached ? '✓' : index + 1}</div>
      <div className="stop-row-body" onClick={() => onSelect(stop)}>
        <div className="stop-row-top">
          <span className="stop-row-emoji">{pt.emoji}</span>
          <span className="stop-row-name">{stop.name}</span>
          {isNext && <span className="stop-next-badge">Next</span>}
        </div>
        {leg && (
          <div className="stop-row-dist">
            {formatDistance(leg.distance)} · {formatDuration(leg.duration)}
          </div>
        )}
        {stop.targetDate && (
          <div className="stop-row-date">
            {new Date(stop.targetDate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>
      <div className="stop-row-actions">
        <button
          className={`stop-reach-btn${stop.reached ? ' reached' : ''}`}
          onClick={e => { e.stopPropagation(); onReached(stop.id, !stop.reached); }}
          title={stop.reached ? 'Mark unreached' : 'Mark reached'}
        >
          {stop.reached ? '↩' : '✓'}
        </button>
        <button
          className="stop-del-btn"
          onClick={e => { e.stopPropagation(); if (confirm(`Remove "${stop.name}"?`)) onDelete(stop.id); }}
          title="Remove stop"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default function StopList({ stops, route, onSelect, onReorder, onReached, onDelete, onAdd }) {
  const [activeId, setActiveId] = useState(null);
  const nextStop = stops.find(s => !s.reached);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIdx = stops.findIndex(s => s.id === active.id);
    const newIdx = stops.findIndex(s => s.id === over.id);
    onReorder(arrayMove(stops, oldIdx, newIdx));
  }

  return (
    <div className="stop-list">
      <div className="stop-list-header">
        <h2>Stops <span className="stop-count">{stops.filter(s => s.reached).length}/{stops.length}</span></h2>
        <button className="btn-primary btn-sm" onClick={onAdd}>+ Add Stop</button>
      </div>

      {stops.length === 0 ? (
        <div className="stop-list-empty">
          <span>No stops yet</span>
          <button className="btn-primary" onClick={onAdd}>Add your first stop</button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={e => setActiveId(e.active.id)}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={stops.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="stop-rows">
              {stops.map((stop, idx) => (
                <StopRow
                  key={stop.id}
                  stop={stop}
                  index={idx}
                  nextStop={nextStop}
                  route={route}
                  onSelect={onSelect}
                  onReached={onReached}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeId ? (
              <div className="stop-row stop-row-dragging">
                {stops.find(s => s.id === activeId)?.name}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
