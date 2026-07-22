import React from 'react';

/**
 * ErrorBoundary Component
 * Catches unhandled runtime crashes in React child components and shows a clean, user-friendly fallback screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the unhandled error details for local developer diagnostics
    console.error('ErrorBoundary caught an unhandled React crash:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100vw', padding: '20px', background: 'var(--body-bg, #f8fafc)', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: '480px', width: '100%', padding: '40px', background: 'var(--card-bg, #ffffff)', borderRadius: 'var(--radius-lg, 12px)', border: '1px solid var(--border, #e2e8f0)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 64, height: 64, marginBottom: 24, color: 'var(--error, #ef4444)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z" />
            </svg>
            <h2 style={{ color: 'var(--text-h, #0f172a)', marginBottom: '12px', fontSize: '24px', fontWeight: 700 }}>Something went wrong</h2>
            <p style={{ color: 'var(--text-muted, #64748b)', fontSize: '15px', lineHeight: '1.6', marginBottom: '28px' }}>
              An unexpected error occurred in the interface. Please refresh the page to reload the application.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
