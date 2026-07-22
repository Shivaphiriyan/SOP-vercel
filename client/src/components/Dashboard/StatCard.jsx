export default function StatCard({ title, number, iconColor = 'icon-blue', icon, description, trend, onClick }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  const isUp = trend && trend.startsWith('▲');

  return (
    <div
      className="stat-card-compact"
      tabIndex={0}
      role="button"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={`${title}: ${number}`}
    >
      <div className="stat-card-left">
        <div className={`stat-icon-box ${iconColor}`}>
          {icon}
        </div>
      </div>
      <div className="stat-card-content">
        <span className="stat-title">{title}</span>
        <span className="stat-number">{number}</span>
        <div className="stat-meta">
          <span className="stat-desc">{description}</span>
          {trend && (
            <span className={`stat-trend ${isUp ? 'trend-up' : 'trend-neutral'}`}>
              {trend}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
