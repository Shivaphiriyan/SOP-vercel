import React, { useState, useEffect } from 'react';
import { API_URL } from './config/api';
import './SopLibrary.css'; // Reuse existing card styles
import ChecklistRun from './ChecklistRun';

const MyTasks = ({ token, decoded, refreshKey }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeRunId, setActiveRunId] = useState(null);

  const fetchTasks = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/checklist-runs/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load assigned tasks.');
      } else {
        setTasks(data);
      }
    } catch (err) {
      console.error(err);
      setError('Network error. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [token, refreshKey]);

  const handleCloseRun = () => {
    setActiveRunId(null);
    fetchTasks(); // Refresh list to remove completed tasks or update progress
  };

  return (
    <div className="sop-library-container">
      <div className="page-header-container" style={{ marginBottom: 24 }}>
        <div className="page-header">
          <h1>My Tasks</h1>
          <p>Your assigned checklist runs that require action.</p>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{marginBottom: 24}}>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="loading-spinner-container">
          <div className="spinner"></div>
          <p>Loading assigned tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="card" style={{padding: 48, textAlign: 'center', color: 'var(--text-muted)'}}>
          <h3 style={{color: 'var(--text-h)', marginBottom: 8}}>All caught up!</h3>
          <p>You have no pending assigned checklists.</p>
        </div>
      ) : (
        <div className="sop-grid">
          {tasks.map(run => {
            const sop = run.sop_templates;
            const completedSteps = run.steps.filter(s => s.completed_at).length;
            const totalSteps = run.steps.length;
            const actionText = completedSteps === 0 ? 'Start' : 'Continue';

            return (
              <div key={run.id} className="sop-card">
                <div className="sop-card-header">
                  {sop?.category ? (
                    <span className="sop-category">{sop.category}</span>
                  ) : <div></div>}
                  <span className="status-badge status-warning">
                    {completedSteps} / {totalSteps} Steps
                  </span>
                </div>
                <h3 className="sop-title">{sop?.title || 'Unknown SOP'}</h3>
                <div className="sop-meta">
                  <div className="meta-item">
                    Assigned Run #{run.id.substring(0, 8)}
                  </div>
                </div>
                <button 
                  className="btn-primary" 
                  style={{marginTop: '16px', width: '100%', padding: '8px', fontSize: '13px'}}
                  onClick={() => setActiveRunId(run.id)}
                >
                  {actionText}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeRunId && (
        <ChecklistRun 
          runId={activeRunId} 
          token={token} 
          onClose={handleCloseRun} 
        />
      )}
    </div>
  );
};

export default MyTasks;
