import { useState, useEffect } from 'react';
import { API_URL } from './config/api';
import './Notifications.css';

export default function Notifications({ token, onNavigate, showToast }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'unread', 'read'
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchNotifications();
  }, [token, filter, typeFilter, page]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      let query = `page=${page}&limit=15`;
      if (filter === 'unread') query += '&isRead=false';
      if (filter === 'read') query += '&isRead=true';
      if (typeFilter !== 'all') query += `&type=${typeFilter}`;

      const res = await fetch(`${API_URL}/notifications?${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      const res = await fetch(`${API_URL}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        );
        if (showToast) showToast('Notification marked as read', 'info');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch(`${API_URL}/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        if (showToast) showToast('All notifications marked as read', 'success');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_URL}/notifications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        setTotal((prev) => Math.max(0, prev - 1));
        if (showToast) showToast('Notification deleted', 'info');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getRelativeTime = (dateStr) => {
    if (!dateStr) return '';
    const diff = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago (${new Date(dateStr).toLocaleDateString()})`;
  };

  return (
    <div className="notifications-page-container">
      <div className="notif-header-row">
        <div>
          <h1 className="notif-title">Notifications</h1>
          <p className="notif-subtitle">View and manage your in-app alerts and updates.</p>
        </div>
        <button className="btn-primary" onClick={handleMarkAllRead}>
          Mark All as Read
        </button>
      </div>

      <div className="notif-card-panel">
        <div className="notif-controls-row">
          <div className="notif-tabs">
            <button
              className={`notif-tab-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => { setFilter('all'); setPage(1); }}
            >
              All
            </button>
            <button
              className={`notif-tab-btn ${filter === 'unread' ? 'active' : ''}`}
              onClick={() => { setFilter('unread'); setPage(1); }}
            >
              Unread
            </button>
            <button
              className={`notif-tab-btn ${filter === 'read' ? 'active' : ''}`}
              onClick={() => { setFilter('read'); setPage(1); }}
            >
              Read
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Filter Type:</span>
            <select
              className="filter-select"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              aria-label="Filter by notification type"
            >
              <option value="all">All Types</option>
              <option value="leave_submitted">Leave Requests</option>
              <option value="sop_assigned">SOP Assignments</option>
              <option value="security_update">Security Alerts</option>
              <option value="account_activated">Account Status</option>
            </select>
          </div>
        </div>

        <div className="notif-list-container">
          {loading ? (
            <div style={{ padding: '36px', textOverflow: 'ellipsis', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No notifications found matching current filters.
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={`notif-row-card ${!n.is_read ? 'unread' : ''}`}>
                <div className="notif-left-group">
                  <div className="notif-icon-large" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                    </svg>
                  </div>
                  <div className="notif-main-details">
                    <p className="notif-row-title">{n.title}</p>
                    <p className="notif-row-message">{n.message}</p>
                    <div className="notif-row-meta">
                      <span className="notif-type-tag">{n.type.replace(/_/g, ' ')}</span>
                      <span>{getRelativeTime(n.created_at)}</span>
                      {n.actor_user && <span>From: {n.actor_user.username} ({n.actor_user.role})</span>}
                    </div>
                  </div>
                </div>

                <div className="notif-actions-right">
                  {!n.is_read && (
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleMarkAsRead(n.id)}>
                      Mark Read
                    </button>
                  )}
                  {n.action_url && onNavigate && (
                    <button
                      className="action-link-btn"
                      onClick={() => onNavigate(n.action_url.replace(/^\//, ''))}
                    >
                      Open Link
                    </button>
                  )}
                  <button
                    className="icon-action-btn"
                    style={{ color: 'var(--danger)', padding: 6 }}
                    title="Delete Notification"
                    onClick={() => handleDelete(n.id)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="notif-pagination-row">
            <span>Showing page {page} of {totalPages} ({total} items)</span>
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
    </div>
  );
}
