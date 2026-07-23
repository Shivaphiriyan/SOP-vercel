import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../../config/api';
import './NotificationBell.css';

export default function NotificationBell({ token, onNavigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 35000); // 35s polling

    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (isOpen) {
      fetchLatestNotifications();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const res = await fetch(`${API_URL}/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      // Silent error handling for background polling
    }
  };

  const fetchLatestNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/notifications?limit=6`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        if (typeof data.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`${API_URL}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
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
        setUnreadCount(0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleItemClick = (notif) => {
    if (!notif.is_read) {
      handleMarkAsRead(notif.id);
    }
    setIsOpen(false);
    if (notif.action_url && onNavigate) {
      const tabName = notif.action_url.replace(/^\//, '');
      onNavigate(tabName);
    }
  };

  const getRelativeTime = (dateStr) => {
    if (!dateStr) return '';
    const diff = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getTypeStyle = (type) => {
    if (type?.includes('leave_approved') || type?.includes('evidence_approved') || type?.includes('activated')) {
      return { bg: 'var(--success-soft)', color: 'var(--success)' };
    }
    if (type?.includes('rejected') || type?.includes('declined')) {
      return { bg: 'var(--danger-soft)', color: 'var(--danger)' };
    }
    if (type?.includes('security') || type?.includes('emergency')) {
      return { bg: 'var(--warning-soft)', color: 'var(--warning)' };
    }
    return { bg: 'var(--primary-soft)', color: 'var(--primary)' };
  };

  return (
    <div className="notification-bell-container" ref={dropdownRef}>
      <button
        className="bell-trigger-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" style={{ width: 20, height: 20 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="bell-unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="dropdown-header">
            <div className="dropdown-title-group">
              <h3 className="dropdown-title">Notifications</h3>
              {unreadCount > 0 && <span className="unread-count-pill">{unreadCount} new</span>}
            </div>
            {unreadCount > 0 && (
              <button className="mark-read-all-btn" onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>

          <div className="dropdown-body">
            {loading ? (
              <div className="dropdown-empty-state">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="dropdown-empty-state">No notifications yet</div>
            ) : (
              notifications.map((n) => {
                const style = getTypeStyle(n.type);
                return (
                  <div
                    key={n.id}
                    className={`notif-item ${!n.is_read ? 'unread' : ''}`}
                    onClick={() => handleItemClick(n)}
                  >
                    <div className="notif-icon-box" style={{ background: style.bg, color: style.color }}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                      </svg>
                    </div>
                    <div className="notif-content">
                      <p className="notif-item-title">{n.title}</p>
                      <p className="notif-item-message">{n.message}</p>
                      <span className="notif-item-time">{getRelativeTime(n.created_at)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="dropdown-footer">
            <button
              className="view-all-link"
              onClick={() => {
                setIsOpen(false);
                if (onNavigate) onNavigate('notifications');
              }}
            >
              View All Notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
