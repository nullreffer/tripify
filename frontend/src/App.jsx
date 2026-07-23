import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import InviteAccept from './pages/InviteAccept.jsx';
import TripWorkspace from './pages/TripWorkspace.jsx';
import Settings from './pages/Settings.jsx';
import { getSettings, useSettingsListener } from './services/settings.js';

// ── Google Analytics SPA page-view tracker ──────────────────────────────────
function GaTracker() {
  const location = useLocation();
  useEffect(() => {
    if (typeof window.gtag === 'function' && import.meta.env.VITE_GA_TAG) {
      window.gtag('event', 'page_view', {
        page_path: location.pathname + location.search,
        page_title: document.title,
      });
    }
  }, [location]);
  return null;
}

function applyTheme(mapStyle) {
  const dark = mapStyle === 'dark' ||
    (mapStyle === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

// Apply immediately (before first render) to avoid flash
applyTheme(getSettings().mapStyle);

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

const API_BASE = import.meta.env.VITE_API_URL || '';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Keep global dark class in sync with settings changes and system theme
  useEffect(() => {
    const off = useSettingsListener(s => applyTheme(s.mapStyle));
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const mqHandler = () => applyTheme(getSettings().mapStyle);
    mq.addEventListener('change', mqHandler);
    return () => { off(); mq.removeEventListener('change', mqHandler); };
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        setUser(data);
        setLoading(false);
        // If they logged in to accept an invite, redirect back to it
        if (data) {
          const pending = sessionStorage.getItem('pendingInvite');
          if (pending) {
            sessionStorage.removeItem('pendingInvite');
            window.location.href = `/invite/${pending}`;
          }
        }
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <BrowserRouter>
        <GaTracker />
        <Routes>
          <Route
            path="/login"
            element={user ? <Navigate to="/" replace /> : <Login />}
          />
          <Route
            path="/"
            element={user ? <Dashboard /> : <Navigate to="/login" replace />}
          />
          <Route path="/invite/:token" element={<InviteAccept />} />
          <Route
            path="/trips/:id"
            element={user ? <TripWorkspace /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/settings"
            element={user ? <Settings /> : <Navigate to="/login" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

export default App;
