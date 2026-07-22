export default function TodayOverview({ summaryData, role }) {
  const isAdminOrSupervisor = role === 'admin' || role === 'supervisor' || role === 'auditor';

  return (
    <div className="dashboard-panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <svg className="panel-title-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Today's Overview
        </h2>
      </div>

      <div className="today-overview-grid">
        {isAdminOrSupervisor ? (
          <>
            <div className="overview-tile">
              <span className="overview-tile-label">Checklists Completed</span>
              <p className="overview-tile-value">{summaryData?.completedToday ?? 0}</p>
              <span className="overview-tile-sub">Executed today</span>
            </div>

            <div className="overview-tile">
              <span className="overview-tile-label">Pending Leaves</span>
              <p className="overview-tile-value">{summaryData?.pendingLeaves ?? 0}</p>
              <span className="overview-tile-sub">Awaiting review</span>
            </div>

            <div className="overview-tile">
              <span className="overview-tile-label">Active Procedures</span>
              <p className="overview-tile-value">{summaryData?.activeSops ?? 0}</p>
              <span className="overview-tile-sub">Published templates</span>
            </div>

            <div className="overview-tile">
              <span className="overview-tile-label">Team Members</span>
              <p className="overview-tile-value">{summaryData?.totalEmployees ?? 0}</p>
              <span className="overview-tile-sub">Active workforce</span>
            </div>
          </>
        ) : (
          <>
            <div className="overview-tile">
              <span className="overview-tile-label">Hours This Week</span>
              <p className="overview-tile-value">{summaryData?.hoursThisWeek ?? 0}h</p>
              <span className="overview-tile-sub">Recorded time</span>
            </div>

            <div className="overview-tile">
              <span className="overview-tile-label">Assigned Checklists</span>
              <p className="overview-tile-value">{summaryData?.activeChecklists ?? 0}</p>
              <span className="overview-tile-sub">Pending execution</span>
            </div>

            <div className="overview-tile">
              <span className="overview-tile-label">Pending Requests</span>
              <p className="overview-tile-value">{summaryData?.pendingLeaves ?? 0}</p>
              <span className="overview-tile-sub">Submitted leave</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
