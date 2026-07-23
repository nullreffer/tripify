import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import NavBar from '../components/NavBar.jsx';

function AdminLayout() {
  return (
    <div className="dashboard">
      <NavBar />
      <main className="main-content admin-content">
        <div className="admin-header-row">
          <h2 className="trips-title">Admin</h2>
          <div className="admin-nav-tabs">
            <NavLink
              to="/admin/reports"
              className={({ isActive }) => `admin-tab${isActive ? ' admin-tab-active' : ''}`}
            >
              Reports
            </NavLink>
            <NavLink
              to="/admin/approvals"
              className={({ isActive }) => `admin-tab${isActive ? ' admin-tab-active' : ''}`}
            >
              Approvals
            </NavLink>
          </div>
        </div>

        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
