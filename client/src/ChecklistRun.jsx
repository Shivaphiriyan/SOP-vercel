import React, { useState, useEffect, useRef } from 'react';
import './ChecklistRun.css';

const ChecklistRun = ({ runId: initialRunId, sopId, token, decoded, onClose }) => {
  let userRole = decoded?.role;
  if (!userRole && token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userRole = payload.role;
    } catch (e) {}
  }
  const isAuditor = userRole === 'auditor';
  const isAdminOrSupervisorUser = userRole === 'admin' || userRole === 'supervisor';
  const [runId, setRunId] = useState(initialRunId);
  const [sop, setSop] = useState(null);
  const [run, setRun] = useState(null);
  const [steps, setSteps] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [scrollPercent, setScrollPercent] = useState(0);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState('');
  const [signSuccess, setSignSuccess] = useState(false);

  const [uploadingStep, setUploadingStep] = useState(null);
  const [previewUrls, setPreviewUrls] = useState({});
  const [uploadErrors, setUploadErrors] = useState({});
  const [uploadSuccesses, setUploadSuccesses] = useState({});

  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState('');
  const [overriding, setOverriding] = useState(false);

  const contentRef = useRef(null);

  useEffect(() => {
    initRun();
  }, [runId, sopId, token]);

  const initRun = async () => {
    setLoading(true);
    setError('');
    try {
      let activeRunId = runId;
      if (!activeRunId && sopId) {
        // Start a new checklist run
        const startRes = await fetch('http://localhost:5000/checklist-runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ sopId })
        });
        if (!startRes.ok) {
          const errData = await startRes.json();
          throw new Error(errData.error || 'Failed to start checklist run.');
        }
        const startData = await startRes.json();
        setRun(startData.run);
        setSop(startData.run.sop_templates);
        setSteps(startData.steps || []);
        activeRunId = startData.run.id;
        setRunId(activeRunId);
      } else if (activeRunId) {
        // Fetch existing checklist run
        const res = await fetch(`http://localhost:5000/checklist-runs/${activeRunId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load checklist run details.');
        const data = await res.json();
        
        setRun(data);
        setSop(data.sop_templates);
        setSteps(data.steps || []);
      } else {
        throw new Error('No run ID or SOP ID specified.');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred while initializing the run.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loading && contentRef.current) {
      const checkScrollable = () => {
        if (!contentRef.current) return;
        const { scrollHeight, clientHeight } = contentRef.current;
        // If scrollHeight is not meaningfully larger than clientHeight (e.g. <= clientHeight + 15px)
        if (scrollHeight <= clientHeight + 15) {
          setScrollPercent(100);
          setHasScrolledToBottom(true);
        }
      };

      // Run check immediately after rendering
      checkScrollable();
      
      // Also run it after a short delay to account for dynamic layout/image rendering
      const timer = setTimeout(checkScrollable, 200);
      return () => clearTimeout(timer);
    }
  }, [loading, sop]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll <= 0) {
      setScrollPercent(100);
      setHasScrolledToBottom(true);
      return;
    }
    
    const percent = Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100));
    setScrollPercent(percent);
    
    if (percent >= 99) {
      setHasScrolledToBottom(true);
    }
  };

  const handleToggleStep = async (stepId, isCompleted, requiresPhoto) => {
    if (isCompleted) return; // Prevent unchecking if already completed (as per backend logic, only sets completed)
    
    // If it requires a photo, we need evidence_url before we can check it
    if (requiresPhoto) {
      const step = steps.find(s => s.id === stepId);
      if (!step || !step.evidence_url) {
        alert("Please upload a photo using the 'Upload Photo' button before checking off this step.");
        return;
      }
    }

    try {
      const res = await fetch(`http://localhost:5000/checklist-runs/${run.id}/steps/${stepId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const updatedStep = await res.json();
        setSteps(steps.map(s => s.id === stepId ? updatedStep : s));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMockUpload = (stepId) => {
    setUploadingStep(stepId);
    // Mock network delay for upload
    setTimeout(async () => {
      try {
        const res = await fetch(`http://localhost:5000/checklist-runs/${run.id}/steps/${stepId}`, {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify({ evidence_url: 'https://mock-storage.com/evidence.jpg' })
        });
        
        if (res.ok) {
          const updatedStep = await res.json();
          setSteps(steps.map(s => s.id === stepId ? updatedStep : s));
        }
      } catch (err) {
        console.error("Upload failed", err);
      } finally {
        setUploadingStep(null);
      }
    }, 1000);
  };

  const handleRealUpload = async (stepId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size limit (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadErrors(prev => ({ ...prev, [stepId]: 'File too large. Maximum size is 5MB.' }));
      return;
    }

    // Validate image mimetype
    if (!file.type.startsWith('image/')) {
      setUploadErrors(prev => ({ ...prev, [stepId]: 'Invalid file type. Only images are allowed.' }));
      return;
    }

    // Clear previous states
    setUploadErrors(prev => ({ ...prev, [stepId]: null }));
    setUploadSuccesses(prev => ({ ...prev, [stepId]: false }));
    setUploadingStep(stepId);

    // Create a local object URL for preview
    const previewUrl = URL.createObjectURL(file);
    setPreviewUrls(prev => ({ ...prev, [stepId]: previewUrl }));

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:5000/uploads', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload photo.');
      }

      // Save the uploaded URL to the step on the server without completing it yet
      const patchRes = await fetch(`http://localhost:5000/checklist-runs/${run.id}/steps/${stepId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ evidence_url: data.url, is_complete: false })
      });

      if (!patchRes.ok) {
        const patchData = await patchRes.json();
        throw new Error(patchData.error || 'Failed to update step evidence.');
      }

      const updatedStep = await patchRes.json();
      setSteps(steps.map(s => s.id === stepId ? updatedStep : s));
      setUploadSuccesses(prev => ({ ...prev, [stepId]: true }));
    } catch (err) {
      console.error(err);
      setUploadErrors(prev => ({ ...prev, [stepId]: err.message || 'Upload failed. Please try again.' }));
    } finally {
      setUploadingStep(null);
    }
  };

  const handleSign = async () => {
    setSignError('');
    setSigning(true);
    
    try {
      const res = await fetch(`http://localhost:5000/sops/${sop?.id}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ runId: run.id })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setSignError(data.error || 'Failed to sign SOP.');
      } else {
        setSignSuccess(true);
      }
    } catch (err) {
      console.error(err);
      setSignError('Network error. Please try again later.');
    } finally {
      setSigning(false);
    }
  };

  const handleAdminOverrideComplete = async () => {
    if (!overrideReason.trim()) {
      setOverrideError('Override reason is mandatory.');
      return;
    }

    setOverrideError('');
    setOverriding(true);

    try {
      const res = await fetch(`http://localhost:5000/checklist-runs/${run.id}/admin-complete`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reason: overrideReason })
      });

      const data = await res.json();

      if (!res.ok) {
        setOverrideError(data.error || 'Failed to complete checklist run.');
      } else {
        setRun(data);
        setShowOverrideDialog(false);
        setOverrideReason('');
        if (onClose) {
          onClose();
        }
      }
    } catch (err) {
      console.error(err);
      setOverrideError('Network error. Please try again.');
    } finally {
      setOverriding(false);
    }
  };

  const allStepsCompleted = steps.length > 0 && steps.every(s => s.completed_at !== null);
  const isRunCompleted = run?.status === 'completed';
  const canSign = hasScrolledToBottom && allStepsCompleted && !isRunCompleted;

  if (loading) {
    return (
      <div className="checklist-run-overlay" style={{justifyContent: 'center', alignItems: 'center'}}>
        <div className="spinner"></div>
        <p style={{color: 'var(--text-muted)', marginTop: 16}}>Initializing Checklist Run...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="checklist-run-overlay" style={{justifyContent: 'center', alignItems: 'center'}}>
        <div className="error-banner" style={{maxWidth: 400}}>
          <span>{error}</span>
        </div>
        <button className="btn-secondary" onClick={onClose} style={{marginTop: 16}}>Close</button>
      </div>
    );
  }

  if (signSuccess) {
    return (
      <div className="checklist-run-overlay" style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{background: 'var(--card-bg)', padding: 48, borderRadius: 12, textAlign: 'center', border: '1px solid var(--border)'}}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: 64, height: 64, color: '#10b981', margin: '0 auto 24px auto'}}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0110 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0114 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
          </svg>
          <h2 style={{margin: '0 0 8px 0', color: 'var(--text-h)'}}>SOP Completed!</h2>
          <p style={{color: 'var(--text-muted)', marginBottom: 24}}>You have successfully executed and signed this SOP.</p>
          <button className="btn-primary" onClick={onClose} style={{width: '100%'}}>Return to Library</button>
        </div>
      </div>
    );
  }

  return (
    <div className="checklist-run-overlay">
      <div className="run-header">
        <div className="run-title-group">
          <button className="btn-back" onClick={onClose} title="Cancel Run">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 24, height: 24}}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div>
            <h2 style={{margin: 0, fontSize: 20}}>{sop?.title}</h2>
            <div style={{fontSize: 13, color: 'var(--text-muted)', marginTop: 4}}>Execution Run #{run?.id?.substring(0, 8)}</div>
          </div>
        </div>
      </div>

      <div className="scroll-progress-container">
        <div className="scroll-progress-bar" style={{ width: `${scrollPercent}%` }}></div>
      </div>

      <div className="run-content-wrapper">
        <div className="sop-content-panel">
          <div className="sop-content-scroll" ref={contentRef} onScroll={handleScroll}>
            <h3>{sop?.title}</h3>
            {/* Displaying simple text content for now as there's no rich text editor */}
            <p style={{whiteSpace: 'pre-wrap'}}>{sop?.content?.description || "No general description provided for this SOP. Please follow the steps on the right carefully."}</p>
            
            <div style={{marginTop: 48, padding: 24, background: 'var(--surface)', borderRadius: 8}}>
              <h4 style={{marginTop: 0}}>Important Instructions</h4>
              <ul style={{marginBottom: 0}}>
                <li>Read through the entire document above. The progress bar at the top will track your reading.</li>
                <li>Complete each step in the checklist panel on the right.</li>
                <li>Once all steps are completed and the document is fully read, you may sign and complete the SOP.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="steps-panel">
          <div className="steps-header">
            <h3>Execution Steps</h3>
            <div style={{fontSize: 13, color: 'var(--text-muted)'}}>
              {steps.filter(s => s.completed_at).length} of {steps.length} completed
            </div>
          </div>
          
          <div className="steps-list">
            {steps.map((step, idx) => {
              const isCompleted = step.completed_at !== null;
              
              // We infer requiresPhoto from the SOP content if available
              let requiresPhoto = false;
              if (sop?.content?.steps && sop.content.steps[idx]) {
                requiresPhoto = sop.content.steps[idx].requiresPhoto;
              }

              return (
                <div key={step.id} className={`run-step-item ${isCompleted ? 'completed' : ''}`}>
                  <input 
                    type="checkbox" 
                    className="step-checkbox" 
                    checked={isCompleted}
                    onChange={isAuditor ? undefined : () => handleToggleStep(step.id, isCompleted, requiresPhoto)}
                    disabled={isCompleted || isAuditor || (requiresPhoto && !step.evidence_url)} // Only allow checking, not unchecking, and disable completely for auditor/missing photo
                  />
                  <div style={{flex: 1}}>
                    <div className="step-desc">{step.description}</div>
                    {/* Preview Thumbnail or Uploaded Photo during execution */}
                    {requiresPhoto && !isCompleted && !isAuditor && (previewUrls[step.id] || step.evidence_url) && (
                      <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                        <img 
                          src={previewUrls[step.id] || `http://localhost:5000${step.evidence_url}`} 
                          alt="Evidence preview" 
                          style={{
                            maxWidth: '120px',
                            maxHeight: '120px',
                            borderRadius: '4px',
                            border: '1px solid var(--border)',
                            objectFit: 'cover',
                            display: 'block'
                          }}
                        />
                      </div>
                    )}

                    {requiresPhoto && !isCompleted && !isAuditor && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <label 
                            className="btn-secondary" 
                            style={{
                              fontSize: '12px', 
                              padding: '6px 12px', 
                              cursor: uploadingStep === step.id ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              color: 'var(--text)',
                              transition: 'all 0.2s',
                              userSelect: 'none'
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 14, height: 14}}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                            </svg>
                            {uploadingStep === step.id ? 'Uploading...' : 'Take/Choose Photo'}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              style={{ display: 'none' }}
                              onChange={(e) => handleRealUpload(step.id, e)}
                              disabled={uploadingStep === step.id}
                            />
                          </label>

                          {/* Success Checkmark */}
                          {(uploadSuccesses[step.id] || step.evidence_url) && (
                            <span style={{ color: 'var(--success)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" style={{width: 14, height: 14}}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                              Upload Succeeded
                            </span>
                          )}
                        </div>

                        {/* Error Handling with Retry */}
                        {uploadErrors[step.id] && (
                          <div style={{ color: 'var(--error)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span>Error: {uploadErrors[step.id]}</span>
                            <label style={{ color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>
                              Retry Upload
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                style={{ display: 'none' }}
                                onChange={(e) => handleRealUpload(step.id, e)}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    {requiresPhoto && (isCompleted || isAuditor) && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {step.evidence_url ? (
                          <>
                            <div className="photo-evidence-badge">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 12, height: 12}}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                              </svg>
                              Photo Evidence:
                            </div>
                            <img 
                              src={`http://localhost:5000${step.evidence_url}`} 
                              alt="Step Evidence" 
                              style={{
                                maxWidth: '100%',
                                maxHeight: '180px',
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                display: 'block',
                                objectFit: 'cover'
                              }} 
                            />
                          </>
                        ) : (
                          <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                            No photo evidence provided
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {steps.length === 0 && (
              <div style={{color: 'var(--text-muted)', textAlign: 'center', marginTop: 32}}>
                No steps defined for this SOP.
              </div>
            )}
          </div>
 
          <div className="run-footer">
            {isRunCompleted ? (
              <div style={{ textAlign: 'center', width: '100%' }}>
                {run?.completed_by_admin_override ? (
                  <div style={{
                    background: 'var(--error-bg)',
                    color: 'var(--error)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    lineHeight: '1.5',
                    textAlign: 'left',
                    marginBottom: '12px'
                  }}>
                    <strong style={{ color: 'var(--error)' }}>Completed by Admin Override</strong>
                    <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.9 }}>
                      Reason: "{run.override_reason}"
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: 'var(--success-bg)',
                    color: 'var(--success)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '12px'
                  }}>
                    SOP Signed & Completed
                  </div>
                )}
                <button className="btn-secondary" onClick={onClose} style={{ width: '100%' }}>
                  Close
                </button>
              </div>
            ) : isAuditor ? (
              <button 
                className="btn-primary" 
                style={{ width: '100%' }}
                onClick={onClose}
              >
                Close Preview
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '10px' }}>
                {signError && (
                  <div className="error-banner" style={{marginBottom: 8, fontSize: 13, padding: 8}}>
                    {signError}
                  </div>
                )}
                {!hasScrolledToBottom && (
                  <div style={{fontSize: 12, color: '#d97706', marginBottom: 4, textAlign: 'center'}}>
                    Please read through the entire document before signing.
                  </div>
                )}
                {hasScrolledToBottom && !allStepsCompleted && (
                  <div style={{fontSize: 12, color: '#d97706', marginBottom: 4, textAlign: 'center'}}>
                    Please complete all steps before signing.
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                  <button 
                    className="btn-primary btn-sign" 
                    disabled={!canSign || signing}
                    onClick={handleSign}
                    style={{ flex: 1 }}
                  >
                    {signing ? 'Signing...' : 'Sign & Complete SOP'}
                  </button>

                  {isAdminOrSupervisorUser && (
                    <button 
                      className="btn-secondary"
                      onClick={() => setShowOverrideDialog(true)}
                      style={{
                        padding: '10px 16px',
                        borderColor: 'var(--error)',
                        color: 'var(--error)',
                        fontSize: '13px',
                        fontWeight: 600
                      }}
                    >
                      Admin Complete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showOverrideDialog && (
        <div className="modal-backdrop" style={{ zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="modal-content" style={{ maxWidth: '450px', background: 'var(--card-bg)', border: '1px solid var(--border)', padding: '24px', borderRadius: '12px' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-h)' }}>Force Complete Checklist</h3>
              <button 
                onClick={() => { setShowOverrideDialog(false); setOverrideReason(''); setOverrideError(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4', textAlign: 'left' }}>
                Please provide a mandatory explanation for force-completing this checklist (e.g. "employee completed physically, digital sign-off missed"). This action is recorded permanently in the compliance logs.
              </p>
              
              {overrideError && (
                <div className="error-banner" style={{ marginBottom: '16px', fontSize: '13px' }}>
                  {overrideError}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '20px', textAlign: 'left' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '12px', display: 'block', marginBottom: '6px' }}>Override Reason</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Mandatory reason for override completion"
                  required
                  style={{ width: '100%', resize: 'none', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
                />
              </div>

              <div className="modal-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button 
                  className="btn-secondary" 
                  onClick={() => { setShowOverrideDialog(false); setOverrideReason(''); setOverrideError(''); }}
                  disabled={overriding}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary" 
                  onClick={handleAdminOverrideComplete}
                  disabled={overriding || !overrideReason.trim()}
                  style={{ background: 'var(--error)', borderColor: 'var(--error)' }}
                >
                  {overriding ? 'Completing...' : 'Confirm Override'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChecklistRun;
