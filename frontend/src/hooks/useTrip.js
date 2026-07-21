import { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

export function useTrip(tripId) {
  const [trip, setTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [categories, setCategories] = useState([]);
  const [references, setReferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const saveTimer = useRef(null);

  const markSaving = () => {
    setSaveState('saving');
    clearTimeout(saveTimer.current);
  };
  const markSaved = () => {
    setSaveState('saved');
    saveTimer.current = setTimeout(() => setSaveState('idle'), 2000);
  };
  const markSaveError = () => setSaveState('error');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tripRes, stopsRes, itemsRes, refsRes] = await Promise.all([
        fetch(`${API}/api/trips/${tripId}`, { credentials: 'include' }),
        fetch(`${API}/api/trips/${tripId}/stops`, { credentials: 'include' }),
        fetch(`${API}/api/trips/${tripId}/items`, { credentials: 'include' }),
        fetch(`${API}/api/trips/${tripId}/references`, { credentials: 'include' })
      ]);
      if (!tripRes.ok) throw new Error('Trip not found');
      const [tripData, stopsData, itemsData, refsData] = await Promise.all([
        tripRes.json(), stopsRes.json(), itemsRes.json(), refsRes.json()
      ]);
      setTrip(tripData);
      setStops(Array.isArray(stopsData) ? stopsData : []);
      setCategories(Array.isArray(itemsData) ? itemsData : []);
      setReferences(Array.isArray(refsData) ? refsData : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  // ── Stop mutations ─────────────────────────────────────────────────────────

  const addStop = useCallback(async (stopData) => {
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/stops`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stopData)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const stop = await res.json();
      setStops(prev => [...prev, stop]);
      markSaved();
      return stop;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId]);

  const updateStop = useCallback(async (stopId, updates) => {
    // Optimistic update
    setStops(prev => prev.map(s => s.id === stopId ? { ...s, ...updates } : s));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/stops/${stopId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const stop = await res.json();
      setStops(prev => prev.map(s => s.id === stopId ? stop : s));
      markSaved();
      return stop;
    } catch (err) {
      markSaveError();
      load(); // revert
      throw err;
    }
  }, [tripId, load]);

  const deleteStop = useCallback(async (stopId) => {
    setStops(prev => prev.filter(s => s.id !== stopId));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/stops/${stopId}`, {
        method: 'DELETE', credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete stop');
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load]);

  const reorderStops = useCallback(async (newStops) => {
    setStops(newStops);
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/stops/reorder`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: newStops.map(s => s.id) })
      });
      if (!res.ok) throw new Error('Failed to reorder');
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load]);

  const markReached = useCallback(async (stopId, reached = true) => {
    setStops(prev => prev.map(s => s.id === stopId ? { ...s, reached, reachedAt: reached ? new Date().toISOString() : null } : s));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/stops/${stopId}/reach`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reached })
      });
      if (!res.ok) throw new Error('Failed to update');
      const stop = await res.json();
      setStops(prev => prev.map(s => s.id === stopId ? stop : s));
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load]);

  // ── Item mutations ─────────────────────────────────────────────────────────

  const addCategory = useCallback(async (name) => {
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/items/categories`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const cat = await res.json();
      setCategories(prev => [...prev, cat]);
      markSaved();
      return cat;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId]);

  const deleteCategory = useCallback(async (catId) => {
    setCategories(prev => prev.filter(c => c.id !== catId));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/items/categories/${catId}`, {
        method: 'DELETE', credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed');
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load]);

  const addItem = useCallback(async (catId, name, color = null) => {
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/items/categories/${catId}/items`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const item = await res.json();
      setCategories(prev => prev.map(c => c.id === catId ? { ...c, items: [...c.items, item] } : c));
      markSaved();
      return item;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId]);

  const updateItem = useCallback(async (catId, itemId, updates) => {
    setCategories(prev => prev.map(c => c.id === catId
      ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, ...updates } : i) }
      : c));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/items/items/${itemId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed');
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load]);

  const deleteItem = useCallback(async (catId, itemId) => {
    setCategories(prev => prev.map(c => c.id === catId
      ? { ...c, items: c.items.filter(i => i.id !== itemId) }
      : c));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/items/items/${itemId}`, {
        method: 'DELETE', credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed');
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load]);

  // ── References ─────────────────────────────────────────────────────────────

  const addReference = useCallback(async (ref) => {
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/references`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ref)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const newRef = await res.json();
      setReferences(prev => [...prev, newRef]);
      markSaved();
      return newRef;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId]);

  const deleteReference = useCallback(async (refId) => {
    setReferences(prev => prev.filter(r => r.id !== refId));
    markSaving();
    try {
      await fetch(`${API}/api/trips/${tripId}/references/${refId}`, {
        method: 'DELETE', credentials: 'include'
      });
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load]);

  const updateTrip = useCallback(async (updates) => {
    setTrip(prev => ({ ...prev, ...updates }));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed');
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load]);

  return {
    trip, stops, categories, references, loading, error, saveState,
    addStop, updateStop, deleteStop, reorderStops, markReached,
    addCategory, deleteCategory, addItem, updateItem, deleteItem,
    addReference, deleteReference, updateTrip, reload: load
  };
}
