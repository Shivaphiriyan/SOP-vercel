import React from 'react';

/**
 * NotFound Component
 * Displays a friendly 404 screen when the hash route doesn't match any valid tab.
 */
export default function NotFound({ setActiveTab }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', width: '100%' }}>
      <div style={{ maxWidth: '450px', margin: '0 auto', padding: '40px', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: 56, height: 56, marginBottom: 20, color: 'var(--primary)'}}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <h2 style={{ color: 'var(--text-h)', marginBottom: '12px', fontSize: '22px', fontWeight: 600 }}>Page Not Found</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.6', marginBottom: '24px' }}>
          The page you are looking for does not exist or has been moved.
        </p>
        <button 
          onClick={() => setActiveTab('dashboard')}
          className="btn-primary"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
