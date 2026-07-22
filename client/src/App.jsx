import { useState, useEffect } from 'react';
import './App.css';
import { API_URL } from './config/api';
import Attendance from './Attendance';
import Team from './Team';
import Settings from './Settings';
import LeaveRequests from './LeaveRequests';
import './LeaveRequests.css';
import Payroll from './Payroll';
import SopLibrary from './SopLibrary';
import MyTasks from './MyTasks';
import ChecklistRun from './ChecklistRun';
import NotFound from './NotFound';

// Native JWT helper to decode payload without external packages
const parseJwt = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Error decoding JWT token:', e);
    return null;
  }
};

// Relative timeago formatter
const formatTimeAgo = (dateStr) => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    if (diffMs < 0) return 'just now';

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${diffDays}d ago`;
  } catch (e) {
    return 'some time ago';
  }
};

// Human-readable summary formatter for audit logs metadata
const renderAuditMetadata = (log) => {
  let meta = {};
  if (log.metadata) {
    if (typeof log.metadata === 'string') {
      try {
        meta = JSON.parse(log.metadata);
      } catch (e) {
        meta = {};
      }
    } else if (typeof log.metadata === 'object') {
      meta = log.metadata;
    }
  }
  
  if (log.action === 'sop.signed') {
    const versionStr = meta.version !== undefined ? ` (v${meta.version})` : '';
    if (log.sopTitle) {
      return `Signed ${log.sopTitle}${versionStr}`;
    } else {
      const idPart = meta.sopId || 'Unknown SOP';
      return `Signed ${idPart} (SOP no longer available)${versionStr}`;
    }
  }
  
  if (log.action === 'sop.viewed') {
    if (log.sopTitle) {
      return `Viewed ${log.sopTitle}`;
    } else {
      const idPart = meta.sopId || 'Unknown SOP';
      return `Viewed ${idPart} (SOP no longer available)`;
    }
  }
  
  if (log.action === 'sop.deleted') {
    if (meta.title) {
      return `Deleted ${meta.title}`;
    } else if (log.sopTitle) {
      return `Deleted ${log.sopTitle}`;
    } else {
      const idPart = meta.sopId || 'Unknown SOP';
      return `Deleted ${idPart} (SOP no longer available)`;
    }
  }

  if (log.action === 'leave.emergency_requested') {
    const startStr = meta.startDate ? new Date(meta.startDate).toLocaleDateString() : 'Unknown';
    const endStr = meta.endDate ? new Date(meta.endDate).toLocaleDateString() : 'Unknown';
    return `Emergency Leave Requested: ${startStr} to ${endStr}`;
  }

  if (log.action === 'checklist.admin_override_complete') {
    const runIdStr = meta.runId ? meta.runId.substring(0, 8) : 'Unknown';
    const reasonStr = meta.reason || 'No reason specified';
    return `Admin Override Completed: Run #${runIdStr} (Reason: "${reasonStr}")`;
  }
  
  // Fallback for any other action types
  const actionClean = log.action
    .split(/[._]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
    
  return actionClean;
};

const AccessDeniedScreen = () => (
  <div className="payroll-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', width: '100%' }}>
    <div className="not-authorized" style={{ maxWidth: '450px', margin: '0 auto', padding: '40px', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: 56, height: 56, marginBottom: 20, color: 'var(--error)'}}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <h2 style={{ color: 'var(--text-h)', marginBottom: '12px', fontSize: '22px', fontWeight: 600 }}>Access Denied</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.6', margin: 0 }}>You don't have access to this page. Please contact your administrator if you require access.</p>
    </div>
  </div>
);

function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [token, setToken] = useState(null);
  const [decoded, setDecoded] = useState(null);
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [leaveRequestsSubTab, setLeaveRequestsSubTab] = useState('my_requests');

  // Dashboard state variables
  const [summaryData, setSummaryData] = useState(null);
  const [activityData, setActivityData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');

  // Toast Notification State
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto dismiss
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 250);
    }, 3000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (!username.trim() || !password || !tenantSlug.trim()) {
      setError('All fields are required.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
          tenantSlug: tenantSlug.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Authentication failed. Please verify your credentials.');
        return;
      }

      setToken(data.token);
      const decodedUser = parseJwt(data.token);
      setDecoded(decodedUser);
    } catch (err) {
      console.error('Connection error:', err);
      setError(`Could not connect to backend. Please ensure the server is running on ${API_URL}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!companyName.trim() || !username.trim() || !password) {
      setError('All fields are required.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          adminUsername: username.trim(),
          adminPassword: password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Signup failed. Please try again.');
        return;
      }

      setToken(data.token);
      const decodedUser = parseJwt(data.token);
      setDecoded(decodedUser);
    } catch (err) {
      console.error('Connection error:', err);
      setError(`Could not connect to backend. Please ensure the server is running on ${API_URL}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setDecoded(null);
    setSummaryData(null);
    setActivityData(null);
    setPassword('');
    setError('');
    setActiveTab('dashboard');
  };

  // Fetch Dashboard Stats once authenticated
  useEffect(() => {
    if (token && decoded) {
      fetchDashboardData();
    }
  }, [token, decoded]);

  // Handle URL hash routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (!hash) {
        setActiveTab('dashboard');
        return;
      }
      const validTabs = ['dashboard', 'attendance', 'leave_requests', 'payroll', 'sops', 'tasks', 'checklist_history', 'audit_log', 'team', 'settings'];
      if (validTabs.includes(hash)) {
        setActiveTab(hash);
      } else {
        setActiveTab('not_found');
      }
    };

    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update hash when activeTab changes
  useEffect(() => {
    if (activeTab) {
      window.location.hash = activeTab;
    }
  }, [activeTab]);

  const fetchDashboardData = async () => {
    setDashboardLoading(true);
    setDashboardError('');
    try {
      const response = await fetch(`${API_URL}/dashboard/summary`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        setDashboardError(data.error || 'Failed to retrieve dashboard summary data.');
        return;
      }

      const data = await response.json();
      setSummaryData(data.summary);
      setActivityData(data.activity);
    } catch (err) {
      console.error('Error fetching summary stats:', err);
      setDashboardError('Could not connect to backend to fetch dashboard statistics.');
    } finally {
      setDashboardLoading(false);
    }
  };
  // Checklist History and Audit Log States
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const [auditData, setAuditData] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [expandedLogs, setExpandedLogs] = useState({});

  const toggleLogExpansion = (id) => {
    setExpandedLogs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const [selectedRunId, setSelectedRunId] = useState(null); // For viewing compliance details

  const fetchHistory = async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await fetch(`${API_URL}/checklist-runs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistoryData(data);
      } else {
        const err = await res.json();
        setHistoryError(err.error || 'Failed to load checklist run history.');
      }
    } catch (err) {
      console.error(err);
      setHistoryError('Network error. Please try again.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    setAuditError('');
    try {
      const res = await fetch(`${API_URL}/audit-logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditData(data);
      } else {
        const err = await res.json();
        setAuditError(err.error || 'Failed to load audit logs.');
      }
    } catch (err) {
      console.error(err);
      setAuditError('Network error. Please try again.');
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (token && activeTab === 'checklist_history') {
      fetchHistory();
    }
    if (token && activeTab === 'audit_log') {
      fetchAuditLogs();
    }
  }, [activeTab, token]);

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: '100vh', flexDirection: 'column' }}>
      {!token ? (
        // Login Card Screen
        <div className="login-container">
          <div className="login-card">
            <div className="brand-header">
              <div className="logo-placeholder">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="logo-icon"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0110 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0114 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                  />
                </svg>
              </div>
              <h2>{isSignup ? 'Create Workspace' : 'Company Workspace'}</h2>
              <p>{isSignup ? 'Set up a new company tenant.' : 'Enter your workspace credentials to log in.'}</p>
            </div>

            {error && (
              <div className="error-banner">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="error-icon"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={isSignup ? handleSignup : handleLogin}>
              {isSignup ? (
                <div className="form-group">
                  <label className="form-label" htmlFor="company-input">
                    Company Name
                  </label>
                  <div className="input-wrapper">
                    <input
                      id="company-input"
                      type="text"
                      className="input-field"
                      placeholder="e.g. Acme Corp"
                      value={companyName}
                      onChange={(e) => {
                        setCompanyName(e.target.value);
                        setTenantSlug(e.target.value.toLowerCase().trim().replace(/[^\\w\\s-]/g, '').replace(/[\\s_-]+/g, '-').replace(/^-+|-+$/g, ''));
                      }}
                      disabled={loading}
                    />
                  </div>
                  <div className="workspace-preview">
                    Your workspace URL will be: <span>https://{tenantSlug || 'your-workspace'}.sop-saas.com</span>
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label" htmlFor="workspace-input">
                    Workspace Domain
                  </label>
                  <div className="input-wrapper">
                    <input
                      id="workspace-input"
                      type="text"
                      className="input-field"
                      placeholder="e.g. acme-co"
                      value={tenantSlug}
                      onChange={(e) => setTenantSlug(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="workspace-preview">
                    Logging into: <span>https://{tenantSlug || 'your-workspace'}.sop-saas.com</span>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="username-input">
                  {isSignup ? "Admin Username" : "Username"}
                </label>
                <input
                  id="username-input"
                  type="text"
                  className="input-field"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password-input">
                  {isSignup ? "Admin Password" : "Password"}
                </label>
                <input
                  id="password-input"
                  type="password"
                  className="input-field"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>

              <button
                id="login-btn"
                type="submit"
                className="btn-primary"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="spinner" />
                    <span>{isSignup ? 'Signing up...' : 'Logging in...'}</span>
                  </>
                ) : (
                  <span>{isSignup ? 'Create Workspace' : 'Log In'}</span>
                )}
              </button>
            </form>
            
            <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '14px' }}>
              {isSignup ? (
                <>Already have an account? <span onClick={() => { setIsSignup(false); setError(''); }} style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>Log In</span></>
              ) : (
                <>Need an account? <span onClick={() => { setIsSignup(true); setError(''); }} style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>Sign Up</span></>
              )}
            </div>
          </div>
        </div>
      ) : (
        // Authorized Two-Pane Layout
        <div className="app-layout">
          {/* Left Sidebar */}
          <div className="sidebar">
            <div className="sidebar-header">
              <div className="sidebar-logo">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0110 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0114 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                  />
                </svg>
              </div>
              <span className="sidebar-title">SOP Portal</span>
            </div>

            <div className="sidebar-nav">
              <div 
                className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} 
                onClick={() => setActiveTab('dashboard')}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                  />
                </svg>
                <span>Dashboard</span>
              </div>
              {decoded?.role !== 'auditor' && (
                <>
                  {decoded?.page_permissions?.attendance !== false && (
                    <div 
                      className={`nav-item ${activeTab === 'attendance' ? 'active' : ''}`}
                      onClick={() => setActiveTab('attendance')}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                        />
                      </svg>
                      <span>Attendance</span>
                    </div>
                  )}

                  {decoded?.page_permissions?.leaveRequests !== false && (
                    <div 
                      className={`nav-item ${activeTab === 'leave_requests' ? 'active' : ''}`}
                      onClick={() => { setActiveTab('leave_requests'); setLeaveRequestsSubTab('my_requests'); }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z"
                        />
                      </svg>
                      <span>Leave Requests</span>
                    </div>
                  )}

                  {decoded?.page_permissions?.payroll !== false && (
                    <div 
                      className={`nav-item ${activeTab === 'payroll' ? 'active' : ''}`}
                      onClick={() => setActiveTab('payroll')}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 6c-3.128 0-6 2.072-6 5 0 1.22.45 2.585 1.258 3.5H4.75a.75.75 0 000 1.5h14.5a.75.75 0 000-1.5h-2.508c.808-.915 1.258-2.28 1.258-3.5 0-2.928-2.872-5-6-5z"
                        />
                      </svg>
                      <span>Payroll</span>
                    </div>
                  )}
                </>
              )}

              {decoded?.role !== 'admin' && decoded?.role !== 'supervisor' && decoded?.role !== 'auditor' && (
                <div 
                  className={`nav-item ${activeTab === 'tasks' ? 'active' : ''}`}
                  onClick={() => setActiveTab('tasks')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>My Tasks</span>
                </div>
              )}
              {decoded?.page_permissions?.sopLibrary !== false && (
                <div 
                  className={`nav-item ${activeTab === 'sops' ? 'active' : ''}`}
                  onClick={() => setActiveTab('sops')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                    />
                  </svg>
                  <span>SOP Library</span>
                </div>
              )}
              
              {(decoded?.role === 'admin' || decoded?.role === 'supervisor' || decoded?.role === 'auditor') && (
                <div 
                  className={`nav-item ${activeTab === 'checklist_history' ? 'active' : ''}`}
                  onClick={() => setActiveTab('checklist_history')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h.008v.008H9V10zm0 3.5h.008v.008H9v-.008zm0 3.5h.008v.008H9V17zm3-7h.008v.008H12V10zm0 3.5h.008v.008H12v-.008zm0 3.5h.008v.008H12V17z" />
                  </svg>
                  <span>Checklist History</span>
                </div>
              )}

              {(decoded?.role === 'admin' || decoded?.role === 'supervisor' || decoded?.role === 'auditor') && (
                <div 
                  className={`nav-item ${activeTab === 'audit_log' ? 'active' : ''}`}
                  onClick={() => setActiveTab('audit_log')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span>Audit Log</span>
                </div>
              )}
              
              {decoded?.role === 'admin' && (
                <div 
                  className={`nav-item ${activeTab === 'team' ? 'active' : ''}`}
                  onClick={() => setActiveTab('team')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 21c-2.907 0-5.542-1.09-7.533-2.893m0 0A4.125 4.125 0 0110 16.03c1.973 0 3.738.694 5 1.838m-9.75-2.78c.002.083.002.167.002.252H2.25m3.75-2.25a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zm9.75-3a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z"
                    />
                  </svg>
                  <span>Team</span>
                </div>
              )}
              {decoded?.role === 'admin' && (
                <div 
                  className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                  onClick={() => setActiveTab('settings')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>Company Settings</span>
                </div>
              )}
            </div>

            <div className="sidebar-footer">
              <div className="user-badge">
                <div className="user-avatar">
                  {username.substring(0, 2).toUpperCase()}
                </div>
                <div className="user-info">
                  <span className="user-name">{username}</span>
                  <span className="user-role">{decoded?.role || 'user'}</span>
                </div>
              </div>
              <button
                className="btn-logout-icon"
                onClick={handleLogout}
                title="Log Out"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Main Area */}
          <div className="main-content">
            {activeTab === 'dashboard' && (
              <>
                <div className="page-header-container">
                  <div className="page-header">
                    <h1>Workspace Dashboard</h1>
                    <p>
                      Overview for <span className="workspace-tag">{tenantSlug}.sop-saas.com</span>
                    </p>
                  </div>
    
                  {(decoded?.role === 'admin' || decoded?.role === 'supervisor') && (
                    <div className="quick-actions">
                      <button className="btn-secondary" onClick={() => { setActiveTab('leave_requests'); setLeaveRequestsSubTab('team_requests'); }}>Approve/Decline Leaves</button>
                      <button className="btn-primary" onClick={() => setActiveTab('sops')}>+ Create SOP</button>
                    </div>
                  )}
                </div>

            {dashboardLoading ? (
              // Loading Skeleton
              <>
                <div className="summary-grid">
                  <div className="skeleton-card" />
                  <div className="skeleton-card" />
                  <div className="skeleton-card" />
                  {decoded?.role !== 'operator' && <div className="skeleton-card" />}
                </div>
                <div className="dashboard-two-column-grid">
                  <div className="skeleton-panel" />
                  <div className="skeleton-panel" />
                </div>
              </>
            ) : dashboardError ? (
              <div className="error-banner">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="error-icon"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
                <span>{dashboardError}</span>
              </div>
            ) : (
              // Role-customized Dashboard Screens
              <>
                <div className="summary-grid">
                  {decoded?.role === 'admin' || decoded?.role === 'supervisor' || decoded?.role === 'auditor' ? (
                    // --- ADMIN / SUPERVISOR / AUDITOR KPI CARDS ---
                    <>
                      <div className="summary-card card-blue">
                        <div className="summary-details">
                          <h3>{summaryData?.totalEmployees ?? 0}</h3>
                          <p>Total Employees</p>
                        </div>
                        <div className="summary-icon-wrapper icon-blue">
                          <svg
                             xmlns="http://www.w3.org/2000/svg"
                             fill="none"
                             viewBox="0 0 24 24"
                             strokeWidth={2}
                             stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 21c-2.907 0-5.542-1.09-7.533-2.893m0 0A4.125 4.125 0 0110 16.03c1.973 0 3.738.694 5 1.838m-9.75-2.78c.002.083.002.167.002.252H2.25m3.75-2.25a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zm9.75-3a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z"
                            />
                          </svg>
                        </div>
                      </div>

                      <div className="summary-card card-green">
                        <div className="summary-details">
                          <h3>{summaryData?.completedToday ?? 0}</h3>
                          <p>Checklists Completed</p>
                        </div>
                        <div className="summary-icon-wrapper icon-green">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                      </div>

                      <div className="summary-card card-yellow">
                        <div className="summary-details">
                          <h3>{summaryData?.pendingLeaves ?? 0}</h3>
                          <p>Pending Leaves</p>
                        </div>
                        <div className="summary-icon-wrapper icon-yellow">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                            />
                          </svg>
                        </div>
                      </div>

                      <div className="summary-card card-purple">
                        <div className="summary-details">
                          <h3>{summaryData?.activeSops ?? 0}</h3>
                          <p>Active SOPs</p>
                        </div>
                        <div className="summary-icon-wrapper icon-purple">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                            />
                          </svg>
                        </div>
                      </div>
                    </>
                  ) : (
                    // --- OPERATOR KPI CARDS ---
                    <>
                      <div className="summary-card card-blue">
                        <div className="summary-details">
                          <h3>{summaryData?.hoursThisWeek ?? 0}h</h3>
                          <p>My hours this week</p>
                        </div>
                        <div className="summary-icon-wrapper icon-blue">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                      </div>

                      <div className="summary-card card-yellow">
                        <div className="summary-details">
                          <h3>{summaryData?.pendingLeaves ?? 0}</h3>
                          <p>My pending leave requests</p>
                        </div>
                        <div className="summary-icon-wrapper icon-yellow">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                            />
                          </svg>
                        </div>
                      </div>

                      <div className="summary-card hover-card card-purple" style={{cursor: 'pointer'}} onClick={() => setActiveTab('tasks')}>
                        <div className="summary-details">
                          <h3>{summaryData?.activeChecklists ?? 0}</h3>
                          <p>My assigned checklists today</p>
                        </div>
                        <div className="summary-icon-wrapper icon-purple">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="dashboard-two-column-grid">
                  {/* Shortcuts Hub */}
                  <div className="dashboard-hub-panel">
                    <div className="dashboard-hub-panel-header">
                      <h2>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                        </svg>
                        Workspace Shortcuts
                      </h2>
                    </div>
                    <div className="shortcut-grid">
                      {decoded?.role === 'admin' ? (
                        <>
                          <div className="shortcut-card" onClick={() => setActiveTab('sops')}>
                            <div className="shortcut-icon-wrapper">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                              </svg>
                            </div>
                            <div className="shortcut-details">
                              <h4>SOP Library</h4>
                              <p>Create, publish, and structure standard operating procedures.</p>
                            </div>
                          </div>
                          <div className="shortcut-card" onClick={() => setActiveTab('team')}>
                            <div className="shortcut-icon-wrapper">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 21c-2.907 0-5.542-1.09-7.533-2.893m0 0A4.125 4.125 0 0110 16.03c1.973 0 3.738.694 5 1.838m-9.75-2.78c.002.083.002.167.002.252H2.25m3.75-2.25a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zm9.75-3a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" />
                              </svg>
                            </div>
                            <div className="shortcut-details">
                              <h4>Team Directory</h4>
                              <p>Add, invite, delete, or manage team members and permissions.</p>
                            </div>
                          </div>
                          <div className="shortcut-card" onClick={() => setActiveTab('checklist_history')}>
                            <div className="shortcut-icon-wrapper">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <div className="shortcut-details">
                              <h4>Checklist History</h4>
                              <p>Audit checklist runs, progress, and execution logs.</p>
                            </div>
                          </div>
                          <div className="shortcut-card" onClick={() => setActiveTab('settings')}>
                            <div className="shortcut-icon-wrapper">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </div>
                            <div className="shortcut-details">
                              <h4>Company Settings</h4>
                              <p>Configure workspace parameters, coordinates, and thresholds.</p>
                            </div>
                          </div>
                        </>
                      ) : decoded?.role === 'supervisor' || decoded?.role === 'auditor' ? (
                        <>
                          <div className="shortcut-card" onClick={() => setActiveTab('sops')}>
                            <div className="shortcut-icon-wrapper">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                              </svg>
                            </div>
                            <div className="shortcut-details">
                              <h4>SOP Library</h4>
                              <p>Review and write standard operating procedures.</p>
                            </div>
                          </div>
                          <div className="shortcut-card" onClick={() => setActiveTab('checklist_history')}>
                            <div className="shortcut-icon-wrapper">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <div className="shortcut-details">
                              <h4>Checklist History</h4>
                              <p>Audit checklist runs and verification flows.</p>
                            </div>
                          </div>
                          <div className="shortcut-card" onClick={() => setActiveTab('audit_log')}>
                            <div className="shortcut-icon-wrapper">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                              </svg>
                            </div>
                            <div className="shortcut-details">
                              <h4>Audit Logs</h4>
                              <p>Search through immutable system audit trails.</p>
                            </div>
                          </div>
                          <div className="shortcut-card" onClick={() => { setActiveTab('leave_requests'); setLeaveRequestsSubTab('team_requests'); }}>
                            <div className="shortcut-icon-wrapper">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                              </svg>
                            </div>
                            <div className="shortcut-details">
                              <h4>Leave Management</h4>
                              <p>Approve or decline employee leave applications.</p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="shortcut-card" onClick={() => setActiveTab('tasks')}>
                            <div className="shortcut-icon-wrapper">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                              </svg>
                            </div>
                            <div className="shortcut-details">
                              <h4>My Tasks</h4>
                              <p>Start, execute, and view assigned checklist procedures.</p>
                            </div>
                          </div>
                          <div className="shortcut-card" onClick={() => setActiveTab('attendance')}>
                            <div className="shortcut-icon-wrapper">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                              </svg>
                            </div>
                            <div className="shortcut-details">
                              <h4>Clock In & Out</h4>
                              <p>Record daily attendance and view geo-coordinates status.</p>
                            </div>
                          </div>
                          <div className="shortcut-card" onClick={() => setActiveTab('sops')}>
                            <div className="shortcut-icon-wrapper">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                              </svg>
                            </div>
                            <div className="shortcut-details">
                              <h4>SOP Library</h4>
                              <p>Read, search, and view official procedure templates.</p>
                            </div>
                          </div>
                          <div className="shortcut-card" onClick={() => { setActiveTab('leave_requests'); setLeaveRequestsSubTab('my_requests'); }}>
                            <div className="shortcut-icon-wrapper">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                              </svg>
                            </div>
                            <div className="shortcut-details">
                              <h4>Request Leave</h4>
                              <p>Submit leave applications and track request approval history.</p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Recent Activity Panel */}
                  <div className="activity-panel">
                    <div className="activity-panel-header">
                      <h2>Recent Activity</h2>
                    </div>
                    <div className="activity-list">
                      {activityData && activityData.length > 0 ? (
                        activityData.map((item) => (
                          <div key={item.id} className="activity-item">
                            <div className="activity-dot-wrapper">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                                stroke="currentColor"
                                style={{ width: '16px', height: '16px' }}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            </div>
                            <div className="activity-content">
                              <p className="activity-msg">{item.message}</p>
                              <span className="activity-time">
                                {formatTimeAgo(item.timestamp)}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text)' }}>
                          No recent activity recorded.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
            </>
            )}

            {activeTab === 'attendance' && (
              decoded?.page_permissions?.attendance === false ? <AccessDeniedScreen /> : <Attendance token={token} decoded={decoded} />
            )}

            {activeTab === 'leave_requests' && (
              decoded?.page_permissions?.leaveRequests === false ? <AccessDeniedScreen /> : <LeaveRequests token={token} decoded={decoded} initialTab={leaveRequestsSubTab} showToast={showToast} />
            )}

            {activeTab === 'payroll' && (
              decoded?.page_permissions?.payroll === false ? <AccessDeniedScreen /> : <Payroll token={token} decoded={decoded} />
            )}

            {activeTab === 'sops' && (
              decoded?.page_permissions?.sopLibrary === false ? <AccessDeniedScreen /> : <SopLibrary token={token} decoded={decoded} showToast={showToast} />
            )}

            {activeTab === 'tasks' && (
              <MyTasks token={token} decoded={decoded} />
            )}

            {activeTab === 'checklist_history' && (
              <div className="leave-requests-container">
                <div className="page-header-container" style={{ marginBottom: '24px' }}>
                  <div className="page-header">
                    <h1>Checklist Execution History</h1>
                    <p>Tenant-wide compliance oversight of checklist execution.</p>
                  </div>
                </div>

                {historyError && (
                  <div className="error-banner" style={{ marginBottom: '24px' }}>
                    <span>{historyError}</span>
                  </div>
                )}

                {historyLoading ? (
                  <div className="loading-spinner-container">
                    <div className="spinner"></div>
                    <p>Loading execution history...</p>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>SOP Template</th>
                          <th>Operator</th>
                          <th>Status</th>
                          <th>Started</th>
                          <th>Completed</th>
                          <th>Progress</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyData.map(run => {
                          const completedSteps = run.steps.filter(s => s.completed_at).length;
                          const totalSteps = run.steps.length;
                          const isDone = run.status === 'completed';
                          
                          return (
                            <tr key={run.id}>
                              <td>
                                <strong style={{ color: 'var(--text-h)' }}>{run.sop_templates?.title}</strong>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  v{run.sop_templates?.version || 1}
                                </div>
                              </td>
                              <td>{run.users?.username}</td>
                              <td>
                                {run.completed_by_admin_override ? (
                                  <span className="status-badge" style={{ background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                                    Admin Completed
                                  </span>
                                ) : (
                                  <span className={`status-badge status-${isDone ? 'success' : 'warning'}`}>
                                    {run.status}
                                  </span>
                                )}
                              </td>
                              <td>{new Date(run.started_at).toLocaleString()}</td>
                              <td>{run.completed_at ? new Date(run.completed_at).toLocaleString() : '-'}</td>
                              <td>
                                <span style={{ fontWeight: 500 }}>
                                  {completedSteps} / {totalSteps} Steps
                                </span>
                              </td>
                              <td>
                                <button 
                                  className="btn-secondary"
                                  style={{ padding: '6px 12px', fontSize: '12px' }}
                                  onClick={() => setSelectedRunId(run.id)}
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {historyData.length === 0 && (
                          <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                              No checklist runs recorded.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedRunId && (
                  <ChecklistRun 
                    runId={selectedRunId} 
                    token={token} 
                    decoded={decoded}
                    onClose={() => { setSelectedRunId(null); fetchHistory(); }} 
                  />
                )}
              </div>
            )}

            {activeTab === 'audit_log' && (
              <div className="leave-requests-container">
                <div className="page-header-container" style={{ marginBottom: '24px' }}>
                  <div className="page-header">
                    <h1>Workspace Audit Log</h1>
                    <p>Immutable log of compliance and configuration actions.</p>
                  </div>
                </div>

                {auditError && (
                  <div className="error-banner" style={{ marginBottom: '24px' }}>
                    <span>{auditError}</span>
                  </div>
                )}

                {auditLoading ? (
                  <div className="loading-spinner-container">
                    <div className="spinner"></div>
                    <p>Loading audit logs...</p>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>User</th>
                          <th>Role</th>
                          <th>Timestamp</th>
                          <th>Details / Metadata</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditData.map(log => (
                          <tr key={log.id}>
                            <td>
                              <span style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '12px', color: 'var(--primary)' }}>
                                {log.action}
                              </span>
                            </td>
                            <td>{log.users?.username}</td>
                            <td>
                              <span className="status-badge" style={{ background: 'var(--surface)', color: 'var(--text-h)', textTransform: 'capitalize' }}>
                                {log.users?.role}
                              </span>
                            </td>
                            <td>{new Date(log.created_at).toLocaleString()}</td>
                            <td style={{ maxWidth: '400px', wordBreak: 'break-word' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                  <span style={{ fontSize: '13px', lineHeight: '1.4' }}>
                                    {renderAuditMetadata(log)}
                                  </span>
                                  <button
                                    onClick={() => toggleLogExpansion(log.id)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--primary)',
                                      cursor: 'pointer',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      transition: 'all 0.2s',
                                      whiteSpace: 'nowrap',
                                      textDecoration: 'underline'
                                    }}
                                    onMouseOver={(e) => { e.currentTarget.style.color = 'var(--primary-hover)'; }}
                                    onMouseOut={(e) => { e.currentTarget.style.color = 'var(--primary)'; }}
                                  >
                                    {expandedLogs[log.id] ? 'Hide details' : 'View details'}
                                  </button>
                                </div>
                                {expandedLogs[log.id] && (
                                  <div style={{
                                    marginTop: '4px',
                                    padding: '8px 12px',
                                    background: 'rgba(0, 0, 0, 0.2)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border)',
                                    overflowX: 'auto'
                                  }}>
                                    <pre style={{
                                      margin: 0,
                                      fontSize: '11px',
                                      fontFamily: 'var(--mono)',
                                      color: 'var(--text-muted)',
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-all'
                                    }}>
                                      {JSON.stringify(log.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {auditData.length === 0 && (
                          <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                              No audit logs recorded.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'team' && decoded?.role === 'admin' && (
              <Team token={token} decoded={decoded} />
            )}

            {activeTab === 'settings' && decoded?.role === 'admin' && (
              <Settings token={token} />
            )}

            {activeTab === 'not_found' && (
              <NotFound setActiveTab={setActiveTab} />
            )}
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type} ${t.exiting ? 'toast-exit' : ''}`}>
            <div className="toast-icon">
              {t.type === 'success' && (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{width: 14, height: 14}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
              {t.type === 'error' && (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{width: 14, height: 14}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {t.type === 'info' && (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{width: 14, height: 14}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
              )}
            </div>
            <div className="toast-content">{t.message}</div>
            <button 
              className="toast-close" 
              onClick={() => {
                setToasts((prev) => prev.filter((item) => item.id !== t.id));
              }}
            >
              &times;
            </button>
            <div className="toast-progress"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
