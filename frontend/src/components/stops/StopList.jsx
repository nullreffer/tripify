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

function StopRow({ stop, index, nextStop, route, onSelect, onReached, onDelete, isReachedLocked, hideArrive }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
    disabled: isReachedLocked, // disable drag for reached stops
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const pt = PIN_TYPES[stop.pinType] || PIN_TYPES.GENERAL;
  const leg = route?.legs?.[index];
  const isNext = stop.id === nextStop?.id;

  return (
    <div ref={setNodeRef} style={style} className={`stop-row${stop.reached ? ' stop-row-done' : ''}${isNext ? ' stop-row-next' : ''}`}>
      <div className={`stop-row-drag${isReachedLocked ? ' stop-row-drag-locked' : ''}`} {...(isReachedLocked ? {} : { ...attributes, ...listeners })}>⋮⋮</div>
      <div className="stop-row-num">{stop.reached ? '✓' : (index != null ? index + 1 : '🔖')}</div>
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
        {!hideArrive && (
          <button
            className={`stop-reach-btn${stop.reached ? ' reached' : ''}`}
            onClick={e => { e.stopPropagation(); onReached(stop.id, !stop.reached); }}
            title={stop.reached ? 'Mark unarrived' : 'Mark arrived'}
          >
            {stop.reached ? '↩' : '✓'}
          </button>
        )}
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

export default function StopList({ stops, route, onSelect, onReorder, onReached, onDelete, onAdd, filterType, onFilterChange, stopsTab, onStopsTabChange }) {
  const [activeId, setActiveId] = useState(null);
  const routeStops = stops.filter(s => !s?.metadata?.savedForLater);
  const savedStops = stops.filter(s => s?.metadata?.savedForLater);
  const nextStop = routeStops.find(s => !s.reached);

  // Active tab: 'route' or 'saved'
  const activeTab = stopsTab || 'route';

  // Index of the last reached stop — nothing can be dragged into or before this zone
  const lastReachedIdx = routeStops.reduce((acc, s, i) => s.reached ? i : acc, -1);

  // Which pin types actually appear in route stops (for filter pills, only on route tab)
  const presentTypes = [...new Set(routeStops.map(s => s.pinType).filter(Boolean))];
  const filteredRouteStops = filterType
    ? routeStops.filter(s => s.pinType === filterType)
    : routeStops;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIdx = routeStops.findIndex(s => s.id === active.id);
    const newIdx = routeStops.findIndex(s => s.id === over.id);
    // Prevent moving a reached stop
    if (routeStops[oldIdx]?.reached) return;
    // Prevent moving any stop into / before the reached zone
    if (newIdx <= lastReachedIdx) return;
    onReorder(arrayMove(routeStops, oldIdx, newIdx));
  }

  const displaySaved = activeTab === 'saved';
  const displayStops = displaySaved ? savedStops : filteredRouteStops;

  return (
    <div className="stop-list">
      <div className="stop-list-header">
        <h2>Stops <span className="stop-count">{routeStops.filter(s => s.reached).length}/{routeStops.length}</span></h2>
        <button className="btn-primary btn-sm" onClick={onAdd}>+ Add Stop</button>
      </div>

      {/* Route / Saved tabs */}
      <div className="stops-tabs">
        <button
          className={`stops-tab${activeTab === 'route' ? ' active' : ''}`}
          onClick={() => onStopsTabChange?.('route')}
        >
          🗺 Route {routeStops.length > 0 && <span className="stops-tab-count">{routeStops.length}</span>}
        </button>
        <button
          className={`stops-tab${activeTab === 'saved' ? ' active' : ''}`}
          onClick={() => onStopsTabChange?.('saved')}
        >
          🔖 Saved {savedStops.length > 0 && <span className="stops-tab-count">{savedStops.length}</span>}
        </button>
      </div>

      {/* Type filter pills — only on route tab */}
      {!displaySaved && presentTypes.length > 1 && (
        <div className="stop-filter-row">
          <button
            className={`stop-filter-pill${!filterType ? ' active' : ''}`}
            onClick={() => onFilterChange?.(null)}
          >All</button>
          {presentTypes.map(type => {
            const pt = PIN_TYPES[type] || PIN_TYPES.GENERAL;
            return (
              <button
                key={type}
                className={`stop-filter-pill${filterType === type ? ' active' : ''}`}
                onClick={() => onFilterChange?.(filterType === type ? null : type)}
              >
                {pt.emoji} {pt.label}
              </button>
            );
          })}
        </div>
      )}

      {displayStops.length === 0 ? (
        <div className="stop-list-empty">
          {displaySaved ? (
            <>
              <span>No saved stops yet</span>
              <p className="stop-list-empty-sub">Tap 🔖 on a search pin to save for later</p>
            </>
          ) : filterType ? (
            <>
              <span>No stops match filter</span>
              <button className="btn-ghost btn-sm" onClick={() => onFilterChange?.(null)}>Clear filter</button>
            </>
          ) : (
            <>
              <span>No stops yet</span>
              <button className="btn-primary" onClick={onAdd}>Add your first stop</button>
            </>
          )}
        </div>
      ) : displaySaved ? (
        <div className="stop-rows">
          {displayStops.map(stop => (
            <StopRow
              key={stop.id}
              stop={stop}
              index={null}
              nextStop={null}
              route={null}
              onSelect={onSelect}
              onReached={onReached}
              onDelete={onDelete}
              isReachedLocked
              hideArrive
            />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={e => setActiveId(e.active.id)}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={displayStops.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="stop-rows">
              {displayStops.map((stop, idx) => {
                // Compute the real index in the full (unfiltered) route list for route leg lookup
                const realIdx = routeStops.findIndex(s => s.id === stop.id);
                return (
                  <StopRow
                    key={stop.id}
                    stop={stop}
                    index={realIdx}
                    nextStop={nextStop}
                    route={route}
                    onSelect={onSelect}
                    onReached={onReached}
                    onDelete={onDelete}
                    isReachedLocked={stop.reached}
                    hideArrive={false}
                  />
                );
              })}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeId ? (
              <div className="stop-row stop-row-dragging">
                {routeStops.find(s => s.id === activeId)?.name}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
