import React, { useState, useEffect } from 'react';
import { API_URL } from './config/api';
import './Payroll.css';

const Payroll = ({ token, decoded, showToast }) => {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  
  const [payrollData, setPayrollData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);

  // Search, Filter & Sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortBy, setSortBy] = useState('highest_salary');

  // Set default period to current month (1st of month to today)
  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const formatDate = (date) => date.toISOString().split('T')[0];
    
    setPeriodStart(formatDate(firstDay));
    setPeriodEnd(formatDate(now));
  }, []);

  // Formatting helpers for Sri Lankan Rupees (LKR)
  const formatLKR = (amount) => {
    if (amount === null || amount === undefined) {
      return 'Rate not set';
    }
    return 'Rs. ' + Number(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatRate = (rate) => {
    if (rate === null || rate === undefined) {
      return 'Rate not set';
    }
    return 'Rs. ' + Number(rate).toFixed(2) + ' / hr';
  };

  const fetchPayroll = async () => {
    if (!periodStart || !periodEnd) return;
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/admin/payroll?periodStart=${periodStart}&periodEnd=${periodEnd}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMsg = data.error || 'Failed to fetch payroll data.';
        setError(errorMsg);
        if (showToast) showToast({ title: 'Payroll Fetch Failed', message: errorMsg, type: 'error' });
      } else {
        setPayrollData(data);
        if (data.employees && data.employees.length > 0) {
          if (!selectedEmployeeId || !data.employees.find(e => e.id === selectedEmployeeId)) {
            setSelectedEmployeeId(data.employees[0].id);
          }
        } else {
          setSelectedEmployeeId(null);
        }
      }
    } catch (err) {
      console.error(err);
      const netMsg = 'Network error while calculating payroll. Please try again.';
      setError(netMsg);
      if (showToast) showToast({ title: 'Network Error', message: netMsg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (periodStart && periodEnd) {
      fetchPayroll();
    }
  }, [token, periodStart, periodEnd]);

  const handleExportCSV = () => {
    if (!payrollData || !payrollData.employees) return;

    const headers = [
      'Employee ID',
      'Username',
      'Role',
      'Hourly Rate (LKR/hr)',
      'Hours Worked',
      'Approved Leave Hours',
      'Gross Pay (LKR)'
    ];

    const rows = payrollData.employees.map(emp => [
      emp.id,
      emp.username,
      emp.role,
      emp.hourlyRate !== null ? `Rs. ${Number(emp.hourlyRate).toFixed(2)}` : 'Rate not set',
      emp.regularHours,
      emp.paidLeaveDays * 8,
      emp.grossPay !== null ? `Rs. ${Number(emp.grossPay).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Rate not set'
    ]);

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    let csvContent = "\uFEFF" + [
      headers.map(escapeCsv).join(","),
      ...rows.map(row => row.map(escapeCsv).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `payroll_LKR_${periodStart}_to_${periodEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (showToast) {
      showToast({ 
        title: 'Export Successful', 
        message: `Payroll CSV report for period ${periodStart} to ${periodEnd} generated and downloaded.`, 
        type: 'success' 
      });
    }
  };

  if (decoded?.role !== 'admin') {
    return (
      <div className="payroll-container">
        <div className="not-authorized">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 48, height: 48, marginBottom: 16, color: 'var(--text-muted)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <h2>Access Denied</h2>
          <p>You do not have permission to view the payroll page. This area is restricted to administrators.</p>
        </div>
      </div>
    );
  }

  // Safe Calculations for Summary Cards
  const employeesList = payrollData?.employees || [];
  const flaggedEmployees = payrollData?.flaggedEmployees || [];
  const totalEmployees = employeesList.length;
  const tenantTotal = payrollData?.tenantTotal || 0;
  
  const totalHoursWorked = employeesList.reduce((acc, curr) => acc + (curr.regularHours || 0), 0);
  const totalPaidLeaveHours = employeesList.reduce((acc, curr) => acc + ((curr.paidLeaveDays || 0) * 8), 0);
  const flaggedCount = flaggedEmployees.length;

  // Filter & Sort Employee List
  const filteredEmployees = employeesList.filter(emp => {
    const matchesSearch = !searchQuery.trim() || 
      emp.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
      emp.role.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || emp.role.toLowerCase() === roleFilter.toLowerCase();
    
    return matchesSearch && matchesRole;
  });

  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
    if (sortBy === 'highest_salary') {
      const payA = a.grossPay !== null ? a.grossPay : -1;
      const payB = b.grossPay !== null ? b.grossPay : -1;
      return payB - payA;
    } else if (sortBy === 'lowest_salary') {
      const payA = a.grossPay !== null ? a.grossPay : 999999999;
      const payB = b.grossPay !== null ? b.grossPay : 999999999;
      return payA - payB;
    } else if (sortBy === 'alphabetical') {
      return a.username.localeCompare(b.username);
    } else if (sortBy === 'hourly_rate') {
      const rateA = a.hourlyRate !== null ? a.hourlyRate : -1;
      const rateB = b.hourlyRate !== null ? b.hourlyRate : -1;
      return rateB - rateA;
    }
    return 0;
  });

  const selectedEmployee = employeesList.find(e => e.id === selectedEmployeeId);

  const handleClearFilters = () => {
    setSearchQuery('');
    setRoleFilter('all');
    setSortBy('highest_salary');
  };

  const isFilterActive = searchQuery || roleFilter !== 'all' || sortBy !== 'highest_salary';

  return (
    <div className="payroll-container">
      {/* 1. Page Header & Control Toolbar */}
      <div className="payroll-header-section">
        <div className="payroll-header-left">
          <h1 className="payroll-page-title">Payroll Dashboard</h1>
          <p className="payroll-page-subtitle">Review calculated payroll, attendance hours, and leave earnings for your workforce.</p>
        </div>
        <div className="payroll-header-right">
          <span className="currency-pill">
            <span className="currency-dot" />
            Currency: LKR (Rs.)
          </span>
          <button className="btn-primary export-btn" onClick={handleExportCSV} disabled={!payrollData || totalEmployees === 0}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Date Period Controls Toolbar */}
      <div className="payroll-period-toolbar">
        <div className="period-group">
          <label className="period-label">Period Start</label>
          <input 
            type="date" 
            className="period-input" 
            value={periodStart} 
            onChange={e => setPeriodStart(e.target.value)} 
          />
        </div>
        <div className="period-group">
          <label className="period-label">Period End</label>
          <input 
            type="date" 
            className="period-input" 
            value={periodEnd} 
            onChange={e => setPeriodEnd(e.target.value)} 
          />
        </div>
        <div className="period-info-badge">
          <span>Calculating for {periodStart} to {periodEnd}</span>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="error-banner" style={{ marginBottom: 20 }}>
          <span>{error}</span>
          <button className="btn-secondary compact-btn" onClick={fetchPayroll} style={{ marginLeft: 12 }}>
            Retry Loading
          </button>
        </div>
      )}

      {/* 2. Summary KPI Cards Grid */}
      <div className="payroll-summary-cards">
        <div className="payroll-summary-card">
          <div className="card-icon-box icon-blue">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 21c-2.907 0-5.542-1.09-7.533-2.893m0 0A4.125 4.125 0 0110 16.03c1.973 0 3.738.694 5 1.838m-9.75-2.78c.002.083.002.167.002.252H2.25m3.75-2.25a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zm9.75-3a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" />
            </svg>
          </div>
          <div className="card-info">
            <span className="card-label">Active Employees</span>
            <span className="card-value">{totalEmployees}</span>
            <span className="card-sub text-muted">Counted in period</span>
          </div>
        </div>

        <div className="payroll-summary-card">
          <div className="card-icon-box icon-purple">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33" />
            </svg>
          </div>
          <div className="card-info">
            <span className="card-label">Total Gross Payroll</span>
            <span className="card-value">{formatLKR(tenantTotal)}</span>
            <span className="card-sub text-purple">Calculated total</span>
          </div>
        </div>

        <div className="payroll-summary-card">
          <div className="card-icon-box icon-green">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="card-info">
            <span className="card-label">Hours Worked</span>
            <span className="card-value">{Math.round(totalHoursWorked * 10) / 10} hrs</span>
            <span className="card-sub text-green">Attendance logs</span>
          </div>
        </div>

        <div className="payroll-summary-card">
          <div className="card-icon-box icon-teal">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <div className="card-info">
            <span className="card-label">Paid Leave Hours</span>
            <span className="card-value">{totalPaidLeaveHours} hrs</span>
            <span className="card-sub text-teal">Approved leaves</span>
          </div>
        </div>

        <div className="payroll-summary-card">
          <div className={`card-icon-box ${flaggedCount > 0 ? 'icon-yellow' : 'icon-green'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div className="card-info">
            <span className="card-label">Payroll Alerts</span>
            <span className="card-value">{flaggedCount > 0 ? `${flaggedCount} Issues` : 'All Rates Set'}</span>
            <span className={`card-sub ${flaggedCount > 0 ? 'text-yellow' : 'text-green'}`}>
              {flaggedCount > 0 ? 'Missing hourly rate' : 'Ready for payout'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Skeleton Loading State */}
      {loading ? (
        <div className="payroll-grid">
          <div className="payroll-panel-card">
            <div className="skeleton-line title" style={{ height: 24, width: '40%', marginBottom: 16 }} />
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="skeleton-line" style={{ height: 54, marginBottom: 12, borderRadius: 10 }} />
            ))}
          </div>
          <div className="payroll-panel-card">
            <div className="skeleton-line" style={{ height: 80, marginBottom: 20, borderRadius: 12 }} />
            <div className="skeleton-line" style={{ height: 180, borderRadius: 12 }} />
          </div>
        </div>
      ) : (
        /* Main ERP Payroll 2-Column Grid Layout */
        <div className="payroll-grid">
          {/* Left Column: Employee List Panel */}
          <div className="payroll-panel-card left-panel">
            <div className="panel-card-header">
              <h3 className="panel-card-title">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18, color: 'var(--primary)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 21c-2.907 0-5.542-1.09-7.533-2.893m0 0A4.125 4.125 0 0110 16.03c1.973 0 3.738.694 5 1.838m-9.75-2.78c.002.083.002.167.002.252H2.25m3.75-2.25a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zm9.75-3a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" />
                </svg>
                Workforce Directory
              </h3>
              <span className="panel-badge">{sortedEmployees.length} Users</span>
            </div>

            {/* Compact Payroll Alerts Callout Box */}
            {flaggedCount > 0 && (
              <div className="compact-alert-box">
                <div className="alert-box-title">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16 }}>
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <span>Action Required: {flaggedCount} Missing Rates</span>
                </div>
                <div className="alert-badges-row">
                  {flaggedEmployees.map(emp => (
                    <button 
                      key={emp.id} 
                      className="alert-user-chip" 
                      onClick={() => setSelectedEmployeeId(emp.id)}
                      title="Click to view details"
                    >
                      {emp.username} ({emp.role})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search & Filter Toolbar */}
            <div className="employee-filter-toolbar">
              <div className="search-box">
                <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 15, height: 15 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input 
                  type="text" 
                  className="search-input" 
                  placeholder="Search employee..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="filter-dropdowns">
                <select 
                  className="filter-select" 
                  value={roleFilter} 
                  onChange={e => setRoleFilter(e.target.value)}
                  aria-label="Filter by Role"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="auditor">Auditor</option>
                  <option value="operator">Operator</option>
                  <option value="employee">Employee</option>
                </select>

                <select 
                  className="filter-select" 
                  value={sortBy} 
                  onChange={e => setSortBy(e.target.value)}
                  aria-label="Sort Employees"
                >
                  <option value="highest_salary">Highest Pay</option>
                  <option value="lowest_salary">Lowest Pay</option>
                  <option value="alphabetical">Name (A-Z)</option>
                  <option value="hourly_rate">Hourly Rate</option>
                </select>

                {isFilterActive && (
                  <button className="btn-secondary compact-btn" onClick={handleClearFilters}>
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Employee List */}
            <div className="employee-scroll-list">
              {sortedEmployees.map(emp => {
                const isSelected = selectedEmployeeId === emp.id;
                const isFlagged = emp.hourlyRate === null;
                const initials = emp.username ? emp.username.substring(0, 2).toUpperCase() : 'US';

                return (
                  <div 
                    key={emp.id} 
                    className={`employee-item-card ${isSelected ? 'selected' : ''} ${isFlagged ? 'flagged' : ''}`}
                    onClick={() => setSelectedEmployeeId(emp.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Select ${emp.username}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedEmployeeId(emp.id);
                      }
                    }}
                  >
                    <div className="emp-card-left">
                      <div className="emp-avatar-box">
                        {initials}
                      </div>
                      <div className="emp-meta-group">
                        <div className="emp-name-row">
                          <span className="emp-username">{emp.username}</span>
                          <span className="emp-role-tag">{emp.role}</span>
                        </div>
                        <span className={`rate-pill ${isFlagged ? 'rate-missing' : ''}`}>
                          {formatRate(emp.hourlyRate)}
                        </span>
                      </div>
                    </div>

                    <div className="emp-card-right">
                      <span className={`emp-gross-val ${isFlagged ? 'val-missing' : ''}`}>
                        {formatLKR(emp.grossPay)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {sortedEmployees.length === 0 && (
                <div className="empty-employee-list">
                  <span>No employees found matching current filters.</span>
                </div>
              )}
            </div>

            {/* Left Panel Footer */}
            <div className="list-footer-summary">
              <span>Tenant Total Payout</span>
              <span className="footer-total-val">{formatLKR(tenantTotal)}</span>
            </div>
          </div>

          {/* Right Column: Selected Employee Breakdown Panel */}
          <div className="payroll-panel-card right-panel">
            {selectedEmployee ? (
              <>
                {/* Employee Header Block */}
                <div className="selected-emp-header">
                  <div className="selected-avatar">
                    {selectedEmployee.username ? selectedEmployee.username.substring(0, 2).toUpperCase() : 'US'}
                  </div>
                  <div className="selected-info">
                    <div className="title-row">
                      <h2 className="selected-name">{selectedEmployee.username}</h2>
                      <span className="role-badge">{selectedEmployee.role}</span>
                      <span className={`status-pill ${selectedEmployee.hourlyRate !== null ? 'status-active' : 'status-warning'}`}>
                        <span className="status-dot" />
                        {selectedEmployee.hourlyRate !== null ? 'Rate Configured' : 'Rate Missing'}
                      </span>
                    </div>
                    <p className="selected-sub">
                      Hourly Rate: <strong>{formatRate(selectedEmployee.hourlyRate)}</strong>
                    </p>
                  </div>
                </div>

                {/* Missing Hourly Rate Warning Callout */}
                {selectedEmployee.hourlyRate === null && (
                  <div className="warning-callout-banner">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 18, height: 18, flexShrink: 0 }}>
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <strong>Hourly Rate Missing:</strong> This user has no hourly rate set in the directory. They are excluded from tenant total payroll calculations until an hourly rate is configured.
                    </div>
                  </div>
                )}

                {/* 4 Compact Breakdown Stat Cards Grid */}
                <div className="employee-metrics-grid">
                  <div className="emp-metric-card">
                    <span className="metric-label">Hours Worked</span>
                    <span className="metric-value">{selectedEmployee.regularHours} hrs</span>
                    <span className="metric-sub">Recorded attendance</span>
                  </div>

                  <div className="emp-metric-card">
                    <span className="metric-label">Paid Leave Hours</span>
                    <span className="metric-value">{selectedEmployee.paidLeaveDays * 8} hrs</span>
                    <span className="metric-sub">({selectedEmployee.paidLeaveDays} approved days)</span>
                  </div>

                  <div className="emp-metric-card">
                    <span className="metric-label">Hourly Rate</span>
                    <span className="metric-value">{selectedEmployee.hourlyRate !== null ? `Rs. ${Number(selectedEmployee.hourlyRate).toFixed(2)}` : 'N/A'}</span>
                    <span className="metric-sub">Base rate (LKR)</span>
                  </div>

                  <div className={`emp-metric-card total-card ${selectedEmployee.hourlyRate === null ? 'flagged' : ''}`}>
                    <span className="metric-label">Gross Earnings</span>
                    <span className="metric-value">{formatLKR(selectedEmployee.grossPay)}</span>
                    <span className="metric-sub">Total period pay</span>
                  </div>
                </div>

                {/* Calculation Breakdown Formula Box */}
                <div className="formula-breakdown-card">
                  <h3 className="formula-header-title">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16, color: 'var(--primary)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 3h.008v.008H8.25v-.008zm0 3h.008v.008H8.25v-.008zm3-6h.008v.008H11.25v-.008zm0 3h.008v.008H11.25v-.008zm0 3h.008v.008H11.25v-.008zm3-6h.008v.008H14.25v-.008zm0 3h.008v.008H14.25v-.008zM4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                    </svg>
                    Itemized Calculation Formula (LKR)
                  </h3>

                  <div className="formula-itemized-rows">
                    <div className="itemized-row">
                      <span className="item-label">Regular Attendance Earnings:</span>
                      <span className="item-val">
                        {selectedEmployee.hourlyRate !== null ? (
                          `Rs. ${(selectedEmployee.regularHours * selectedEmployee.hourlyRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        ) : 'Rs. 0.00'}
                      </span>
                    </div>

                    <div className="itemized-row">
                      <span className="item-label">Approved Paid Leave Earnings:</span>
                      <span className="item-val">
                        {selectedEmployee.hourlyRate !== null ? (
                          `Rs. ${(selectedEmployee.paidLeaveDays * 8 * selectedEmployee.hourlyRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        ) : 'Rs. 0.00'}
                      </span>
                    </div>

                    <div className="itemized-row total-row">
                      <span className="item-label">Total Calculated Gross Pay:</span>
                      <span className="item-val">{formatLKR(selectedEmployee.grossPay)}</span>
                    </div>
                  </div>

                  <div className="formula-expression-box">
                    <span className="expression-title">Expression Formula:</span>
                    {selectedEmployee.hourlyRate !== null ? (
                      <code>({selectedEmployee.regularHours} hrs × Rs. {Number(selectedEmployee.hourlyRate).toFixed(2)}) + ({selectedEmployee.paidLeaveDays * 8} hrs × Rs. {Number(selectedEmployee.hourlyRate).toFixed(2)}) = {formatLKR(selectedEmployee.grossPay)}</code>
                    ) : (
                      <code className="text-warning">Rate not set — Pay calculation disabled</code>
                    )}
                  </div>
                </div>
              </>
            ) : (
              /* Empty Selection State */
              <div className="empty-employee-detail">
                <div className="empty-icon-circle">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 36, height: 36 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <h3>Select an Employee</h3>
                <p>Choose an employee from the directory list on the left to view their detailed earnings breakdown.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Payroll;
