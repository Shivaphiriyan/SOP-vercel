import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { useTheme } from '../../context/ThemeContext';

Chart.register(...registerables);

export default function AnalyticsOverview({ summaryData, role }) {
  const [timeframe, setTimeframe] = useState('This Week');
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  const gridColor = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.04)';
  const textColor = isLight ? '#64748b' : '#94a3b8';
  const tooltipBg = isLight ? '#ffffff' : '#1e1e2e';
  const tooltipText = isLight ? '#0f172a' : '#e2e8f0';

  const isAdminOrSupervisor = role === 'admin' || role === 'supervisor';
  const isAuditor = role === 'auditor';

  // Canvas Refs
  const chart1Ref = useRef(null);
  const chart2Ref = useRef(null);
  const chart3Ref = useRef(null);
  const chart4Ref = useRef(null);

  // Chart Instances
  const chart1Inst = useRef(null);
  const chart2Inst = useRef(null);
  const chart3Inst = useRef(null);
  const chart4Inst = useRef(null);

  // Extract real backend analytics data from summaryData
  const attBreakdown = summaryData?.attendanceBreakdown || {
    present: 3,
    absent: 1,
    halfDay: 1,
    onLeave: 0
  };

  const leaveBreakdown = summaryData?.leaveBreakdown || {
    approved: 1,
    pending: summaryData?.pendingLeaves ?? 0,
    rejected: 0,
    cancelled: 1
  };

  const dailyTrend = summaryData?.dailyTrend || [
    { date: '16 Jul', present: 4, absent: 1, onLeave: 0 },
    { date: '17 Jul', present: 6, absent: 2, onLeave: 0 },
    { date: '18 Jul', present: 5, absent: 1, onLeave: 0 },
    { date: '19 Jul', present: 3, absent: 1, onLeave: 0 },
    { date: '20 Jul', present: 4, absent: 2, onLeave: 0 },
    { date: '21 Jul', present: 6, absent: 1, onLeave: 0 },
    { date: '22 Jul', present: 7, absent: 1, onLeave: 0 }
  ];

  const checklistDays = summaryData?.checklistDays || [
    { day: 'Mon', completed: 3, pending: 1 },
    { day: 'Tue', completed: 5, pending: 0 },
    { day: 'Wed', completed: summaryData?.completedToday ?? 2, pending: 1 },
    { day: 'Thu', completed: 4, pending: 0 },
    { day: 'Fri', completed: 6, pending: 1 },
    { day: 'Sat', completed: 2, pending: 0 },
    { day: 'Sun', completed: 1, pending: 0 }
  ];

  const totalEmp = summaryData?.totalEmployees ?? 5;
  const activeSopsCount = summaryData?.activeSops ?? 4;
  const hoursThisWeek = summaryData?.hoursThisWeek ?? 45.5;

  const attTotal = attBreakdown.present + attBreakdown.absent + attBreakdown.halfDay + attBreakdown.onLeave;
  const getAttPct = (val) => (attTotal > 0 ? Math.round((val / attTotal) * 100) : 0);

  const leaveTotal = leaveBreakdown.approved + leaveBreakdown.pending + leaveBreakdown.rejected + leaveBreakdown.cancelled;

  // 1. Chart 1: Attendance / Compliance Doughnut
  useEffect(() => {
    if (!chart1Ref.current) return;
    const ctx = chart1Ref.current.getContext('2d');
    if (!ctx) return;

    if (chart1Inst.current) chart1Inst.current.destroy();

    const dataValues = isAdminOrSupervisor
      ? [attBreakdown.present, attBreakdown.absent, attBreakdown.halfDay, attBreakdown.onLeave]
      : isAuditor
      ? [activeSopsCount, Math.max(0, activeSopsCount - 1), 0]
      : [Math.round(hoursThisWeek / 8), 1, 0];

    const labels = isAdminOrSupervisor
      ? ['Present', 'Absent', 'Half Day', 'On Leave']
      : isAuditor
      ? ['Compliant SOPs', 'Under Review', 'Archived']
      : ['Days Worked', 'Days Off', 'On Leave'];

    const colors = isAdminOrSupervisor
      ? ['#10b981', '#ef4444', '#f59e0b', '#8b5cf6']
      : isAuditor
      ? ['#10b981', '#f59e0b', '#ef4444']
      : ['#8b5cf6', '#3b82f6', '#f59e0b'];

    chart1Inst.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: dataValues, backgroundColor: colors, borderWidth: 0 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipText,
            bodyColor: tooltipText,
            borderColor: gridColor,
            borderWidth: 1
          }
        }
      }
    });

    return () => chart1Inst.current?.destroy();
  }, [attBreakdown, activeSopsCount, hoursThisWeek, isAdminOrSupervisor, isAuditor, resolvedTheme]);

  // 2. Chart 2: Checklist Completion Bar Chart
  useEffect(() => {
    if (!chart2Ref.current) return;
    const ctx = chart2Ref.current.getContext('2d');
    if (!ctx) return;

    if (chart2Inst.current) chart2Inst.current.destroy();

    const labels = checklistDays.map((c) => c.day);
    const completedData = checklistDays.map((c) => c.completed);
    const pendingData = checklistDays.map((c) => c.pending);

    chart2Inst.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Completed Checklists',
            data: completedData,
            backgroundColor: '#10b981',
            borderRadius: 6
          },
          {
            label: 'Pending',
            data: pendingData,
            backgroundColor: isLight ? 'rgba(217, 119, 6, 0.3)' : 'rgba(245, 158, 11, 0.4)',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, stepSize: 1 }, beginAtZero: true }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipText,
            bodyColor: tooltipText,
            borderColor: gridColor,
            borderWidth: 1
          }
        }
      }
    });

    return () => chart2Inst.current?.destroy();
  }, [checklistDays, resolvedTheme, isLight]);

  // 3. Chart 3: Last 7 Days Attendance Summary (Grouped Vertical Bar Chart)
  useEffect(() => {
    if (!chart3Ref.current) return;
    const ctx = chart3Ref.current.getContext('2d');
    if (!ctx) return;

    if (chart3Inst.current) chart3Inst.current.destroy();

    const labels = dailyTrend.map((t) => t.date);
    const presentData = dailyTrend.map((t) => t.present);
    const absentData = dailyTrend.map((t) => t.absent);

    chart3Inst.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Present',
            data: presentData,
            backgroundColor: '#10b981',
            borderRadius: 6,
            barPercentage: 0.6,
            categoryPercentage: 0.75
          },
          {
            label: 'Absent',
            data: absentData,
            backgroundColor: isLight ? 'rgba(239, 68, 68, 0.85)' : '#ef4444',
            borderRadius: 6,
            barPercentage: 0.6,
            categoryPercentage: 0.75
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 12 } }
          },
          y: {
            title: {
              display: true,
              text: 'Employees',
              color: textColor,
              font: { size: 11, weight: '600' }
            },
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              stepSize: 1,
              precision: 0
            },
            beginAtZero: true
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: textColor,
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              pointStyle: 'circle',
              font: { size: 12, weight: '500' }
            }
          },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipText,
            bodyColor: tooltipText,
            borderColor: gridColor,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (context) => {
                const val = context.parsed.y;
                return `${context.dataset.label}: ${val} employee${val === 1 ? '' : 's'}`;
              }
            }
          }
        }
      }
    });

    return () => chart3Inst.current?.destroy();
  }, [dailyTrend, resolvedTheme, isLight, textColor, gridColor, tooltipBg, tooltipText]);

  // 4. Chart 4: Top SOP Contributors Horizontal Bar Chart (Ranked)
  useEffect(() => {
    if (!isAdminOrSupervisor || !chart4Ref.current) return;
    const ctx = chart4Ref.current.getContext('2d');
    if (!ctx) return;

    if (chart4Inst.current) chart4Inst.current.destroy();

    // Top 5 employees sorted descending by checklist runs
    const topEmployees = [
      { name: 'Shivaphiriyan', role: 'Admin', checklists: 8 },
      { name: 'Operator 1', role: 'Operator', checklists: 5 },
      { name: 'Supervisor 1', role: 'Supervisor', checklists: 3 }
    ].sort((a, b) => b.checklists - a.checklists).slice(0, 5);

    chart4Inst.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topEmployees.map((e) => e.name),
        datasets: [
          {
            label: 'Checklist Runs Completed',
            data: topEmployees.map((e) => e.checklists),
            backgroundColor: '#8b5cf6',
            borderRadius: 6,
            barThickness: 16
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: {
              display: true,
              text: 'Checklist Runs',
              color: textColor,
              font: { size: 11, weight: '600' }
            },
            grid: { color: gridColor },
            ticks: { color: textColor, stepSize: 1, precision: 0 },
            beginAtZero: true
          },
          y: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 12, weight: '500' } }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipText,
            bodyColor: tooltipText,
            borderColor: gridColor,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (context) => {
                const emp = topEmployees[context.dataIndex];
                return `${emp.role} • ${context.parsed.x} runs completed`;
              }
            }
          }
        }
      }
    });

    return () => chart4Inst.current?.destroy();
  }, [isAdminOrSupervisor, resolvedTheme, textColor, gridColor, tooltipBg, tooltipText]);

  const hasAttendanceData = dailyTrend && dailyTrend.length > 0;

  return (
    <div className="analytics-section-panel">
      <div className="analytics-panel-header">
        <h2 className="analytics-title">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20, color: 'var(--primary)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          Company Analytics & Insights
        </h2>
        <select className="timeframe-select" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} aria-label="Select Analytics Timeframe">
          <option value="This Week">This Week</option>
          <option value="This Month">This Month</option>
          <option value="This Quarter">This Quarter</option>
        </select>
      </div>

      {/* Doughnut Charts Row */}
      <div className="doughnut-charts-row">
        <div className="chart-card">
          <h3 className="chart-card-title">{isAdminOrSupervisor ? 'Attendance Distribution' : isAuditor ? 'SOP Compliance Rate' : 'Weekly Working Hours'}</h3>
          <div className="doughnut-container">
            <div className="canvas-wrapper">
              <canvas ref={chart1Ref} />
              <div className="doughnut-center-label">
                <span className="center-value">{isAdminOrSupervisor ? getAttPct(attBreakdown.present) + '%' : isAuditor ? '85%' : Math.round(hoursThisWeek) + 'h'}</span>
                <span className="center-text">{isAdminOrSupervisor ? 'Present' : isAuditor ? 'Compliant' : 'Target'}</span>
              </div>
            </div>
            <div className="chart-legend">
              {isAdminOrSupervisor ? (
                <>
                  <div className="legend-item"><span className="legend-dot" style={{ background: '#10b981' }} /><span className="legend-label">Present</span><span className="legend-value">{attBreakdown.present}</span></div>
                  <div className="legend-item"><span className="legend-dot" style={{ background: '#ef4444' }} /><span className="legend-label">Absent</span><span className="legend-value">{attBreakdown.absent}</span></div>
                  <div className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b' }} /><span className="legend-label">Half Day</span><span className="legend-value">{attBreakdown.halfDay}</span></div>
                  <div className="legend-item"><span className="legend-dot" style={{ background: '#8b5cf6' }} /><span className="legend-label">On Leave</span><span className="legend-value">{attBreakdown.onLeave}</span></div>
                </>
              ) : (
                <>
                  <div className="legend-item"><span className="legend-dot" style={{ background: '#10b981' }} /><span className="legend-label">Approved</span><span className="legend-value">{leaveBreakdown.approved}</span></div>
                  <div className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b' }} /><span className="legend-label">Pending</span><span className="legend-value">{leaveBreakdown.pending}</span></div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="chart-card">
          <h3 className="chart-card-title">Checklist Completion Rate</h3>
          <div style={{ height: '140px', width: '100%' }}>
            <canvas ref={chart2Ref} />
          </div>
        </div>
      </div>

      {/* Grouped Vertical Bar Chart Card */}
      <div className="chart-card trend-chart-card">
        <div className="trend-card-header">
          <div>
            <h3 className="chart-card-title">Last 7 Days Attendance Summary</h3>
            <p className="chart-card-sub" style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Daily breakdown of present and absent personnel</p>
          </div>
        </div>
        {!hasAttendanceData ? (
          <div className="chart-empty-state" style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No attendance data is available for the last seven days.
          </div>
        ) : (
          <div className="line-canvas-container" style={{ height: '240px' }}>
            <canvas ref={chart3Ref} />
          </div>
        )}
      </div>

      {/* Horizontal Bar Ranking Chart (Admin / Supervisor) */}
      {isAdminOrSupervisor && (
        <div className="chart-card trend-chart-card">
          <div className="trend-card-header">
            <div>
              <h3 className="chart-card-title">Top SOP Contributors</h3>
              <p className="chart-card-sub" style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Most active team members by checklist runs completed</p>
            </div>
          </div>
          <div style={{ height: '180px', width: '100%', marginTop: '10px' }}>
            <canvas ref={chart4Ref} />
          </div>
        </div>
      )}

      {/* Summary Mini Cards Row */}
      <div className="analytics-summary-cards">
        <div className="analytics-mini-card">
          <div className="mini-card-icon icon-blue">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 21c-2.907 0-5.542-1.09-7.533-2.893m0 0A4.125 4.125 0 0110 16.03c1.973 0 3.738.694 5 1.838m-9.75-2.78c.002.083.002.167.002.252H2.25m3.75-2.25a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zm9.75-3a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" />
            </svg>
          </div>
          <div className="mini-card-info">
            <span className="mini-card-label">Active Workforce</span>
            <span className="mini-card-value">{totalEmp} Employees</span>
            <span className="mini-card-sub text-green">100% On-boarded</span>
          </div>
        </div>

        <div className="analytics-mini-card">
          <div className="mini-card-icon icon-purple">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <div className="mini-card-info">
            <span className="mini-card-label">Published SOPs</span>
            <span className="mini-card-value">{activeSopsCount} Procedures</span>
            <span className="mini-card-sub">Active & Enforced</span>
          </div>
        </div>
      </div>
    </div>
  );
}
