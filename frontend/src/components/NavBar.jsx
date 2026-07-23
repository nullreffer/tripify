import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import CamperLogo from '../assets/logo.png';

const API_BASE = import.meta.env.VITE_API_URL || '';

function NavBar() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = async () => {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    setUser(null);
  };

  return (
    <>
      <nav className="navbar">
        {/* Hamburger */}
        <button
          className="hamburger"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <span />
          <span />
          <span />
        </button>

        {/* Logo */}
        <div className="navbar-logo">
          <img src={CamperLogo} alt="Azitrip" className="logo-img" />
          <span className="logo-name">Azitrip</span>
        </div>

        {/* User icon */}
        <div className="navbar-right">
          <button
            className="user-avatar-btn"
            onClick={() => setUserMenuOpen(prev => !prev)}
            aria-label="User menu"
          >
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="user-avatar" referrerPolicy="no-referrer" />
            ) : (
              <div className="user-avatar-placeholder">
                {user?.name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </button>

          {userMenuOpen && (
            <>
              <div className="dropdown-backdrop" onClick={() => setUserMenuOpen(false)} />
              <div className="user-dropdown">
                <div className="user-info">
                  <strong>{user?.name}</strong>
                  <span>{user?.email}</span>
                </div>
                <hr />
                <button onClick={handleLogout} className="logout-btn">
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </nav>

      {/* Drawer backdrop */}
      {drawerOpen && (
        <div
          className="drawer-backdrop"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Side drawer */}
      <div className={`drawer${drawerOpen ? ' drawer-open' : ''}`}>
        <div className="drawer-header">
          <img src={CamperLogo} alt="Azitrip" className="logo-img" />
          <span className="logo-name">Azitrip</span>
          <button
            className="drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>
        <nav className="drawer-nav">
          <a href="/" className="drawer-link" onClick={() => setDrawerOpen(false)}>
            🗺️ My Trips
          </a>
          <button
            className="drawer-link"
            onClick={() => { setDrawerOpen(false); navigate('/settings'); }}
          >
            ⚙️ Settings
          </button>
        </nav>
      </div>
    </>
  );
}

export default NavBar;
