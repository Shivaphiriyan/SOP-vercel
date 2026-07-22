export default function EmptyState({ title = 'No data available', description = 'There are no records to display at this time.', onRetry, actionText }) {
  return (
    <div className="empty-state-box">
      <svg className="empty-state-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.5h3m-6 3h6m-9-9h15.75c.621 0 1.125.504 1.125 1.125v.75c0 .621-.504 1.125-1.125 1.125H3.75c-.621 0-1.125-.504-1.125-1.125v-.75c0-.621.504-1.125 1.125-1.125z" />
      </svg>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc">{description}</p>
      {onRetry && (
        <button className="btn-secondary" style={{ marginTop: 8 }} onClick={onRetry}>
          {actionText || 'Retry'}
        </button>
      )}
    </div>
  );
}
