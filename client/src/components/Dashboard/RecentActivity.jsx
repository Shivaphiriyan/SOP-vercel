import { useState } from 'react';

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'Just now';
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now.getTime() - past.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return past.toLocaleDateString();
};

const parseActivityMessage = (rawMessage, isSelf, role) => {
  if (!rawMessage) return { user: 'System', formattedAction: 'updated workspace record', category: 'Audit' };

  let category = 'Audit';
  let user = 'System';

  const parts = rawMessage.split(' ');
  if (parts.length > 0) {
    user = parts[0];
  }

  if ((isSelf || user === 'You') && (role === 'operator' || role === 'employee')) {
    user = 'You';
  }

  const lower = rawMessage.toLowerCase();
  if (lower.includes('signed checklist') || lower.includes('checklist') || lower.includes('step')) {
    category = 'Checklist';
  } else if (lower.includes('viewed') || lower.includes('sop') || lower.includes('template') || lower.includes('created sop')) {
    category = 'SOP';
  } else if (lower.includes('attendance') || lower.includes('check-in') || lower.includes('check-out') || lower.includes('clock')) {
    category = 'Attendance';
  } else if (lower.includes('leave') || lower.includes('approved') || lower.includes('declined')) {
    category = 'Leave';
  } else if (lower.includes('team') || lower.includes('user') || lower.includes('role')) {
    category = 'Team';
  } else if (lower.includes('payroll')) {
    category = 'Payroll';
  }

  let formattedAction = rawMessage.replace(user, '').trim();
  if (formattedAction.startsWith('signed checklist run for')) {
    formattedAction = formattedAction.replace('signed checklist run for', 'completed');
  }

  return {
    user,
    formattedAction: formattedAction || 'updated record',
    category
  };
};

const getAvatarColor = (user) => {
  const u = (user || '').toLowerCase();
  if (u === 'you') return '#8b5cf6';
  if (u.includes('admin') || u.includes('ad')) return '#10b981';
  if (u.includes('super') || u.includes('su')) return '#f97316';
  if (u.includes('op') || u.includes('user')) return '#8b5cf6';
  return '#3b82f6';
};

export default function RecentActivity({ activityData, role, onNavigate, canViewAuditLogs, isLoading, isError, onRetry }) {
  const [activeFilter, setActiveFilter] = useState('All');

  const isAdminOrSupervisor = role === 'admin' || role === 'supervisor';
  const isAuditor = role === 'auditor';

  // Role-specific Header Title & Subtitle
  const headerTitle = isAdminOrSupervisor
    ? 'Recent Activity'
    : isAuditor
    ? 'Audit Activity'
    : 'My Recent Activity';

  const headerSub = isAdminOrSupervisor
    ? 'All team activity'
    : isAuditor
    ? 'System audit trail'
    : 'Your personal activities';

  // Role-specific Allowed Category Filter Chips
  const allowedCategories = isAdminOrSupervisor
    ? ['All', 'SOP', 'Checklist', 'Attendance', 'Leave', 'Team', 'Audit', 'Payroll']
    : isAuditor
    ? ['All', 'SOP', 'Checklist', 'Audit', 'Attendance']
    : ['All', 'SOP', 'Checklist', 'Attendance', 'Leave'];

  // Empty state title based on role
  const emptyTitle = isAdminOrSupervisor
    ? 'No recent team activity'
    : isAuditor
    ? 'No recent audit activity'
    : 'No recent activity yet';

  const parsedItems = (activityData || []).map((item) => {
    const parsed = parseActivityMessage(item.message, item.isSelf, role);
    return {
      ...item,
      ...parsed
    };
  });

  const filteredItems = parsedItems.filter((item) => {
    if (activeFilter === 'All') return true;
    return item.category.toUpperCase() === activeFilter.toUpperCase();
  });

  return (
    <div className="recent-activity-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <svg className="panel-title-icon" style={{ width: 18, height: 18, minWidth: 18, minHeight: 18, color: '#8b5cf6' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {headerTitle}
          </h2>
          <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 2 }}>{headerSub}</span>
        </div>
        {canViewAuditLogs && (
          <button
            className="btn-secondary compact-btn"
            onClick={() => onNavigate('audit_log')}
          >
            View all activity &rarr;
          </button>
        )}
      </div>

      {/* Role-specific Filter Chips */}
      <div className="activity-filters" role="tablist" aria-label="Activity Categories">
        {allowedCategories.map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={activeFilter === cat}
            className={`filter-btn ${activeFilter === cat ? 'active' : ''}`}
            onClick={() => setActiveFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Skeleton Loading State */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="skeleton-pulse" style={{ height: 48, borderRadius: 10 }} />
          <div className="skeleton-pulse" style={{ height: 48, borderRadius: 10 }} />
          <div className="skeleton-pulse" style={{ height: 48, borderRadius: 10 }} />
        </div>
      ) : isError ? (
        /* Error State */
        <div className="compact-empty-activity">
          <span className="empty-act-title">Unable to load recent activity</span>
          {onRetry && (
            <button className="btn-secondary compact-btn" style={{ marginTop: 8 }} onClick={onRetry}>
              Retry Loading
            </button>
          )}
        </div>
      ) : filteredItems.length === 0 ? (
        /* Compact Empty State */
        <div className="compact-empty-activity">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 24, height: 24, color: '#64748b' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="empty-act-title">{emptyTitle}</span>
          <span className="empty-act-sub">Activities will appear here</span>
        </div>
      ) : (
        /* Role-Aware Activity Timeline */
        <div className="timeline-list">
          {filteredItems.map((item) => {
            const initials = item.user ? item.user.substring(0, 2).toUpperCase() : 'SY';
            const avatarBg = getAvatarColor(item.user);
            return (
              <div key={item.id} className="timeline-item">
                <div
                  className="timeline-avatar"
                  aria-hidden="true"
                  style={{ backgroundColor: avatarBg }}
                >
                  {initials}
                </div>
                <div className="timeline-content">
                  <div className="timeline-header-row">
                    <p className="timeline-main-text">
                      <span className="employee-highlight">{item.user}</span> {item.formattedAction}
                    </p>
                    <span className="timeline-time">{formatTimeAgo(item.timestamp)}</span>
                  </div>
                  <div className="timeline-meta">
                    <span className={`category-tag tag-${item.category.toLowerCase()}`}>
                      {item.category}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="timeline-end-marker">
            <span>&bull; End of activity trail</span>
          </div>
        </div>
      )}
    </div>
  );
}
