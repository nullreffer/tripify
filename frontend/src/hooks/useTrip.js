import { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

function cacheKey(tripId) {
  return `azitrip_trip_${tripId}`;
}

function readCache(tripId) {
  try {
    const raw = localStorage.getItem(cacheKey(tripId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(tripId, snapshot) {
  try {
    localStorage.setItem(cacheKey(tripId), JSON.stringify(snapshot));
  } catch {
    // Storage quota exceeded — ignore
  }
}

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
  const [isOffline, setIsOffline] = useState(false);
  const saveTimer = useRef(null);

  // Refs that always reflect the latest state so persistCache can read them
  // without needing to be in dependency arrays.
  const stateRef = useRef({ trip: null, stops: [], categories: [], references: [], days: [], reservations: [] });

  const persistCache = useCallback(() => {
    writeCache(tripId, stateRef.current);
  }, [tripId]);

  const markSaving = () => {
    setSaveState('saving');
    clearTimeout(saveTimer.current);
  };
  const markSaved = () => {
    setSaveState('saved');
    persistCache();
    saveTimer.current = setTimeout(() => setSaveState('idle'), 2000);
  };
  const markSaveError = () => setSaveState('error');

  // ── Tracked setters — keep stateRef in sync for cache persistence ──────────
  const setTripT = useCallback((val) => {
    const next = typeof val === 'function' ? val(stateRef.current.trip) : val;
    stateRef.current = { ...stateRef.current, trip: next };
    setTrip(next);
  }, []);
  const setStopsT = useCallback((val) => {
    const next = typeof val === 'function' ? val(stateRef.current.stops) : val;
    stateRef.current = { ...stateRef.current, stops: next };
    setStops(next);
  }, []);
  const setCategoriesT = useCallback((val) => {
    const next = typeof val === 'function' ? val(stateRef.current.categories) : val;
    stateRef.current = { ...stateRef.current, categories: next };
    setCategories(next);
  }, []);
  const setReferencesT = useCallback((val) => {
    const next = typeof val === 'function' ? val(stateRef.current.references) : val;
    stateRef.current = { ...stateRef.current, references: next };
    setReferences(next);
  }, []);
  const setDaysT = useCallback((val) => {
    const next = typeof val === 'function' ? val(stateRef.current.days) : val;
    stateRef.current = { ...stateRef.current, days: next };
    setDays(next);
  }, []);
  const setReservationsT = useCallback((val) => {
    const next = typeof val === 'function' ? val(stateRef.current.reservations) : val;
    stateRef.current = { ...stateRef.current, reservations: next };
    setReservations(next);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setIsOffline(false);
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
      const snapshot = {
        trip: tripData,
        stops: Array.isArray(stopsData) ? stopsData : [],
        categories: Array.isArray(itemsData) ? itemsData : [],
        references: Array.isArray(refsData) ? refsData : [],
        days: Array.isArray(daysData) ? daysData : [],
        reservations: Array.isArray(resData) ? resData : [],
      };
      stateRef.current = snapshot;
      writeCache(tripId, snapshot);
      setTrip(snapshot.trip);
      setStops(snapshot.stops);
      setCategories(snapshot.categories);
      setReferences(snapshot.references);
      setDays(snapshot.days);
      setReservations(snapshot.reservations);
    } catch (err) {
      // Network failure — try to serve from cache
      const cached = readCache(tripId);
      if (cached && cached.trip) {
        stateRef.current = cached;
        setTrip(cached.trip);
        setStops(cached.stops || []);
        setCategories(cached.categories || []);
        setReferences(cached.references || []);
        setDays(cached.days || []);
        setReservations(cached.reservations || []);
        setIsOffline(true);
      } else {
        setError(err.message);
      }
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
        .then(data => setCategoriesT(Array.isArray(data) ? data : []));
    };
    window.addEventListener('items-imported', handler);
    return () => window.removeEventListener('items-imported', handler);
  }, [tripId, setCategoriesT]);

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
      setStopsT(prev => [...prev, stop]);
      markSaved();
      return stop;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId, setStopsT]);

  const updateStop = useCallback(async (stopId, updates) => {
    // Optimistic update
    setStopsT(prev => prev.map(s => s.id === stopId ? { ...s, ...updates } : s));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/stops/${stopId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const stop = await res.json();
      setStopsT(prev => prev.map(s => s.id === stopId ? stop : s));
      markSaved();
      return stop;
    } catch (err) {
      markSaveError();
      load(); // revert
      throw err;
    }
  }, [tripId, load, setStopsT]);

  const deleteStop = useCallback(async (stopId) => {
    setStopsT(prev => prev.filter(s => s.id !== stopId));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/stops/${stopId}`, {
        method: 'DELETE', credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete stop');
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load, setStopsT]);

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
    setStopsT(withDates);
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/stops/reorder`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: newStops.map(s => s.id), baseDate: baseDate.toISOString() })
      });
      if (!res.ok) throw new Error('Failed to reorder');
      const data = await res.json();
      if (data.stops) setStopsT(data.stops);
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load, setStopsT]);

  const markReached = useCallback(async (stopId, reached = true) => {
    setStopsT(prev => prev.map(s => s.id === stopId ? { ...s, reached, reachedAt: reached ? new Date().toISOString() : null } : s));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/stops/${stopId}/reach`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reached })
      });
      if (!res.ok) throw new Error('Failed to update');
      const stop = await res.json();
      setStopsT(prev => prev.map(s => s.id === stopId ? stop : s));
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load, setStopsT]);

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
      setStopsT(prev => prev.map(s => s.id === stopId ? stop : s));
      // Update trip coverImage in local state
      setTripT(prev => prev ? { ...prev, coverImage: photoDataUrl } : prev);
      markSaved();
      return stop;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId, setStopsT, setTripT]);

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
      setCategoriesT(prev => [...prev, cat]);
      markSaved();
      return cat;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId, setCategoriesT]);

  const deleteCategory = useCallback(async (catId) => {
    setCategoriesT(prev => prev.filter(c => c.id !== catId));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/items/categories/${catId}`, {
        method: 'DELETE', credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed');
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load, setCategoriesT]);

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
      setCategoriesT(prev => prev.map(c => c.id === catId ? { ...c, items: [...c.items, item] } : c));
      markSaved();
      return item;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId, setCategoriesT]);

  const updateItem = useCallback(async (catId, itemId, updates) => {
    setCategoriesT(prev => prev.map(c => c.id === catId
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
      const item = await res.json();
      setCategoriesT(prev => prev.map(c => c.id === catId
        ? { ...c, items: c.items.map(i => i.id === itemId ? item : i) }
        : c));
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load, setCategoriesT]);

  const deleteItem = useCallback(async (catId, itemId) => {
    setCategoriesT(prev => prev.map(c => c.id === catId
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
  }, [tripId, load, setCategoriesT]);

  const addItemAssociation = useCallback(async (itemId, target) => {
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/items/items/${itemId}/associations`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to associate item');

      setCategoriesT(prev => prev.map(category => ({
        ...category,
        items: (category.items || []).map(item => item.id === itemId
          ? { ...item, associations: [...(item.associations || []), data] }
          : item)
      })));
      setDaysT(prev => prev.map(day => {
        if (data.entry?.id) {
          return {
            ...day,
            entries: (day.entries || []).map(entry => entry.id === data.entry.id
              ? { ...entry, itemAssociations: [...(entry.itemAssociations || []), data] }
              : entry)
          };
        }
        if (data.day?.id === day.id) {
          return {
            ...day,
            itemAssociations: [...(day.itemAssociations || []), data]
          };
        }
        return day;
      }));
      markSaved();
      return data;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId, setCategoriesT, setDaysT]);

  const deleteItemAssociation = useCallback(async (itemId, assocId) => {
    setCategoriesT(prev => prev.map(category => ({
      ...category,
      items: (category.items || []).map(item => item.id === itemId
        ? { ...item, associations: (item.associations || []).filter(assoc => assoc.id !== assocId) }
        : item)
    })));
    setDaysT(prev => prev.map(day => ({
      ...day,
      itemAssociations: (day.itemAssociations || []).filter(assoc => assoc.id !== assocId),
      entries: (day.entries || []).map(entry => ({
        ...entry,
        itemAssociations: (entry.itemAssociations || []).filter(assoc => assoc.id !== assocId)
      }))
    })));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/items/items/${itemId}/associations/${assocId}`, {
        method: 'DELETE', credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to remove association');
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load, setCategoriesT, setDaysT]);

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
      setDaysT(prev => [...prev, day]);
      markSaved();
      return day;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId, setDaysT]);

  const updateDay = useCallback(async (dayId, updates) => {
    setDaysT(prev => prev.map(d => d.id === dayId ? { ...d, ...updates } : d));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/days/${dayId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed');
      const day = await res.json();
      setDaysT(prev => prev.map(d => d.id === dayId ? day : d));
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load, setDaysT]);

  const deleteDay = useCallback(async (dayId) => {
    setDaysT(prev => prev.filter(d => d.id !== dayId));
    markSaving();
    try {
      await fetch(`${API}/api/trips/${tripId}/days/${dayId}`, { method: 'DELETE', credentials: 'include' });
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load, setDaysT]);

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
      setDaysT(prev => prev.map(d => d.id === dayId ? { ...d, entries: [...(d.entries || []), entry] } : d));
      markSaved();
      return entry;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId, setDaysT]);

  const updateEntry = useCallback(async (dayId, entryId, updates) => {
    setDaysT(prev => prev.map(d => d.id === dayId
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
      setDaysT(prev => prev.map(d => d.id === dayId
        ? { ...d, entries: (d.entries || []).map(e => e.id === entryId ? entry : e) }
        : d));
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load, setDaysT]);

  const deleteEntry = useCallback(async (dayId, entryId) => {
    setDaysT(prev => prev.map(d => d.id === dayId
      ? { ...d, entries: (d.entries || []).filter(e => e.id !== entryId) }
      : d));
    markSaving();
    try {
      await fetch(`${API}/api/trips/${tripId}/days/${dayId}/entries/${entryId}`, { method: 'DELETE', credentials: 'include' });
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load, setDaysT]);

  const rescheduleDays = useCallback(async ({ delayMinutes, fromDayId } = {}) => {
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/days/reschedule`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delayMinutes, fromDayId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reschedule itinerary');
      setDaysT(Array.isArray(data.days) ? data.days : []);
      markSaved();
      return data;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId, setDaysT]);

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
      setReservationsT(prev => [...prev, reservation]);
      // Also update entry in days if linked
      if (reservation.entryId) {
        setDaysT(prev => prev.map(d => ({
          ...d,
          entries: (d.entries || []).map(e => e.id === reservation.entryId ? { ...e, reservation } : e)
        })));
      }
      markSaved();
      return reservation;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId, setReservationsT, setDaysT]);

  const updateReservation = useCallback(async (resId, updates) => {
    setReservationsT(prev => prev.map(r => r.id === resId ? { ...r, ...updates } : r));
    markSaving();
    try {
      const res = await fetch(`${API}/api/trips/${tripId}/reservations/${resId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed');
      const reservation = await res.json();
      setReservationsT(prev => prev.map(r => r.id === resId ? reservation : r));
      setDaysT(prev => prev.map(day => ({
        ...day,
        entries: (day.entries || []).map(entry => entry.reservation?.id === resId
          ? { ...entry, reservation }
          : entry)
      })));
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load, setReservationsT, setDaysT]);

  const deleteReservation = useCallback(async (resId) => {
    setReservationsT(prev => prev.filter(r => r.id !== resId));
    setDaysT(prev => prev.map(day => ({
      ...day,
      entries: (day.entries || []).map(entry => entry.reservation?.id === resId
        ? { ...entry, reservation: null }
        : entry)
    })));
    markSaving();
    try {
      await fetch(`${API}/api/trips/${tripId}/reservations/${resId}`, { method: 'DELETE', credentials: 'include' });
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load, setReservationsT, setDaysT]);

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
      setReferencesT(prev => [...prev, newRef]);
      markSaved();
      return newRef;
    } catch (err) { markSaveError(); throw err; }
  }, [tripId, setReferencesT]);

  const deleteReference = useCallback(async (refId) => {
    setReferencesT(prev => prev.filter(r => r.id !== refId));
    markSaving();
    try {
      await fetch(`${API}/api/trips/${tripId}/references/${refId}`, {
        method: 'DELETE', credentials: 'include'
      });
      markSaved();
    } catch (err) { markSaveError(); load(); throw err; }
  }, [tripId, load, setReferencesT]);

  const updateTrip = useCallback(async (updates) => {
    setTripT(prev => ({ ...prev, ...updates }));
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
  }, [tripId, load, setTripT]);

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
    trip, stops, categories, references, days, reservations, loading, error, saveState, isOffline,
    addStop, updateStop, deleteStop, reorderStops, markReached, uploadStopPhoto,
    addCategory, deleteCategory, addItem, updateItem, deleteItem, addItemAssociation, deleteItemAssociation,
    addDay, updateDay, deleteDay, addEntry, updateEntry, deleteEntry, rescheduleDays,
    addReservation, updateReservation, deleteReservation,
    addReference, deleteReference, updateTrip, deleteTrip, reload: load
  };
}
