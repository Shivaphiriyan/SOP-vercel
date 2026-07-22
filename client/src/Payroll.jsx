import React, { useState, useEffect } from 'react';
import { API_URL } from './config/api';
import './Payroll.css';

const Payroll = ({ token, decoded }) => {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  
  const [payrollData, setPayrollData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);

  // Set default period to current month (1st of month to today)
  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Format YYYY-MM-DD
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
        setError(data.error || 'Failed to fetch payroll data.');
      } else {
        setPayrollData(data);
        // Auto-select first employee if none selected or if selected employee is not in the list
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
      setError('Network error. Please try again later.');
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
  };

  if (decoded?.role !== 'admin') {
    return (
      <div className="payroll-container">
        <div className="not-authorized">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: 48, height: 48, marginBottom: 16, color: 'var(--text-muted)'}}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <h2>Access Denied</h2>
          <p>You do not have permission to view the payroll page. This area is restricted to administrators.</p>
        </div>
      </div>
    );
  }

  const selectedEmployee = payrollData?.employees?.find(e => e.id === selectedEmployeeId);

  return (
    <div className="payroll-container">
      <div className="page-header-container" style={{ marginBottom: 20 }}>
        <div className="page-header">
          <h1>Payroll Dashboard</h1>
          <p>Review calculated payroll, regular hours, and leave for your team (in LKR / Sri Lankan Rupees).</p>
        </div>
      </div>

      <div className="payroll-controls">
        <div className="form-group">
          <label className="form-label">Period Start</label>
          <input 
            type="date" 
            className="input-field" 
            value={periodStart} 
            onChange={e => setPeriodStart(e.target.value)} 
          />
        </div>
        <div className="form-group">
          <label className="form-label">Period End</label>
          <input 
            type="date" 
            className="input-field" 
            value={periodEnd} 
            onChange={e => setPeriodEnd(e.target.value)} 
          />
        </div>
        <div style={{ flex: 1 }}></div>
        <button className="btn-secondary" onClick={handleExportCSV} disabled={!payrollData || payrollData.employees.length === 0}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 16, height: 16, marginRight: 6}}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export CSV (LKR)
        </button>
      </div>

      {error && (
        <div className="error-banner" style={{marginBottom: 24}}>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="loading-spinner-container">
          <div className="spinner"></div>
          <p>Calculating payroll...</p>
        </div>
      ) : (
        <div className="payroll-grid">
          {/* Left Panel: Employee List */}
          <div className="payroll-list-panel">
            <div className="payroll-list-header">
              <span>Employees ({payrollData?.employees?.length || 0})</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'none', marginLeft: 8 }}>Currency: LKR</span>
            </div>

            {/* Flagged Section for Employees Missing Hourly Rate */}
            {payrollData?.flaggedEmployees && payrollData.flaggedEmployees.length > 0 && (
              <div className="flagged-alert-box">
                <div className="flagged-header">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{width: 16, height: 16}}>
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  Requires Action ({payrollData.flaggedEmployees.length})
                </div>
                <p style={{ margin: '0 0 8px 0', fontSize: 12, color: 'var(--warning)', opacity: 0.9 }}>
                  The following users have no hourly rate set and are excluded from the calculated total:
                </p>
                <div className="flagged-list">
                  {payrollData.flaggedEmployees.map(emp => (
                    <div key={emp.id} className="flagged-badge-item" onClick={() => setSelectedEmployeeId(emp.id)} style={{ cursor: 'pointer' }}>
                      <span className="flagged-badge-name">{emp.username}</span>
                      <span className="flagged-badge-role">({emp.role})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="employee-list">
              {payrollData?.employees?.map(emp => (
                <div 
                  key={emp.id} 
                  className={`employee-item ${selectedEmployeeId === emp.id ? 'selected' : ''} ${emp.hourlyRate === null ? 'flagged-user-item' : ''}`}
                  onClick={() => setSelectedEmployeeId(emp.id)}
                >
                  <div className="emp-info">
                    <div className="emp-avatar">{emp.username.substring(0,2).toUpperCase()}</div>
                    <div>
                      <div className="emp-name">{emp.username}</div>
                      <div className="emp-role">{emp.role}</div>
                    </div>
                  </div>
                  <div className={`emp-pay ${emp.hourlyRate === null ? 'text-warning' : ''}`}>
                    {formatLKR(emp.grossPay)}
                  </div>
                </div>
              ))}
              {payrollData?.employees?.length === 0 && (
                <div style={{padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)'}}>
                  No calculated employees for this period.
                </div>
              )}
            </div>
            
            {payrollData && (
              <div style={{padding: '16px 20px', background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div>
                  <span style={{fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', lineHeight: 1.2}}>Total Payroll</span>
                  <span style={{fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase'}}>Tenant Total (LKR)</span>
                </div>
                <span style={{fontSize: 18, fontWeight: 700, color: 'var(--primary)'}}>{formatLKR(payrollData.tenantTotal)}</span>
              </div>
            )}
          </div>

          {/* Right Panel: Selected Employee Details */}
          <div className="payroll-detail-panel">
            {selectedEmployee ? (
              <>
                <div className="detail-header">
                  <div className="detail-avatar">{selectedEmployee.username.substring(0,2).toUpperCase()}</div>
                  <div className="detail-info">
                    <h2>{selectedEmployee.username}</h2>
                    <p>{selectedEmployee.role} • Rate: {formatRate(selectedEmployee.hourlyRate)}</p>
                  </div>
                </div>

                {selectedEmployee.hourlyRate === null && (
                  <div className="warning-callout" style={{ marginBottom: 24 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{width: 20, height: 20, flexShrink: 0, color: 'var(--warning)'}}>
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <strong style={{ color: 'var(--warning)' }}>Rate Not Set:</strong> This employee's hourly rate is missing. They are excluded from the tenant-wide payroll total, and gross pay cannot be calculated.
                    </div>
                  </div>
                )}

                <div className="breakdown-grid">
                  <div className="breakdown-card">
                    <span className="breakdown-label">Hours Worked</span>
                    <span className="breakdown-value">{selectedEmployee.regularHours} hrs</span>
                  </div>
                  <div className="breakdown-card">
                    <span className="breakdown-label">Paid Leave Hours</span>
                    <span className="breakdown-value">{selectedEmployee.paidLeaveDays * 8} hrs</span>
                    <span className="breakdown-sublabel">({selectedEmployee.paidLeaveDays} approved days × 8h)</span>
                  </div>
                  <div className="breakdown-card">
                    <span className="breakdown-label">Hourly Rate</span>
                    <span className="breakdown-value">{selectedEmployee.hourlyRate !== null ? `Rs. ${Number(selectedEmployee.hourlyRate).toFixed(2)}` : 'N/A'}</span>
                    <span className="breakdown-sublabel">Sri Lankan Rupees (LKR)</span>
                  </div>
                  <div className={`breakdown-card total ${selectedEmployee.hourlyRate === null ? 'flagged' : ''}`}>
                    <span className="breakdown-label">Gross Pay (LKR)</span>
                    <span className="breakdown-value">{formatLKR(selectedEmployee.grossPay)}</span>
                  </div>
                </div>

                <div className="payroll-formula-card">
                  <h3 className="formula-title">Calculation Breakdown (LKR)</h3>
                  <div className="formula-expression">
                    <strong>Formula:</strong> <code>(Hours Worked × Hourly Rate) + (Paid Leave Hours × Hourly Rate) = Gross Pay</code>
                  </div>
                  <div className="formula-math">
                    {selectedEmployee.hourlyRate !== null ? (
                      <>
                        <code>({selectedEmployee.regularHours} hrs × Rs. {Number(selectedEmployee.hourlyRate).toFixed(2)}) + ({selectedEmployee.paidLeaveDays * 8} hrs × Rs. {Number(selectedEmployee.hourlyRate).toFixed(2)})</code>
                        <div style={{ marginTop: 12, fontSize: '1.05rem', borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
                          <code>= Rs. {(selectedEmployee.regularHours * selectedEmployee.hourlyRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + Rs. {(selectedEmployee.paidLeaveDays * 8 * selectedEmployee.hourlyRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</code>
                        </div>
                        <div style={{ marginTop: 12, fontWeight: 'bold', fontSize: '1.25rem', color: 'var(--primary)' }}>
                          <code>= {formatLKR(selectedEmployee.grossPay)}</code>
                        </div>
                      </>
                    ) : (
                      <div style={{ color: 'var(--warning)', fontWeight: 500 }}>
                        <code>({selectedEmployee.regularHours} hrs × Rs. 0.00) + ({selectedEmployee.paidLeaveDays * 8} hrs × Rs. 0.00) = Rate not set (Gross Pay is unavailable)</code>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-detail">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: 48, height: 48, marginBottom: 16, opacity: 0.5}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                <h3>Select an Employee</h3>
                <p>Choose an employee from the list to view their payroll breakdown.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Payroll;
