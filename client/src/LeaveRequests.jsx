import { useState, useEffect } from 'react';
import { API_URL } from './config/api';
import './LeaveRequests.css';

const LeaveRequests = ({ token, decoded, initialTab = 'my_requests', showToast }) => {
  const [activeTab, setActiveTab] = useState(initialTab); // 'my_requests' or 'team_requests'
  const [myRequests, setMyRequests] = useState([]);
  const [teamRequests, setTeamRequests] = useState([]);

  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Form State inside Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDetailRequest, setSelectedDetailRequest] = useState(null);

  const [leaveType, setLeaveType] = useState('Annual Leave');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);

  // Table Filters State
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

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
      const res = await fetch(`${API_URL}/leave-requests/config`, {
        headers: { Authorization: `Bearer ${token}` }
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
      const res = await fetch(`${API_URL}/leave-requests/me`, {
        headers: { Authorization: `Bearer ${token}` }
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
      const res = await fetch(`${API_URL}/admin/leave-requests`, {
        headers: { Authorization: `Bearer ${token}` }
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

  // Calculate Duration in Days between Start Date and End Date
  const calculateDays = (startStr, endStr) => {
    if (!startStr || !endStr) return 0;
    const s = new Date(startStr);
    const e = new Date(endStr);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e.getTime() < s.getTime()) return 0;
    const diffTime = Math.abs(e.getTime() - s.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const calculatedDuration = calculateDays(startDate, endDate);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setFormLoading(true);

    if (!startDate || !endDate) {
      setFormError('Please select both Start Date and End Date.');
      setFormLoading(false);
      return;
    }

    if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
      setFormError('End date cannot be before start date.');
      setFormLoading(false);
      return;
    }

    if (isEmergency && !reason.trim()) {
      setFormError('Please provide a reason for emergency leave requests.');
      setFormLoading(false);
      return;
    }

    if (!isEmergency) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const minAllowedDate = new Date(today.getTime() + leaveNoticeDays * 24 * 60 * 60 * 1000);
      const start = new Date(startDate);
      if (start.getTime() < minAllowedDate.getTime()) {
        setFormError(`Start date must be at least ${leaveNoticeDays} days from today.`);
        setFormLoading(false);
        return;
      }
    }

    try {
      const res = await fetch(`${API_URL}/leave-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          startDate,
          endDate,
          reason: leaveType !== 'Annual Leave' ? `[${leaveType}] ${reason}` : reason,
          isEmergency
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || 'Failed to submit leave request.');
      } else {
        if (showToast) showToast('Leave request submitted successfully.', 'success');
        setStartDate('');
        setEndDate('');
        setReason('');
        setIsEmergency(false);
        setIsModalOpen(false);
        await fetchMyRequests();
      }
    } catch (err) {
      setFormError('Network error. Please try again later.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      const res = await fetch(`${API_URL}/leave-requests/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });

      if (res.ok) {
        if (showToast) showToast(`Leave request ${status} successfully.`, 'success');
        fetchTeamRequests();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatDateReadable = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Metrics calculation from real data
  const pendingCount = myRequests.filter((r) => r.status === 'pending').length;
  const approvedCount = myRequests.filter((r) => r.status === 'approved').length;
  const declinedCount = myRequests.filter((r) => r.status === 'declined').length;
  const totalDaysRequested = myRequests.reduce((acc, r) => acc + calculateDays(r.start_date, r.end_date), 0);

  // Find nearest upcoming approved or pending request
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const upcomingLeave = myRequests.find((r) => {
    const end = new Date(r.end_date);
    return end >= todayDate && (r.status === 'pending' || r.status === 'approved');
  });

  // Filter My History
  const filteredRequests = myRequests.filter((r) => {
    if (statusFilter !== 'All' && r.status !== statusFilter.toLowerCase()) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const reasonMatch = r.reason?.toLowerCase().includes(q);
      const dateMatch = formatDateReadable(r.start_date).toLowerCase().includes(q);
      if (!reasonMatch && !dateMatch) return false;
    }
    return true;
  });

  return (
    <div className="leave-requests-container">
      {/* 1. Page Header */}
      <div className="leave-page-header">
        <div className="header-left">
          <h1 className="header-title">Leave Requests</h1>
          <p className="header-subtitle">Request time off and track your leave history.</p>
        </div>
        <div className="header-actions">
          {isAdminOrSupervisor && (
            <button
              className="btn-secondary compact-btn"
              onClick={() => setActiveTab(activeTab === 'my_requests' ? 'team_requests' : 'my_requests')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 21c-2.907 0-5.542-1.09-7.533-2.893m0 0A4.125 4.125 0 0110 16.03c1.973 0 3.738.694 5 1.838m-9.75-2.78c.002.083.002.167.002.252H2.25m3.75-2.25a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zm9.75-3a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" />
              </svg>
              {activeTab === 'team_requests' ? 'View My Requests' : 'View Team Requests'}
            </button>
          )}

          {activeTab === 'my_requests' && (
            <button className="btn-primary primary-request-btn" onClick={() => setIsModalOpen(true)}>
              + Request Leave
            </button>
          )}
        </div>
      </div>

      {/* 2. Leave Summary Cards Row */}
      <div className="leave-summary-grid">
        <div className="summary-card">
          <div className="card-top-row">
            <div className="summary-icon-box icon-yellow">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="summary-title">Pending Requests</span>
          </div>
          <span className="summary-value">{pendingCount}</span>
          <span className="summary-sub">Awaiting review</span>
        </div>

        <div className="summary-card">
          <div className="card-top-row">
            <div className="summary-icon-box icon-green">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="summary-title">Approved Leave</span>
          </div>
          <span className="summary-value">{approvedCount} requests</span>
          <span className="summary-sub">This year</span>
        </div>

        <div className="summary-card">
          <div className="card-top-row">
            <div className="summary-icon-box icon-red">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="summary-title">Declined Requests</span>
          </div>
          <span className="summary-value">{declinedCount}</span>
          <span className="summary-sub">This year</span>
        </div>

        <div className="summary-card">
          <div className="card-top-row">
            <div className="summary-icon-box icon-purple">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <span className="summary-title">Total Days Requested</span>
          </div>
          <span className="summary-value">{totalDaysRequested} days</span>
          <span className="summary-sub">Approved & Pending</span>
        </div>
      </div>

      {/* 3. Upcoming Leave Card */}
      {activeTab === 'my_requests' && (
        <div className="upcoming-leave-card">
          <div className="card-header-row">
            <h2 className="card-title">Upcoming Leave</h2>
            {upcomingLeave && (
              <span className={`status-pill ${upcomingLeave.status === 'approved' ? 'pill-approved' : 'pill-pending'}`}>
                <span className="status-dot" />
                {upcomingLeave.status === 'approved' ? 'Approved' : 'Pending Review'}
              </span>
            )}
          </div>

          {upcomingLeave ? (
            <div className="upcoming-leave-content">
              <div className="upcoming-main-info">
                <span className="upcoming-dates">
                  {formatDateReadable(upcomingLeave.start_date)} &ndash; {formatDateReadable(upcomingLeave.end_date)}
                </span>
                <span className="upcoming-duration">
                  {calculateDays(upcomingLeave.start_date, upcomingLeave.end_date)} days
                </span>
              </div>
              <p className="upcoming-reason">{upcomingLeave.reason || 'Personal Time Off'}</p>
              {upcomingLeave.is_emergency && <span className="emergency-badge">Emergency</span>}
            </div>
          ) : (
            <div className="upcoming-empty-state">
              <p className="empty-title">No upcoming leave</p>
              <p className="empty-sub">Your approved or pending leave will appear here.</p>
            </div>
          )}
        </div>
      )}

      {/* 4. Main Section: My Leave Requests or Team Requests */}
      {activeTab === 'my_requests' ? (
        <div className="leave-table-card">
          <div className="table-controls-row">
            <h2 className="card-title">My Leave Requests</h2>

            <div className="filter-controls-group">
              <select
                className="filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by Status"
              >
                <option value="All">All Status</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Declined">Declined</option>
              </select>

              <div className="search-input-wrapper">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search requests..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="leave-table">
              <thead>
                <tr>
                  <th>Date Range</th>
                  <th>Leave Type</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Applied On</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => {
                  const days = calculateDays(req.start_date, req.end_date);
                  return (
                    <tr key={req.id}>
                      <td className="font-semibold">
                        {formatDateReadable(req.start_date)} &ndash; {formatDateReadable(req.end_date)}
                      </td>
                      <td>
                        <span className="type-badge">
                          {req.reason?.startsWith('[') ? req.reason.split(']')[0].replace('[', '') : 'Annual Leave'}
                        </span>
                      </td>
                      <td>{days} {days === 1 ? 'day' : 'days'}</td>
                      <td className="reason-text">{req.reason ? req.reason.replace(/\[.*?\]\s*/, '') : '-'}</td>
                      <td>
                        <div className="status-cell">
                          <span className={`status-badge status-${req.status}`}>
                            {req.status}
                          </span>
                          {req.is_emergency && <span className="emergency-tag-badge">Emergency</span>}
                        </div>
                      </td>
                      <td>{formatDateReadable(req.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="icon-action-btn"
                          onClick={() => setSelectedDetailRequest(req)}
                          title="View Details"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 15, height: 15 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredRequests.length === 0 && !loading && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No leave requests found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Team Leave Requests Table for Admin / Supervisor */
        <div className="leave-table-card">
          <div className="table-controls-row">
            <h2 className="card-title">Team Leave Requests</h2>
          </div>
          <div className="table-wrapper">
            <table className="leave-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Date Range</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Applied On</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teamRequests.map((req) => {
                  const days = calculateDays(req.start_date, req.end_date);
                  const username = req.users_leave_requests_user_idTousers?.username || 'Employee';
                  return (
                    <tr key={req.id}>
                      <td>
                        <div className="user-cell">
                          <div className="user-avatar-sm">{username.substring(0, 2).toUpperCase()}</div>
                          <span className="font-semibold">{username}</span>
                        </div>
                      </td>
                      <td>
                        <span className="role-badge">{req.users_leave_requests_user_idTousers?.role}</span>
                      </td>
                      <td>{formatDateReadable(req.start_date)} &ndash; {formatDateReadable(req.end_date)}</td>
                      <td>{days} days</td>
                      <td className="reason-text">{req.reason || '-'}</td>
                      <td>
                        <div className="status-cell">
                          <span className={`status-badge status-${req.status}`}>{req.status}</span>
                          {req.is_emergency && <span className="emergency-tag-badge">Emergency</span>}
                        </div>
                      </td>
                      <td>{formatDateReadable(req.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {req.status === 'pending' ? (
                          <div className="action-buttons-group">
                            <button className="btn-approve-sm" onClick={() => handleUpdateStatus(req.id, 'approved')}>
                              Approve
                            </button>
                            <button className="btn-decline-sm" onClick={() => handleUpdateStatus(req.id, 'declined')}>
                              Decline
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-sm">Reviewed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {teamRequests.length === 0 && !loading && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No team leave requests found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Request Leave Modal / Side Drawer */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="leave-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Request Leave</h2>
                <p className="modal-subtitle">Submit a leave request for approval.</p>
              </div>
              <button className="modal-close-btn" onClick={() => setIsModalOpen(false)} aria-label="Close modal">
                &times;
              </button>
            </div>

            {formError && (
              <div className="error-banner">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label className="form-label">Leave Type</label>
                <select className="input-field" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                  <option value="Annual Leave">Annual Leave</option>
                  <option value="Medical Leave">Medical Leave</option>
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Unpaid Leave">Unpaid Leave</option>
                </select>
              </div>

              <div className="form-row-2col">
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
              </div>

              {calculatedDuration > 0 && (
                <div className="duration-badge-box">
                  <span>Duration:</span>
                  <strong>{calculatedDuration} {calculatedDuration === 1 ? 'day' : 'days'}</strong>
                </div>
              )}

              <div className="form-checkbox-row">
                <input
                  type="checkbox"
                  id="isEmergencyModal"
                  checked={isEmergency}
                  onChange={(e) => setIsEmergency(e.target.checked)}
                />
                <label htmlFor="isEmergencyModal" className="checkbox-label">
                  This is an emergency request (bypasses 5-day advance notice requirement)
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">Reason</label>
                <textarea
                  className="input-field"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Provide details or reason for leave..."
                />
              </div>

              <div className="notice-info-banner">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <span>Note: Standard leave requires at least {leaveNoticeDays} days notice. Emergency requests require a valid reason.</span>
              </div>

              <div className="modal-footer-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={formLoading}>
                  {formLoading ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Leave Details Modal */}
      {selectedDetailRequest && (
        <div className="modal-backdrop" onClick={() => setSelectedDetailRequest(null)}>
          <div className="leave-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Leave Request Details</h2>
                <p className="modal-subtitle">Submitted on {formatDateReadable(selectedDetailRequest.created_at)}</p>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedDetailRequest(null)} aria-label="Close modal">
                &times;
              </button>
            </div>

            <div className="detail-modal-body">
              <div className="detail-row">
                <span className="detail-label">Date Range:</span>
                <span className="detail-value font-semibold">
                  {formatDateReadable(selectedDetailRequest.start_date)} &ndash; {formatDateReadable(selectedDetailRequest.end_date)}
                </span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Duration:</span>
                <span className="detail-value">{calculateDays(selectedDetailRequest.start_date, selectedDetailRequest.end_date)} days</span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Status:</span>
                <span className={`status-badge status-${selectedDetailRequest.status}`}>{selectedDetailRequest.status}</span>
              </div>

              {selectedDetailRequest.is_emergency && (
                <div className="detail-row">
                  <span className="detail-label">Type:</span>
                  <span className="emergency-tag-badge">Emergency Request</span>
                </div>
              )}

              <div className="detail-row">
                <span className="detail-label">Reason:</span>
                <span className="detail-value">{selectedDetailRequest.reason || 'None provided'}</span>
              </div>

              {/* Approval Timeline */}
              <div className="approval-timeline">
                <h4 className="timeline-title">Approval Status</h4>
                <div className="timeline-step step-done">
                  <span className="step-dot" />
                  <div>
                    <strong>Submitted</strong>
                    <p>{formatDateReadable(selectedDetailRequest.created_at)}</p>
                  </div>
                </div>

                <div className={`timeline-step ${selectedDetailRequest.status !== 'pending' ? 'step-done' : 'step-current'}`}>
                  <span className="step-dot" />
                  <div>
                    <strong>{selectedDetailRequest.status === 'pending' ? 'Awaiting Review' : selectedDetailRequest.status === 'approved' ? 'Approved' : 'Declined'}</strong>
                    <p>{selectedDetailRequest.reviewed_at ? `Reviewed on ${formatDateReadable(selectedDetailRequest.reviewed_at)}` : 'Pending manager approval'}</p>
                  </div>
                </div>
              </div>

              <div className="modal-footer-actions" style={{ marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setSelectedDetailRequest(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveRequests;
