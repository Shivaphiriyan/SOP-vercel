export default function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
      <div className="dashboard-stat-grid">
        <div className="skeleton-pulse" style={{ height: 140, borderRadius: 'var(--radius-lg)' }} />
        <div className="skeleton-pulse" style={{ height: 140, borderRadius: 'var(--radius-lg)' }} />
        <div className="skeleton-pulse" style={{ height: 140, borderRadius: 'var(--radius-lg)' }} />
        <div className="skeleton-pulse" style={{ height: 140, borderRadius: 'var(--radius-lg)' }} />
      </div>
      <div className="dashboard-main-grid">
        <div className="skeleton-pulse" style={{ height: 320, borderRadius: 'var(--radius-lg)' }} />
        <div className="skeleton-pulse" style={{ height: 320, borderRadius: 'var(--radius-lg)' }} />
      </div>
    </div>
  );
}
