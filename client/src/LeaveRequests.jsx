import React, { useState, useEffect } from 'react';
import './LeaveRequests.css';

const LeaveRequests = ({ token, decoded, initialTab = 'my_requests', showToast }) => {
  const [activeTab, setActiveTab] = useState(initialTab); // 'my_requests' or 'team_requests'
  const [myRequests, setMyRequests] = useState([]);
  const [teamRequests, setTeamRequests] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);

  const [leaveNoticeDays, setLeaveNoticeDays] = useState(3);
  const isAdminOrSupervisor = decoded?.role === 'admin' || decoded?.role === 'supervisor';

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    fetchMyRequests();
    fetchLeaveConfig();
    if (isAdminOrSupervisor && activeTab === 'team_requests') {
      fetchTeamRequests();
    }
  }, [token, activeTab]);

  const fetchLeaveConfig = async () => {
    try {
      const res = await fetch('http://localhost:5000/leave-requests/config', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLeaveNoticeDays(data.leave_notice_days);
      }
    } catch (err) {
      console.error('Error fetching leave config:', err);
    }
  };

  const fetchMyRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:5000/leave-requests/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMyRequests(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:5000/admin/leave-requests', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTeamRequests(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setFormLoading(true);

    if (!isEmergency) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const minAllowedDate = new Date(today.getTime() + leaveNoticeDays * 24 * 60 * 60 * 1000);
      const start = new Date(startDate);
      if (start.getTime() < minAllowedDate.getTime()) {
        setFormError(`Cannot request leave: Leave requests must be submitted at least ${leaveNoticeDays} days in advance.`);
        setFormLoading(false);
        return;
      }
    }

    try {
      const res = await fetch('http://localhost:5000/leave-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ startDate, endDate, reason, isEmergency })
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || 'Failed to submit leave request.');
      } else {
        setFormSuccess('Leave request submitted successfully.');
        setStartDate('');
        setEndDate('');
        setReason('');
        setIsEmergency(false);
        // Add to history immediately
        setMyRequests([data, ...myRequests]);
      }
    } catch (err) {
      setFormError('Network error. Please try again later.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      const res = await fetch(`http://localhost:5000/leave-requests/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      
      if (res.ok) {
        fetchTeamRequests();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved': return <span className="status-badge status-approved">Approved</span>;
      case 'declined': return <span className="status-badge status-declined">Declined</span>;
      case 'pending': return <span className="status-badge status-pending">Pending</span>;
      default: return <span className="status-badge">{status}</span>;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="leave-requests-container">
      <div className="page-header-container" style={{ marginBottom: 24 }}>
        <div className="page-header">
          <h1>Leave Requests</h1>
          <p>Request time off and track your leave history.</p>
        </div>
        {isAdminOrSupervisor && (
          <div className="quick-actions">
            <button 
              className="btn-secondary toggle-admin-btn" 
              onClick={() => setActiveTab(activeTab === 'my_requests' ? 'team_requests' : 'my_requests')}
            >
              {activeTab === 'team_requests' ? "View My Requests" : "View Team Requests"}
            </button>
          </div>
        )}
      </div>

      {activeTab === 'my_requests' ? (
        <div className="leave-grid">
          <div className="leave-form-panel">
            <h3>Request Leave</h3>
            <p className="field-help-text" style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Note: Leave requests need at least {leaveNoticeDays} days' notice.
            </p>
            {formError && (
              <div className="error-banner" style={{marginBottom: 16}}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 18, height: 18}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{formError}</span>
              </div>
            )}
            {formSuccess && (
              <div className="success-banner" style={{marginBottom: 16}}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 18, height: 18}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{formSuccess}</span>
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input 
                  type="date" 
                  className="input-field" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">End Date</label>
                <input 
                  type="date" 
                  className="input-field" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <input 
                  type="checkbox" 
                  id="isEmergency"
                  checked={isEmergency}
                  onChange={(e) => setIsEmergency(e.target.checked)}
                  style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
                />
                <label htmlFor="isEmergency" className="form-label" style={{ margin: 0, cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  This is an emergency (no advance notice required)
                </label>
              </div>
              <div className="form-group">
                <label className="form-label">Reason</label>
                <textarea 
                  className="input-field" 
                  rows="3"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Optional reason for leave"
                ></textarea>
              </div>
              <button 
                type="submit" 
                className="btn-primary" 
                disabled={formLoading}
                style={{width: '100%'}}
              >
                {formLoading ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          </div>
          <div className="leave-history-panel">
            <h3>My History</h3>
            <div className="data-table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date Range</th>
                    <th>Reason</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {myRequests.map(req => (
                    <tr key={req.id}>
                      <td>{formatDate(req.start_date)} - {formatDate(req.end_date)}</td>
                      <td>{req.reason || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {getStatusBadge(req.status)}
                          {req.is_emergency && (
                            <span className="status-badge" style={{ background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid rgba(239, 68, 68, 0.4)', fontSize: '11px', textTransform: 'capitalize' }}>
                              Emergency
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {myRequests.length === 0 && !loading && (
                    <tr>
                      <td colSpan="3" style={{textAlign: 'center', padding: '48px', color: 'var(--text-muted)'}}>No leave requests found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <h3>Team Leave Requests</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Date Range</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teamRequests.map(req => (
                <tr key={req.id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar-sm">
                        {(req.users_leave_requests_user_idTousers?.username || 'U').substring(0, 2).toUpperCase()}
                      </div>
                      <span className="user-name-text">{req.users_leave_requests_user_idTousers?.username}</span>
                    </div>
                  </td>
                  <td><span className="role-text">{req.users_leave_requests_user_idTousers?.role}</span></td>
                  <td>{formatDate(req.start_date)} - {formatDate(req.end_date)}</td>
                  <td>{req.reason || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {getStatusBadge(req.status)}
                      {req.is_emergency && (
                        <span className="status-badge" style={{ background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid rgba(239, 68, 68, 0.4)', fontSize: '11px', textTransform: 'capitalize' }}>
                          Emergency
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    {req.status === 'pending' && (
                      <div className="action-buttons">
                        <button className="btn-approve" onClick={() => handleUpdateStatus(req.id, 'approved')}>Approve</button>
                        <button className="btn-decline" onClick={() => handleUpdateStatus(req.id, 'declined')}>Decline</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {teamRequests.length === 0 && !loading && (
                <tr>
                  <td colSpan="6" style={{textAlign: 'center', padding: '48px', color: 'var(--text-muted)'}}>No team leave requests found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LeaveRequests;
