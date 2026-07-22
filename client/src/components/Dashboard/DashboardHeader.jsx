import ThemeToggle from '../ThemeToggle';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'GOOD MORNING';
  if (hour < 17) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
};

const formatDate = () => {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export default function DashboardHeader({ username, tenantSlug, role, onNavigate }) {
  const greeting = getGreeting();
  const formattedDate = formatDate();
  const isAdminOrSupervisor = role === 'admin' || role === 'supervisor';
  const isAuditor = role === 'auditor';

  const displayUser = username ? username.charAt(0).toUpperCase() + username.slice(1) : 'User';

  return (
    <div className="dashboard-header-card" tabIndex={0}>
      <div className="dashboard-welcome-info">
        <div className="dashboard-greeting-badge">
          <span className="greeting-dot" aria-hidden="true" />
          <span>{greeting}</span>
        </div>
        <h1 className="dashboard-title">
          Welcome back, {displayUser} 👋
        </h1>
        <p className="dashboard-subtitle">
          <span>{formattedDate}</span>
          <span className="workspace-badge">{tenantSlug || 'Workspace'}</span>
        </p>
      </div>

      <div className="dashboard-header-actions">
        {isAdminOrSupervisor && (
          <>
            <button
              className="btn-secondary compact-btn"
              onClick={() => onNavigate('leave_requests', 'team_requests')}
              aria-label="Approve or decline employee leave requests"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 15, height: 15 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Approve/Decline Leaves
            </button>
            <button
              className="btn-primary compact-btn"
              onClick={() => onNavigate('sops')}
              aria-label="Create a new SOP procedure template"
            >
              + Create SOP
            </button>
          </>
        )}

        {!isAdminOrSupervisor && !isAuditor && (
          <button
            className="btn-primary compact-btn"
            onClick={() => onNavigate('attendance')}
            aria-label="Clock In or Check Out for today"
          >
            Check In / Check Out &rarr;
          </button>
        )}

        <ThemeToggle />
      </div>
    </div>
  );
}
