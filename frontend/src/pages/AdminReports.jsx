import React, { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function AdminReports() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/reports`, { credentials: 'include' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load reports');
        setReport(data);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="trips-status trips-error">{error}</div>;
  if (!report) return <div className="trips-status"><div className="spinner" /></div>;

  const cards = [
    ['Total users', report.totalUsers],
    ['Approved users', report.approvedUsers],
    ['Pending users', report.pendingUsers],
    ['Trips', report.totalTrips],
    ['Invites created', report.totalInvites],
    ['Invites used', report.usedInvites],
  ];

  return (
    <div className="admin-grid">
      {cards.map(([label, value]) => (
        <div key={label} className="admin-card">
          <div className="admin-card-label">{label}</div>
          <div className="admin-card-value">{value}</div>
        </div>
      ))}
    </div>
  );
}

export default AdminReports;
