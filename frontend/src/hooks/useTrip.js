import { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

export function useTrip(tripId) {
  const [trip, setTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [categories, setCategories] = useState([]);
  const [references, setReferences] = useState([]);
  const [days, setDays] = useState([]);
  const [reservations, setReservations] = useState([]);
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
      const [tripRes, stopsRes, itemsRes, refsRes, daysRes, resRes] = await Promise.all([
        fetch(`${API}/api/trips/${tripId}`, { credentials: 'include' }),
        fetch(`${API}/api/trips/${tripId}/stops`, { credentials: 'include' }),
        fetch(`${API}/api/trips/${tripId}/items`, { credentials: 'include' }),
        fetch(`${API}/api/trips/${tripId}/references`, { credentials: 'include' }),
        fetch(`${API}/api/trips/${tripId}/days`, { credentials: 'include' }),
        fetch(`${API}/api/trips/${tripId}/reservations`, { credentials: 'include' })
      ]);
      if (!tripRes.ok) throw new Error('Trip not found');
      const [tripData, stopsData, itemsData, refsData, daysData, resData] = await Promise.all([
        tripRes.json(), stopsRes.json(), itemsRes.json(), refsRes.json(), daysRes.json(), resRes.json()
      ]);
      setTrip(tripData);
      setStops(Array.isArray(stopsData) ? stopsData : []);
      setCategories(Array.isArray(itemsData) ? itemsData : []);
      setReferences(Array.isArray(refsData) ? refsData : []);
      setDays(Array.isArray(daysData) ? daysData : []);
      setReservations(Array.isArray(resData) ? resData : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  // Reload categories when a sheet import completes
  useEffect(() => {
    const handler = () => {
      fetch(`${API}/api/trips/${tripId}/items`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => setCategories(Array.isArray(data) ? data : []));
    };
    window.addEventListener('items-imported', handler);
    return () => window.removeEventListener('items-imported', handler);
  }, [tripId]);

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
    // Compute sequential dates starting from the first stop's date (or today)
    const firstDatedIdx = newStops.findIndex(s => s.targetDate);
    let baseDate;
    if (firstDatedIdx >= 0) {
      const d = new Date(newStops[firstDatedIdx].targetDate);
      d.setDate(d.getDate() - firstDatedIdx);
      baseDate = d;
    } else {
      baseDate = new Date();
      baseDate.setHours(12, 0, 0, 0);
    }

    // Optimistically update stop dates in local state
    const withDates = newStops.map((s, idx) => {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + idx);
      return { ...s, targetDate: d.toISOString() };
    });
    setStops(withDates);
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/stops/reorder`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: newStops.map(s => s.id), baseDate: baseDate.toISOString() })
      });
      if (!res.ok) throw new Error('Failed to reorder');
      const data = await res.json();
      if (data.stops) setStops(data.stops);
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

  const uploadStopPhoto = useCallback(async (stopId, photoDataUrl) => {
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/stops/${stopId}/photo`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo: photoDataUrl })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save photo');
      const stop = await res.json();
      setStops(prev => prev.map(s => s.id === stopId ? stop : s));
      // Update trip coverImage in local state
      setTrip(prev => prev ? { ...prev, coverImage: photoDataUrl } : prev);
      markSaved();
      return stop;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId]);

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

  const addItem = useCallback(async (catId, itemData) => {
    // itemData can be a string (legacy) or object with { name, color, quantity, ... }
    const body = typeof itemData === 'string' ? { name: itemData } : itemData;
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/items/categories/${catId}/items`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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

  // ── Days mutations ─────────────────────────────────────────────────────────

  const addDay = useCallback(async (data = {}) => {
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/days`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const day = await res.json();
      setDays(prev => [...prev, day]);
      markSaved();
      return day;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId]);

  const updateDay = useCallback(async (dayId, updates) => {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, ...updates } : d));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/days/${dayId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed');
      const day = await res.json();
      setDays(prev => prev.map(d => d.id === dayId ? day : d));
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load]);

  const deleteDay = useCallback(async (dayId) => {
    setDays(prev => prev.filter(d => d.id !== dayId));
    markSaving();
    try {
      await fetch(`${API}/api/trips/${tripId}/days/${dayId}`, { method: 'DELETE', credentials: 'include' });
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load]);

  const addEntry = useCallback(async (dayId, data) => {
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/days/${dayId}/entries`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const entry = await res.json();
      setDays(prev => prev.map(d => d.id === dayId ? { ...d, entries: [...(d.entries || []), entry] } : d));
      markSaved();
      return entry;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId]);

  const updateEntry = useCallback(async (dayId, entryId, updates) => {
    setDays(prev => prev.map(d => d.id === dayId
      ? { ...d, entries: (d.entries || []).map(e => e.id === entryId ? { ...e, ...updates } : e) }
      : d));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/days/${dayId}/entries/${entryId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed');
      const entry = await res.json();
      setDays(prev => prev.map(d => d.id === dayId
        ? { ...d, entries: (d.entries || []).map(e => e.id === entryId ? entry : e) }
        : d));
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load]);

  const deleteEntry = useCallback(async (dayId, entryId) => {
    setDays(prev => prev.map(d => d.id === dayId
      ? { ...d, entries: (d.entries || []).filter(e => e.id !== entryId) }
      : d));
    markSaving();
    try {
      await fetch(`${API}/api/trips/${tripId}/days/${dayId}/entries/${entryId}`, { method: 'DELETE', credentials: 'include' });
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load]);

  // ── Reservation mutations ──────────────────────────────────────────────────

  const addReservation = useCallback(async (data) => {
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/reservations`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const reservation = await res.json();
      setReservations(prev => [...prev, reservation]);
      // Also update entry in days if linked
      if (reservation.entryId) {
        setDays(prev => prev.map(d => ({
          ...d,
          entries: (d.entries || []).map(e => e.id === reservation.entryId ? { ...e, reservation } : e)
        })));
      }
      markSaved();
      return reservation;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId]);

  const updateReservation = useCallback(async (resId, updates) => {
    setReservations(prev => prev.map(r => r.id === resId ? { ...r, ...updates } : r));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/reservations/${resId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed');
      const reservation = await res.json();
      setReservations(prev => prev.map(r => r.id === resId ? reservation : r));
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load]);

  const deleteReservation = useCallback(async (resId) => {
    setReservations(prev => prev.filter(r => r.id !== resId));
    markSaving();
    try {
      await fetch(`${API}/api/trips/${tripId}/reservations/${resId}`, { method: 'DELETE', credentials: 'include' });
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

  const deleteTrip = useCallback(async () => {
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}`, {
        method: 'DELETE', credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete trip');
      markSaved();
    } catch (err) { markSaveError(); throw err; }
  }, [tripId]);

  return {
    trip, stops, categories, references, days, reservations, loading, error, saveState,
    addStop, updateStop, deleteStop, reorderStops, markReached, uploadStopPhoto,
    addCategory, deleteCategory, addItem, updateItem, deleteItem,
    addDay, updateDay, deleteDay, addEntry, updateEntry, deleteEntry,
    addReservation, updateReservation, deleteReservation,
    addReference, deleteReference, updateTrip, deleteTrip, reload: load
  };
}
