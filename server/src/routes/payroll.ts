import { Router } from 'express';
import { getPrisma } from '../context';
import { authenticateUser, setTenantContext, requireRole } from '../middleware/auth';
import { calculateAttendanceDurationMs } from '../utils/attendance';

const router = Router();

/**
 * GET /admin/payroll
 * Query: periodStart (YYYY-MM-DD), periodEnd (YYYY-MM-DD)
 * Restricted to admins.
 */
router.get(
  '/admin/payroll',
  authenticateUser,
  setTenantContext,
  requireRole('admin'),
  async (req, res, next) => {
    const { periodStart, periodEnd } = req.query;

    if (!periodStart || !periodEnd) {
      return res.status(400).json({ error: 'Missing periodStart or periodEnd query parameters' });
    }

    const pStart = new Date(periodStart as string);
    const pEnd = new Date(periodEnd as string);

    if (isNaN(pStart.getTime()) || isNaN(pEnd.getTime())) {
      return res.status(400).json({ error: 'Invalid date formats for periodStart or periodEnd. Use YYYY-MM-DD.' });
    }

    if (pEnd.getTime() < pStart.getTime()) {
      return res.status(400).json({ error: 'periodEnd cannot be before periodStart' });
    }

    // Set time limits to cover the full range of the period inclusive
    pStart.setUTCHours(0, 0, 0, 0);
    pEnd.setUTCHours(23, 59, 59, 999);

    try {
      // 1. Fetch all active/invited users for the tenant
      const users = await getPrisma().users.findMany({
        where: {
          status: {
            not: 'disabled'
          }
        }
      });

      // 2. Fetch all completed attendance logs in the period
      const attendanceLogs = await getPrisma().attendance_logs.findMany({
        where: {
          check_in_at: {
            gte: pStart,
            lte: pEnd
          },
          check_out_at: {
            not: null
          }
        }
      });

      // 3. Fetch all approved leave requests overlapping the period
      const leaveRequests = await getPrisma().leave_requests.findMany({
        where: {
          status: 'approved',
          start_date: {
            lte: pEnd
          },
          end_date: {
            gte: pStart
          }
        }
      });

      const employeesBreakdown: any[] = [];
      const flaggedEmployees: any[] = [];
      let tenantTotal = 0;

      for (const user of users) {
        // Calculate Regular Hours
        const userLogs = attendanceLogs.filter((log) => log.user_id === user.id);
        let totalHours = 0;
        for (const log of userLogs) {
          const diffMs = calculateAttendanceDurationMs(log.check_in_at, log.check_out_at);
          totalHours += diffMs / (1000 * 60 * 60);
        }
        const regularHours = Math.round(totalHours * 100) / 100;

        // Calculate overlapping paid leave days
        const userLeaves = leaveRequests.filter((leave) => leave.user_id === user.id);
        let totalLeaveDays = 0;
        for (const leave of userLeaves) {
          const overlapStart = new Date(Math.max(new Date(leave.start_date).getTime(), pStart.getTime()));
          const overlapEnd = new Date(Math.min(new Date(leave.end_date).getTime(), pEnd.getTime()));

          overlapStart.setUTCHours(0, 0, 0, 0);
          overlapEnd.setUTCHours(0, 0, 0, 0);

          const diffTime = overlapEnd.getTime() - overlapStart.getTime();
          if (diffTime >= 0) {
            const overlapDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
            totalLeaveDays += overlapDays;
          }
        }

        if (user.hourly_rate === null || user.hourly_rate === undefined) {
          employeesBreakdown.push({
            id: user.id,
            username: user.username,
            role: user.role,
            hourlyRate: null,
            regularHours,
            paidLeaveDays: totalLeaveDays,
            grossPay: null
          });
          flaggedEmployees.push({
            id: user.id,
            username: user.username,
            role: user.role,
            reason: 'No hourly rate set'
          });
          continue;
        }

        const hourlyRate = Number(user.hourly_rate);

        // Calculate Pay
        const regularPay = regularHours * hourlyRate;
        const leavePay = totalLeaveDays * hourlyRate * 8;
        const grossPay = Math.round((regularPay + leavePay) * 100) / 100;

        employeesBreakdown.push({
          id: user.id,
          username: user.username,
          role: user.role,
          hourlyRate,
          regularHours,
          paidLeaveDays: totalLeaveDays,
          grossPay
        });

        tenantTotal += grossPay;
      }

      res.json({
        periodStart: pStart.toISOString().split('T')[0],
        periodEnd: pEnd.toISOString().split('T')[0],
        employees: employeesBreakdown,
        flaggedEmployees,
        tenantTotal: Math.round(tenantTotal * 100) / 100
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
