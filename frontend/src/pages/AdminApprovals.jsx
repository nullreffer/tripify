import React, { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function AdminApprovals() {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPending = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/approvals`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load approvals');
      setPendingUsers(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
  }, []);

  const approveUser = async (userId) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/approvals/${userId}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve user');
      setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="trips-status"><div className="spinner" /></div>;
  if (error) return <div className="trips-status trips-error">{error}</div>;

  return (
    <div className="admin-list">
      {pendingUsers.length === 0 ? (
        <div className="trips-status trips-empty">No pending approvals.</div>
      ) : (
        pendingUsers.map((user) => (
          <div key={user.id} className="admin-list-item">
            <div>
              <div className="admin-user-name">{user.name}</div>
              <div className="admin-user-email">{user.email}</div>
            </div>
            <button className="btn-primary" onClick={() => approveUser(user.id)}>
              Approve
            </button>
          </div>
        ))
      )}
    </div>
  );
}

export default AdminApprovals;
