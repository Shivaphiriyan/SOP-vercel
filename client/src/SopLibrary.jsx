import React, { useState, useEffect } from 'react';
import { API_URL } from './config/api';
import './SopLibrary.css';
import ChecklistRun from './ChecklistRun';

const SopLibrary = ({ token, decoded, showToast }) => {
  const [sops, setSops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderError, setBuilderError] = useState('');

  const [currentSopId, setCurrentSopId] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [steps, setSteps] = useState([{ description: '', requiresPhoto: false }]);

  const [activeRunSopId, setActiveRunSopId] = useState(null);

  const isAdmin = decoded?.role === 'admin';
  const isAuditor = decoded?.role === 'auditor';

  const [assigningSop, setAssigningSop] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignSuccess, setAssignSuccess] = useState('');

  const handleOpenAssignModal = async (sop) => {
    setAssigningSop(sop);
    setSelectedEmployeeId('');
    setAssignError('');
    setAssignSuccess('');
    
    // Load employees list
    try {
      const res = await fetch(`${API_URL}/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Show all active employees
        setEmployees(data.filter(u => u.status !== 'disabled'));
      } else {
        setAssignError("Failed to fetch employees list.");
      }
    } catch (err) {
      console.error(err);
      setAssignError("Failed to connect to server.");
    }
  };

  const handleCloseAssignModal = () => {
    setAssigningSop(null);
    setEmployees([]);
    setSelectedEmployeeId('');
    setAssignError('');
    setAssignSuccess('');
  };

  const handleAssignSubmit = async () => {
    if (!selectedEmployeeId) return;
    setAssignLoading(true);
    setAssignError('');
    setAssignSuccess('');

    try {
      const res = await fetch(`${API_URL}/checklist-runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sopId: assigningSop.id,
          operatorId: selectedEmployeeId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setAssignError(data.error || 'Failed to assign SOP.');
      } else {
        setAssignSuccess('SOP assigned successfully!');
        setTimeout(() => {
          handleCloseAssignModal();
        }, 1500);
      }
    } catch (err) {
      console.error(err);
      setAssignError('Network error. Please try again later.');
    } finally {
      setAssignLoading(false);
    }
  };

  const fetchSops = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/sops`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load SOP library.');
      } else {
        setSops(data);
      }
    } catch (err) {
      console.error(err);
      setError('Network error. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSops();
  }, [token]);

  const handleDeleteSop = async (sop) => {
    if (!isAdmin) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete the SOP template "${sop.title}"?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`${API_URL}/sops/${sop.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        fetchSops(); // reload library
        if (showToast) {
          showToast(`SOP template "${sop.title}" deleted successfully.`, 'success');
        }
      } else {
        const data = await res.json();
        if (showToast) {
          showToast(data.error || 'Failed to delete SOP.', 'error');
        } else {
          alert(data.error || 'Failed to delete SOP.');
        }
      }
    } catch (err) {
      console.error(err);
      if (showToast) {
        showToast('Network error while deleting SOP.', 'error');
      } else {
        alert('Network error. Please try again later.');
      }
    }
  };

  const openBuilder = (sop = null) => {
    if (!isAdmin) return;
    setBuilderError('');
    if (sop) {
      setCurrentSopId(sop.id);
      setTitle(sop.title || '');
      setCategory(sop.category || '');
      const existingSteps = sop.content?.steps || [];
      if (existingSteps.length > 0) {
        setSteps(existingSteps);
      } else {
        setSteps([{ description: '', requiresPhoto: false }]);
      }
    } else {
      setCurrentSopId(null);
      setTitle('');
      setCategory('');
      setSteps([{ description: '', requiresPhoto: false }]);
    }
    setIsBuilderOpen(true);
  };

  const closeBuilder = () => {
    setIsBuilderOpen(false);
  };

  const handleAddStep = () => {
    setSteps([...steps, { description: '', requiresPhoto: false }]);
  };

  const handleRemoveStep = (index) => {
    const newSteps = [...steps];
    newSteps.splice(index, 1);
    if (newSteps.length === 0) {
      newSteps.push({ description: '', requiresPhoto: false });
    }
    setSteps(newSteps);
  };

  const handleStepChange = (index, field, value) => {
    const newSteps = [...steps];
    newSteps[index][field] = value;
    setSteps(newSteps);
  };

  const handleSave = async (status) => {
    if (!title.trim()) {
      setBuilderError('Title is required.');
      return;
    }

    const filteredSteps = steps.filter(s => s.description.trim() !== '');
    if (filteredSteps.length === 0) {
      setBuilderError('At least one step is required.');
      return;
    }

    setBuilderLoading(true);
    setBuilderError('');

    const payload = {
      title,
      category,
      content: {
        status, // 'draft' or 'published'
        steps: filteredSteps
      }
    };

    try {
      const url = currentSopId 
        ? `${API_URL}/sops/${currentSopId}` 
        : `${API_URL}/sops`;
      const method = currentSopId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        setBuilderError(data.error || 'Failed to save SOP.');
        if (showToast) {
          showToast(data.error || 'Failed to save SOP.', 'error');
        }
      } else {
        setIsBuilderOpen(false);
        fetchSops(); // refresh list
        if (showToast) {
          const actionText = currentSopId ? 'updated' : 'created';
          showToast(`SOP template "${data.title}" ${actionText} successfully.`, 'success');
        }
      }
    } catch (err) {
      console.error(err);
      setBuilderError('Network error while saving.');
      if (showToast) {
        showToast('Network error while saving SOP.', 'error');
      }
    } finally {
      setBuilderLoading(false);
    }
  };

  return (
    <div className="sop-library-container">
      <div className="page-header-container" style={{ marginBottom: 24 }}>
        <div className="page-header">
          <h1>SOP Library</h1>
          <p>Standard Operating Procedures and Checklists for your team.</p>
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
          <p>Loading SOPs...</p>
        </div>
      ) : (
        <div className="sop-grid">
          {isAdmin && (
            <div className="sop-card create-card" onClick={() => openBuilder()}>
              <div className="create-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 24, height: 24}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <span style={{fontWeight: 500}}>Create New SOP</span>
            </div>
          )}

          {sops.map(sop => {
            const status = sop.content?.status || 'published';
            return (
              <div key={sop.id} className="sop-card" style={isAuditor ? { cursor: 'default' } : {}} onClick={() => { if (!isAuditor) openBuilder(sop); }}>
                <div className="sop-card-header">
                  {sop.category ? (
                    <span className="sop-category">{sop.category}</span>
                  ) : <div></div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                    <span className={`status-badge status-${status}`}>
                      {status}
                    </span>
                    {isAdmin && (
                      <button
                        className="btn-delete-sop"
                        title="Delete SOP"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSop(sop);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--error)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: '4px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--error-bg)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: 16, height: 16}}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <h3 className="sop-title">{sop.title}</h3>
                <div className="sop-meta">
                  <div className="meta-item">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: 16, height: 16}}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                    v{sop.version}
                  </div>
                  <div className="meta-item">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: 16, height: 16}}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {new Date(sop.created_at).toLocaleDateString()}
                  </div>
                </div>
                {isAuditor ? (
                  <button 
                    className="btn-primary" 
                    style={{marginTop: '16px', width: '100%', padding: '8px', fontSize: '13px'}}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveRunSopId(sop.id);
                    }}
                  >
                    View SOP Steps
                  </button>
                ) : !isAdmin ? (
                  <button 
                    className="btn-primary" 
                    style={{marginTop: '16px', width: '100%', padding: '8px', fontSize: '13px'}}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveRunSopId(sop.id);
                    }}
                  >
                    Run Checklist
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }} onClick={(e) => e.stopPropagation()}>
                    <button 
                      className="btn-secondary" 
                      style={{ flex: 1, padding: '8px', fontSize: '13px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveRunSopId(sop.id);
                      }}
                    >
                      Run
                    </button>
                    <button 
                      className="btn-primary" 
                      style={{ flex: 1, padding: '8px', fontSize: '13px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAssignModal(sop);
                      }}
                    >
                      Assign
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Builder Overlay */}
      {isBuilderOpen && (
        <div className="builder-overlay">
          <div className="builder-header">
            <div className="builder-title-group">
              <button className="btn-back" onClick={closeBuilder} title="Back to Library">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 24, height: 24}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
              <h2 style={{margin: 0, fontSize: 20}}>{currentSopId ? 'Edit SOP' : 'Create New SOP'}</h2>
            </div>
            <div className="builder-actions">
              <button className="btn-secondary" onClick={() => handleSave('draft')} disabled={builderLoading}>
                {builderLoading ? 'Saving...' : 'Save Draft'}
              </button>
              <button className="btn-primary" onClick={() => handleSave('published')} disabled={builderLoading}>
                {builderLoading ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>

          <div className="builder-content">
            <div className="builder-form">
              {builderError && (
                <div className="error-banner" style={{marginBottom: 24}}>
                  <span>{builderError}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">SOP Title</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Opening Procedure"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Operations"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>

              <div className="steps-container">
                <div className="steps-header">
                  <h3>Checklist Steps</h3>
                </div>

                {steps.map((step, idx) => (
                  <div key={idx} className="step-item">
                    <div className="step-number">{idx + 1}</div>
                    <div className="step-content">
                      <textarea 
                        className="input-field" 
                        rows="2"
                        placeholder="Describe the step..."
                        value={step.description}
                        onChange={(e) => handleStepChange(idx, 'description', e.target.value)}
                      ></textarea>
                      <div className="step-actions">
                        <label className="checkbox-label">
                          <input 
                            type="checkbox" 
                            checked={step.requiresPhoto}
                            onChange={(e) => handleStepChange(idx, 'requiresPhoto', e.target.checked)}
                          />
                          Photo evidence required
                        </label>
                        <button 
                          className="btn-icon-danger" 
                          onClick={() => handleRemoveStep(idx)}
                          title="Remove Step"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: 20, height: 20}}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <button className="btn-secondary" onClick={handleAddStep} style={{marginTop: 16, width: '100%'}}>
                  + Add Step
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {activeRunSopId && (
        <ChecklistRun 
          sopId={activeRunSopId} 
          token={token} 
          decoded={decoded}
          onClose={() => setActiveRunSopId(null)} 
        />
      )}

      {assigningSop && (
        <div className="modal-backdrop" onClick={handleCloseAssignModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Assign SOP</h2>
              <button className="btn-close" onClick={handleCloseAssignModal}>&times;</button>
            </div>
            
            <div className="modal-body">
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Assign <strong>{assigningSop.title}</strong> to an employee.
              </p>
              
              {assignError && (
                <div className="error-banner" style={{ marginBottom: '16px', fontSize: '13px' }}>
                  <span>{assignError}</span>
                </div>
              )}

              {assignSuccess && (
                <div className="success-banner" style={{ marginBottom: '16px', fontSize: '13px', background: 'var(--success-bg)', color: 'var(--success)', padding: '10px 14px', borderRadius: 'var(--radius)' }}>
                  <span>{assignSuccess}</span>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label">Select Employee</label>
                <select 
                  className="input-field" 
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  disabled={assignLoading}
                  style={{ background: 'var(--surface)', color: 'var(--text-h)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px', width: '100%', outline: 'none' }}
                >
                  <option value="">-- Choose an employee --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.username} ({emp.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button 
                  className="btn-secondary" 
                  onClick={handleCloseAssignModal} 
                  disabled={assignLoading}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary" 
                  onClick={handleAssignSubmit} 
                  disabled={assignLoading || !selectedEmployeeId}
                >
                  {assignLoading ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SopLibrary;
