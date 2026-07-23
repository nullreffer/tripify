import React from 'react';
import { useAuth } from '../App.jsx';

function PendingApproval() {
  const { user } = useAuth();

  return (
    <div className="pending-page">
      <div className="pending-card">
        <h1>Approval pending</h1>
        <p>
          Your account <strong>{user?.email}</strong> is waiting for admin approval.
        </p>
        <p>
          You’ll be able to access Tripify once approved.
        </p>
      </div>
    </div>
  );
}

export default PendingApproval;
