import { useState, useEffect, useCallback, useRef } from 'react';
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
import './components/Dashboard/Dashboard.css';
import DashboardHeader from './components/Dashboard/DashboardHeader';
import StatCard from './components/Dashboard/StatCard';
import AnalyticsOverview from './components/Dashboard/AnalyticsOverview';
import RecentActivity from './components/Dashboard/RecentActivity';
import LoadingSkeleton from './components/Dashboard/LoadingSkeleton';
import EmptyState from './components/Dashboard/EmptyState';
import QuickActions from './components/Dashboard/QuickActions';
import ThemeToggle from './components/ThemeToggle';
import NotificationBell from './components/Notifications/NotificationBell';
import Notifications from './Notifications';
import AuditLogs from './AuditLogs';

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
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [token, setToken] = useState(null);
  const [decoded, setDecoded] = useState(null);
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [leaveRequestsSubTab, setLeaveRequestsSubTab] = useState('my_requests');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navigateTo = (tab, subTab = null) => {
    let targetTab = tab;
    if (targetTab === 'audit-logs' || targetTab === 'audit_logs') {
      targetTab = 'audit_log';
    }
    setActiveTab(targetTab);
    if (subTab && targetTab === 'leave_requests') {
      setLeaveRequestsSubTab(subTab);
    }
    setIsSidebarOpen(false);
  };

  // Dashboard state variables
  const [summaryData, setSummaryData] = useState(null);
  const [activityData, setActivityData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');

  // Toast Notification State & Logic
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 280);
  }, []);

  const showToast = useCallback((optsOrMsg, type = 'success', customTitle, customDuration = 4500) => {
    let message = '';
    let toastType = type;
    let title = customTitle;
    let duration = customDuration;

    if (typeof optsOrMsg === 'object' && optsOrMsg !== null) {
      message = optsOrMsg.message || '';
      toastType = optsOrMsg.type || type || 'success';
      title = optsOrMsg.title;
      duration = optsOrMsg.duration || customDuration;
    } else {
      message = String(optsOrMsg || '');
    }

    if (!title) {
      switch (toastType) {
        case 'success':
          title = 'Success';
          break;
        case 'error':
          title = 'Error';
          break;
        case 'warning':
          title = 'Warning';
          break;
        case 'info':
        default:
          title = 'Information';
          break;
      }
    }

    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-4), { id, message, type: toastType, title, duration }]);
  }, []);

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
      let hash = window.location.hash.replace('#', '').trim();
      if (!hash) {
        setActiveTab('dashboard');
        return;
      }
      if (hash === 'audit-logs' || hash === 'audit_logs') {
        hash = 'audit_log';
      }
      const validTabs = [
        'dashboard',
        'attendance',
        'leave_requests',
        'payroll',
        'notifications',
        'sops',
        'tasks',
        'checklist_history',
        'audit_log',
        'audit-logs',
        'team',
        'settings'
      ];
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
        /* Redesigned 2-Column Authentication Layout */
        <div className="auth-page-wrapper">
          <div className="auth-top-bar">
            <ThemeToggle />
          </div>

          <div className="auth-grid-container">
            {/* Left Branding Section (52% Desktop Width) */}
            <div className="auth-brand-panel">
              <div className="brand-logo-row">
                <div className="logo-placeholder-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 22, height: 22 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0110 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0114 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                  </svg>
                </div>
                <span className="brand-name">SOP Portal</span>
              </div>

              <div className="brand-content-main">
                <h1 className="brand-headline">
                  Manage procedures, attendance, leave, teams, and compliance in one secure workspace.
                </h1>

                <div className="brand-feature-list">
                  <div className="feature-item">
                    <span className="feature-check">✓</span>
                    <span>Multi-tenant workspace isolation</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-check">✓</span>
                    <span>Role-based access control</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-check">✓</span>
                    <span>Secure SOP & checklist management</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-check">✓</span>
                    <span>Attendance and leave tracking</span>
                  </div>
                </div>
              </div>

              <div className="brand-footer-info">
                <span>SOP SaaS Platform &copy; 2026</span>
              </div>
            </div>

            {/* Right Login Card Section (48% Desktop Width) */}
            <div className="auth-card-panel">
              <div className="login-card-elevated">
                <div className="card-brand-header">
                  <div className="mobile-logo-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 24, height: 24 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0110 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0114 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                    </svg>
                  </div>
                  <h2 className="login-card-title">{isSignup ? 'Create Workspace' : 'Welcome back'}</h2>
                  <p className="login-card-subtitle">{isSignup ? 'Set up a new company tenant.' : 'Sign in to your company workspace.'}</p>
                </div>

                {error && (
                  <div className="error-banner">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="error-icon" style={{ width: 18, height: 18 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={isSignup ? handleSignup : handleLogin} className="login-form">
                  {isSignup ? (
                    <div className="form-group">
                      <label className="form-label" htmlFor="company-input">Company Name</label>
                      <input
                        id="company-input"
                        type="text"
                        className="input-field full-width"
                        placeholder="e.g. Acme Corp"
                        value={companyName}
                        onChange={(e) => {
                          setCompanyName(e.target.value);
                          setTenantSlug(e.target.value.toLowerCase().trim().replace(/[^\\w\\s-]/g, '').replace(/[\\s_-]+/g, '-').replace(/^-+|-+$/g, ''));
                        }}
                        disabled={loading}
                      />
                      <span className="workspace-preview-text">Workspace URL: <strong>https://{tenantSlug || 'your-workspace'}.sop-saas.com</strong></span>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label" htmlFor="workspace-input">Workspace Domain</label>
                      <input
                        id="workspace-input"
                        type="text"
                        className="input-field full-width"
                        placeholder="e.g. acme-co"
                        value={tenantSlug}
                        onChange={(e) => setTenantSlug(e.target.value)}
                        disabled={loading}
                      />
                      <span className="workspace-preview-text">Workspace URL: <strong>https://{tenantSlug || 'your-workspace'}.sop-saas.com</strong></span>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" htmlFor="username-input">{isSignup ? 'Admin Username' : 'Username'}</label>
                    <input
                      id="username-input"
                      type="text"
                      className="input-field full-width"
                      placeholder="Enter username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="password-input">{isSignup ? 'Admin Password' : 'Password'}</label>
                    <div className="password-input-wrapper">
                      <input
                        id="password-input"
                        type={showPassword ? 'text' : 'password'}
                        className="input-field full-width"
                        placeholder="Enter password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                          {showPassword ? (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                          ) : (
                            <>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </>
                          )}
                        </svg>
                      </button>
                    </div>
                  </div>

                  {!isSignup && (
                    <div className="auth-options-row">
                      <label className="remember-me-label">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                        />
                        <span>Remember me</span>
                      </label>
                    </div>
                  )}

                  <button
                    id="login-btn"
                    type="submit"
                    className="btn-primary full-width-btn"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <div className="spinner" />
                        <span>{isSignup ? 'Signing up...' : 'Signing in...'}</span>
                      </>
                    ) : (
                      <span>{isSignup ? 'Create Workspace' : 'Log In'}</span>
                    )}
                  </button>
                </form>

                <div className="auth-switch-footer">
                  {isSignup ? (
                    <>Already have an account? <span onClick={() => { setIsSignup(false); setError(''); }} className="switch-link">Log In</span></>
                  ) : (
                    <>Need an account? <span onClick={() => { setIsSignup(true); setError(''); }} className="switch-link">Sign Up</span></>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Authorized Two-Pane Layout
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', overflow: 'hidden' }}>
          <div className="mobile-header-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                className="hamburger-btn"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                aria-label="Toggle navigation menu"
                aria-expanded={isSidebarOpen}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 22, height: 22 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
              <span style={{ fontWeight: 600, fontSize: '16px', color: 'var(--text-h)' }}>SOP Portal</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <NotificationBell token={token} onNavigate={(tab) => navigateTo(tab)} />
              <ThemeToggle />
              <span className="workspace-badge">{tenantSlug}</span>
            </div>
          </div>

          <div className={`sidebar-backdrop ${isSidebarOpen ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)} />

          <div className="app-layout">
            {/* Left Sidebar */}
            <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
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
                  onClick={() => navigateTo('dashboard')}
                  tabIndex={0}
                  role="button"
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
                        onClick={() => navigateTo('attendance')}
                        tabIndex={0}
                        role="button"
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
                        onClick={() => navigateTo('leave_requests', 'my_requests')}
                        tabIndex={0}
                        role="button"
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
                        onClick={() => navigateTo('payroll')}
                        tabIndex={0}
                        role="button"
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

                    <div 
                      className={`nav-item ${activeTab === 'notifications' ? 'active' : ''}`}
                      onClick={() => navigateTo('notifications')}
                      tabIndex={0}
                      role="button"
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
                          d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                        />
                      </svg>
                      <span>Notifications</span>
                    </div>
                  </>
                )}

                {decoded?.role !== 'admin' && decoded?.role !== 'supervisor' && decoded?.role !== 'auditor' && (
                  <div 
                    className={`nav-item ${activeTab === 'tasks' ? 'active' : ''}`}
                    onClick={() => navigateTo('tasks')}
                    tabIndex={0}
                    role="button"
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
                    onClick={() => navigateTo('sops')}
                    tabIndex={0}
                    role="button"
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
                    onClick={() => navigateTo('checklist_history')}
                    tabIndex={0}
                    role="button"
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
                    onClick={() => navigateTo('audit_log')}
                    tabIndex={0}
                    role="button"
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
                    onClick={() => navigateTo('team')}
                    tabIndex={0}
                    role="button"
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
                    onClick={() => navigateTo('settings')}
                    tabIndex={0}
                    role="button"
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
                  aria-label="Log out of application"
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
                <div className="dashboard-container">
                  <DashboardHeader
                    username={username}
                    tenantSlug={tenantSlug}
                    role={decoded?.role}
                    onNavigate={navigateTo}
                  />

                  {dashboardLoading ? (
                    <LoadingSkeleton />
                  ) : dashboardError ? (
                    <EmptyState
                      title="Unable to load dashboard summary"
                      description={dashboardError}
                      onRetry={fetchDashboardData}
                      actionText="Retry Loading"
                    />
                  ) : (
                    <>
                      {/* 4 Compact Statistics Cards Grid */}
                      {/* 4 Primary KPI Statistics Cards Grid */}
                      <div className="dashboard-stat-grid">
                        {decoded?.role === 'admin' || decoded?.role === 'supervisor' ? (
                          <>
                            <StatCard
                              title="Active Employees"
                              number={summaryData?.totalEmployees ?? 0}
                              iconColor="icon-blue"
                              onClick={() => navigateTo('team')}
                              description="Active workforce"
                              icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 21c-2.907 0-5.542-1.09-7.533-2.893m0 0A4.125 4.125 0 0110 16.03c1.973 0 3.738.694 5 1.838m-9.75-2.78c.002.083.002.167.002.252H2.25m3.75-2.25a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zm9.75-3a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" />
                                </svg>
                              }
                            />
                            <StatCard
                              title="Present Today"
                              number={summaryData?.attendanceBreakdown?.present ?? 0}
                              iconColor="icon-green"
                              onClick={() => navigateTo('attendance')}
                              description="Checked in today"
                              icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              }
                            />
                            <StatCard
                              title="Pending Leave Requests"
                              number={summaryData?.pendingLeaves ?? 0}
                              iconColor="icon-yellow"
                              onClick={() => navigateTo('leave_requests', 'team_requests')}
                              description="Awaiting review"
                              icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                </svg>
                              }
                            />
                            <StatCard
                              title="Published SOPs"
                              number={summaryData?.activeSops ?? 0}
                              iconColor="icon-purple"
                              onClick={() => navigateTo('sops')}
                              description="Active procedure templates"
                              icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                </svg>
                              }
                            />
                          </>
                        ) : decoded?.role === 'auditor' ? (
                          <>
                            <StatCard
                              title="Published SOPs"
                              number={summaryData?.activeSops ?? 0}
                              iconColor="icon-purple"
                              onClick={() => navigateTo('sops')}
                              description="Compliance templates"
                              icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                </svg>
                              }
                            />
                            <StatCard
                              title="Checklists Completed"
                              number={summaryData?.completedToday ?? 0}
                              iconColor="icon-green"
                              onClick={() => navigateTo('checklist_history')}
                              description="Audited executions"
                              icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              }
                            />
                            <StatCard
                              title="Active Employees"
                              number={summaryData?.totalEmployees ?? 0}
                              iconColor="icon-blue"
                              onClick={null}
                              description="Active personnel"
                              icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 21c-2.907 0-5.542-1.09-7.533-2.893m0 0A4.125 4.125 0 0110 16.03c1.973 0 3.738.694 5 1.838m-9.75-2.78c.002.083.002.167.002.252H2.25m3.75-2.25a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zm9.75-3a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" />
                                </svg>
                              }
                            />
                            <StatCard
                              title="Audit Trail Logs"
                              number={activityData?.length ?? 0}
                              iconColor="icon-yellow"
                              onClick={() => navigateTo('audit_log')}
                              description="System event logs"
                              icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                </svg>
                              }
                            />
                          </>
                        ) : (
                          <>
                            <StatCard
                              title="Hours This Week"
                              number={`${summaryData?.hoursThisWeek ?? 0}h`}
                              iconColor="icon-blue"
                              onClick={() => navigateTo('attendance')}
                              description="Current workweek"
                              icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              }
                            />
                            <StatCard
                              title="My Pending Leaves"
                              number={summaryData?.pendingLeaves ?? 0}
                              iconColor="icon-yellow"
                              onClick={() => navigateTo('leave_requests', 'my_requests')}
                              description="Applications pending"
                              icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                </svg>
                              }
                            />
                            <StatCard
                              title="Active Checklists"
                              number={summaryData?.activeChecklists ?? 0}
                              iconColor="icon-purple"
                              onClick={() => navigateTo('tasks')}
                              description="Pending execution"
                              icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              }
                            />
                            <StatCard
                              title="Assigned SOPs"
                              number={summaryData?.activeSops ?? 4}
                              iconColor="icon-green"
                              onClick={() => navigateTo('sops')}
                              description="Active procedure templates"
                              icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                </svg>
                              }
                            />
                          </>
                        )}
                      </div>

                      {/* Enterprise ERP Split Layout Grid (65% Left / 35% Right) */}
                      <div className="erp-dashboard-grid">
                        <AnalyticsOverview
                          summaryData={summaryData}
                          role={decoded?.role}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                          <RecentActivity
                            activityData={activityData}
                            role={decoded?.role}
                            onNavigate={navigateTo}
                            canViewAuditLogs={decoded?.role === 'admin' || decoded?.role === 'supervisor' || decoded?.role === 'auditor'}
                            isLoading={dashboardLoading}
                            isError={!!dashboardError}
                            onRetry={fetchDashboardData}
                          />
                          <QuickActions
                            role={decoded?.role}
                            onNavigate={navigateTo}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
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

            {activeTab === 'notifications' && (
              <Notifications token={token} onNavigate={(tab) => navigateTo(tab)} showToast={showToast} />
            )}

            {activeTab === 'audit_log' && (
              decoded?.role === 'admin' || decoded?.role === 'supervisor' || decoded?.role === 'auditor' ? (
                <AuditLogs token={token} />
              ) : (
                <AccessDeniedScreen />
              )
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
        </div>
      )}

      {/* Toast Notification Container */}
      <div className="toast-container" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
        ))}
      </div>
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const [isPaused, setIsPaused] = useState(false);
  const [remaining, setRemaining] = useState(toast.duration || 4500);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef(null);

  useEffect(() => {
    if (toast.exiting) return;

    if (!isPaused) {
      startTimeRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        onDismiss(toast.id);
      }, remaining);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPaused, remaining, toast.id, toast.exiting, onDismiss]);

  const handleMouseEnter = () => {
    const elapsed = Date.now() - startTimeRef.current;
    setRemaining((prev) => Math.max(0, prev - elapsed));
    setIsPaused(true);
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
  };

  const renderIcon = (type) => {
    switch (type) {
      case 'success':
        return (
          <svg className="toast-type-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        );
      case 'error':
        return (
          <svg className="toast-type-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="toast-type-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case 'info':
      default:
        return (
          <svg className="toast-type-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        );
    }
  };

  return (
    <div
      className={`toast toast-${toast.type} ${toast.exiting ? 'toast-exit' : ''}`}
      role={toast.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="toast-accent-bar" />
      <div className="toast-icon-wrapper">
        {renderIcon(toast.type)}
      </div>
      <div className="toast-body">
        {toast.title && <div className="toast-title">{toast.title}</div>}
        <div className="toast-message">{toast.message}</div>
      </div>
      <button
        type="button"
        className="toast-close-btn"
        onClick={() => onDismiss(toast.id)}
        aria-label="Close notification"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div className="toast-progress-track">
        <div
          className="toast-progress-fill"
          style={{
            animationDuration: `${toast.duration || 4500}ms`,
            animationPlayState: isPaused ? 'paused' : 'running'
          }}
        />
      </div>
    </div>
  );
}

export default App;
