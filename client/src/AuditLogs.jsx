import { useState, useEffect } from 'react';
import { API_URL } from './config/api';
import './AuditLogs.css';

export default function AuditLogs({ token, showToast }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    fetchAuditLogs();
  }, [token, page, actionFilter, entityFilter, statusFilter]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      let query = `page=${page}&limit=15`;
      if (search.trim()) query += `&search=${encodeURIComponent(search.trim())}`;
      if (actionFilter) query += `&action=${encodeURIComponent(actionFilter)}`;
      if (entityFilter) query += `&entityType=${encodeURIComponent(entityFilter)}`;
      if (statusFilter) query += `&status=${encodeURIComponent(statusFilter)}`;

      const res = await fetch(`${API_URL}/audit-logs?${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchAuditLogs();
  };

  const formatJsonPretty = (val) => {
    if (!val || (typeof val === 'object' && Object.keys(val).length === 0)) return 'None';
    try {
      return JSON.stringify(val, null, 2);
    } catch (e) {
      return String(val);
    }
  };

  return (
    <div className="audit-page-container">
      <div className="audit-header-title-group">
        <h1 className="audit-title">Audit Logs</h1>
        <p className="audit-subtitle">Immutable security and system action trail for compliance and tracking.</p>
      </div>

      <div className="audit-table-card">
        <form className="audit-filters-bar" onSubmit={handleSearchSubmit}>
          <div className="search-input-wrapper">
            <input
              type="text"
              className="search-input"
              style={{ width: 220 }}
              placeholder="Search descriptions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>

          <select
            className="audit-filter-input"
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            aria-label="Filter by Action"
          >
            <option value="">All Actions</option>
            <option value="auth.login">Auth Login</option>
            <option value="auth.login_failed">Login Failed</option>
            <option value="auth.password_changed">Password Changed</option>
            <option value="leave.submitted">Leave Submitted</option>
            <option value="leave.approved">Leave Approved</option>
            <option value="leave.rejected">Leave Declined</option>
            <option value="sop.created">SOP Created</option>
            <option value="sop.updated">SOP Updated</option>
            <option value="sop.assigned">SOP Assigned</option>
            <option value="sop.signed">SOP Signed</option>
            <option value="attendance.check_in">Check In</option>
            <option value="attendance.check_out">Check Out</option>
            <option value="employee.created">Employee Created</option>
            <option value="settings.updated">Settings Updated</option>
          </select>

          <select
            className="audit-filter-input"
            value={entityFilter}
            onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
            aria-label="Filter by Entity Type"
          >
            <option value="">All Entities</option>
            <option value="user">User</option>
            <option value="leave_request">Leave Request</option>
            <option value="sop_template">SOP Template</option>
            <option value="checklist_run">Checklist Run</option>
            <option value="attendance_log">Attendance Log</option>
            <option value="tenant">Tenant</option>
          </select>

          <select
            className="audit-filter-input"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label="Filter by Status"
          >
            <option value="">All Statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>

          <button type="submit" className="btn-primary" style={{ padding: '6px 14px', fontSize: 12 }}>
            Search
          </button>
        </form>

        <div className="table-wrapper">
          <table className="leave-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Description</th>
                <th>Status</th>
                <th>IP Address</th>
                <th style={{ textAlign: 'right' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No audit log records found matching current query.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const actorDisplay = log.actor_user ? `${log.actor_user.username} (${log.actor_user.role})` : (log.actor_name_snapshot || 'System');
                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="font-semibold">{actorDisplay}</td>
                      <td>
                        <span className="audit-action-tag">{log.action}</span>
                      </td>
                      <td style={{ textTransform: 'capitalize', fontSize: 12 }}>{log.entity_type}</td>
                      <td className="reason-text" title={log.description}>{log.description}</td>
                      <td>
                        <span className={`audit-status-tag audit-status-${log.status}`}>
                          {log.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.ip_address || 'Internal'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="icon-action-btn"
                          onClick={() => setSelectedLog(log)}
                          title="View Full Audit Event Details"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="notif-pagination-row">
            <span>Showing page {page} of {totalPages} ({total} audit events)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                className="btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Audit Detail Modal Drawer */}
      {selectedLog && (
        <div className="modal-backdrop" onClick={() => setSelectedLog(null)}>
          <div className="leave-modal-card" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Audit Event Details</h2>
                <p className="modal-subtitle">ID: {selectedLog.id}</p>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedLog(null)}>&times;</button>
            </div>

            <div className="detail-modal-body">
              <div className="detail-row">
                <span className="detail-label">Action</span>
                <span className="audit-action-tag">{selectedLog.action}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Timestamp</span>
                <span className="detail-value">{new Date(selectedLog.created_at).toUTCString()}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Actor</span>
                <span className="detail-value">
                  {selectedLog.actor_user ? `${selectedLog.actor_user.username} (${selectedLog.actor_user.role})` : (selectedLog.actor_name_snapshot || 'System')}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Target Entity</span>
                <span className="detail-value">{selectedLog.entity_type} {selectedLog.entity_id ? `(${selectedLog.entity_id})` : ''}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Description</span>
                <span className="detail-value">{selectedLog.description}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">HTTP Request Info</span>
                <span className="detail-value">{selectedLog.request_method || 'N/A'} {selectedLog.request_path || ''} | IP: {selectedLog.ip_address || 'Local'}</span>
              </div>
              {selectedLog.user_agent && (
                <div className="detail-row">
                  <span className="detail-label">User Agent</span>
                  <span className="detail-value" style={{ fontSize: 11, wordBreak: 'break-all' }}>{selectedLog.user_agent}</span>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <span className="timeline-title">State Changes & Metadata (Sanitized)</span>
                <div className="json-diff-container">
                  <div>
                    <div className="json-block-title">Old Values</div>
                    <pre className="json-block">{formatJsonPretty(selectedLog.old_values)}</pre>
                  </div>
                  <div>
                    <div className="json-block-title">New Values</div>
                    <pre className="json-block">{formatJsonPretty(selectedLog.new_values)}</pre>
                  </div>
                </div>
                {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="json-block-title">Event Metadata</div>
                    <pre className="json-block">{formatJsonPretty(selectedLog.metadata)}</pre>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer-actions">
              <button className="btn-secondary" onClick={() => setSelectedLog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
