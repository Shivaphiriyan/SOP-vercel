import { Router } from 'express';
import { getPrisma } from '../context';
import { authenticateUser, setTenantContext } from '../middleware/auth';

const router = Router();

// Helper to format usernames like "r-perera" to "R. Perera"
const formatUsername = (username: string) => {
  if (!username) return 'System';
  if (username === 'admin') return 'Admin';
  
  const parts = username.split(/[-.]/);
  if (parts.length >= 2) {
    const firstLetter = parts[0].charAt(0).toUpperCase();
    const lastName = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
    return `${firstLetter}. ${lastName}`;
  }
  return username.charAt(0).toUpperCase() + username.slice(1);
};

// Category mapping helper for audit actions
const mapActionToCategory = (action: string): string => {
  const lower = (action || '').toLowerCase();
  if (lower.includes('checkin') || lower.includes('checkout') || lower.includes('attendance') || lower.includes('clock')) {
    return 'ATTENDANCE';
  }
  if (lower.includes('leave')) {
    return 'LEAVE';
  }
  if (lower.includes('signed') || lower.includes('checklist')) {
    return 'CHECKLIST';
  }
  if (lower.includes('sop') || lower.includes('template')) {
    return 'SOP';
  }
  if (lower.includes('user') || lower.includes('team') || lower.includes('role')) {
    return 'TEAM';
  }
  if (lower.includes('payroll') || lower.includes('salary')) {
    return 'PAYROLL';
  }
  return 'AUDIT';
};

const AUDITOR_ALLOWED_CATEGORIES = ['SOP', 'CHECKLIST', 'AUDIT', 'ATTENDANCE'];

/**
 * GET /dashboard/recent-activity
 * Role-aware, tenant-isolated activity endpoint.
 */
router.get(
  '/dashboard/recent-activity',
  authenticateUser,
  setTenantContext,
  async (req, res, next) => {
    try {
      const role = req.user!.role;
      const currentUserId = req.user!.userId;

      // Query parameter parsing & sanitization
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const rawLimit = parseInt(req.query.limit as string, 10) || 20;
      const limit = Math.min(100, Math.max(1, rawLimit));
      const requestedCategory = (req.query.category as string || '').toUpperCase();

      const skip = (page - 1) * limit;

      // Construct role-based database query filter
      let whereClause: any = {};

      if (role === 'operator' || role === 'employee') {
        // STRICT: Only own activities
        whereClause.user_id = currentUserId;
      }

      // Fetch logs matching role scope
      let logs = await getPrisma().audit_logs.findMany({
        where: whereClause,
        orderBy: { created_at: 'desc' },
        include: {
          users: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });

      // Filter by category and auditor permissions
      let processed = logs.map((log) => {
        const category = mapActionToCategory(log.action);
        const rawUser = log.users?.username || 'System';
        const actorName = formatUsername(rawUser);
        const actorInitials = rawUser ? rawUser.substring(0, 2).toUpperCase() : 'SY';
        const isSelf = log.user_id === currentUserId;

        let friendlyAction = log.action.replace(/[._]/g, ' ');
        if (log.action === 'sop.signed') {
          friendlyAction = 'completed checklist run';
        } else if (log.action === 'sop.viewed') {
          friendlyAction = 'viewed procedure template';
        }

        return {
          id: log.id,
          actorUserId: log.user_id,
          actorName: isSelf && (role === 'operator' || role === 'employee') ? 'You' : actorName,
          actorInitials,
          action: friendlyAction,
          category,
          createdAt: log.created_at,
          isSelf,
          message: `${isSelf && (role === 'operator' || role === 'employee') ? 'You' : actorName} ${friendlyAction}`
        };
      });

      // Enforce Auditor Restrictions (Hide PAYROLL, sensitive TEAM details)
      if (role === 'auditor') {
        processed = processed.filter((item) => AUDITOR_ALLOWED_CATEGORIES.includes(item.category));
      }

      // Enforce Requested Category Filter if specified
      if (requestedCategory && requestedCategory !== 'ALL') {
        processed = processed.filter((item) => item.category === requestedCategory);
      }

      const total = processed.length;
      const paginatedItems = processed.slice(skip, skip + limit);

      res.json({
        activities: paginatedItems,
        pagination: {
          page,
          limit,
          total
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /dashboard/summary
 * Returns real summary statistics, analytical breakdown series, and recent activities.
 */
router.get(
  '/dashboard/summary',
  authenticateUser,
  setTenantContext,
  async (req, res, next) => {
    try {
      const role = req.user!.role;
      const userId = req.user!.userId;

      let summary: any = {};

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      // Compute Leave breakdown
      const approvedLeavesCount = await getPrisma().leave_requests.count({
        where: role === 'operator' || role === 'employee' ? { user_id: userId, status: 'approved' } : { status: 'approved' }
      });
      const pendingLeavesCount = await getPrisma().leave_requests.count({
        where: role === 'operator' || role === 'employee' ? { user_id: userId, status: 'pending' } : { status: 'pending' }
      });
      const rejectedLeavesCount = await getPrisma().leave_requests.count({
        where: role === 'operator' || role === 'employee' ? { user_id: userId, status: 'rejected' } : { status: 'rejected' }
      });
      const cancelledLeavesCount = await getPrisma().leave_requests.count({
        where: role === 'operator' || role === 'employee' ? { user_id: userId, status: 'cancelled' } : { status: 'cancelled' }
      });

      // Compute last 7 days daily attendance & checklist trend
      const dailyTrend = [];
      const checklistDays = [];
      for (let i = 6; i >= 0; i--) {
        const dStart = new Date();
        dStart.setUTCDate(dStart.getUTCDate() - i);
        dStart.setUTCHours(0, 0, 0, 0);

        const dEnd = new Date(dStart);
        dEnd.setUTCHours(23, 59, 59, 999);

        const label = dStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

        const presentOnDay = await getPrisma().attendance_logs.count({
          where: role === 'operator' || role === 'employee'
            ? { user_id: userId, check_in_at: { gte: dStart, lte: dEnd } }
            : { check_in_at: { gte: dStart, lte: dEnd } }
        });

        const completedChecklistsOnDay = await getPrisma().checklist_runs.count({
          where: role === 'operator' || role === 'employee'
            ? { operator_id: userId, status: 'completed', completed_at: { gte: dStart, lte: dEnd } }
            : { status: 'completed', completed_at: { gte: dStart, lte: dEnd } }
        });

        const pendingChecklistsOnDay = await getPrisma().checklist_runs.count({
          where: role === 'operator' || role === 'employee'
            ? { operator_id: userId, status: 'in_progress', started_at: { gte: dStart, lte: dEnd } }
            : { status: 'in_progress', started_at: { gte: dStart, lte: dEnd } }
        });

        dailyTrend.push({
          date: label,
          present: presentOnDay,
          absent: Math.max(0, 5 - presentOnDay),
          onLeave: 0
        });

        checklistDays.push({
          day: label,
          completed: completedChecklistsOnDay,
          pending: pendingChecklistsOnDay
        });
      }

      if (role === 'admin' || role === 'supervisor' || role === 'auditor') {
        const totalEmployees = await getPrisma().users.count({
          where: { status: { not: 'disabled' } }
        });

        const completedToday = await getPrisma().checklist_runs.count({
          where: { status: 'completed', completed_at: { gte: todayStart } }
        });

        const pendingLeaves = pendingLeavesCount;

        const activeSops = await (getPrisma().sop_templates as any).count({
          where: { is_current: true, archived: false }
        });

        const todayCheckedIn = await getPrisma().attendance_logs.count({
          where: { check_in_at: { gte: todayStart } }
        });

        summary = {
          totalEmployees,
          completedToday,
          pendingLeaves,
          activeSops,
          attendanceBreakdown: {
            present: todayCheckedIn,
            absent: Math.max(0, totalEmployees - todayCheckedIn),
            halfDay: 0,
            onLeave: 0
          },
          leaveBreakdown: {
            approved: approvedLeavesCount,
            pending: pendingLeavesCount,
            rejected: rejectedLeavesCount,
            cancelled: cancelledLeavesCount
          },
          dailyTrend,
          checklistDays
        };
      } else {
        const now = new Date();
        const day = now.getUTCDay();
        const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now);
        monday.setUTCDate(diff);
        monday.setUTCHours(0, 0, 0, 0);

        const userLogs = await getPrisma().attendance_logs.findMany({
          where: {
            user_id: userId,
            check_in_at: { gte: monday },
            check_out_at: { not: null }
          }
        });

        let totalMs = 0;
        userLogs.forEach((log) => {
          if (log.check_out_at) {
            const checkIn = new Date(log.check_in_at).getTime();
            const checkOut = new Date(log.check_out_at).getTime();
            const diffMs = checkOut - checkIn;
            if (diffMs > 0) totalMs += diffMs;
          }
        });
        const hoursThisWeek = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;

        const activeChecklists = await getPrisma().checklist_runs.count({
          where: { operator_id: userId, status: 'in_progress' }
        });

        summary = {
          hoursThisWeek,
          pendingLeaves: pendingLeavesCount,
          activeChecklists,
          leaveBreakdown: {
            approved: approvedLeavesCount,
            pending: pendingLeavesCount,
            rejected: rejectedLeavesCount,
            cancelled: cancelledLeavesCount
          },
          dailyTrend,
          checklistDays
        };
      }

      // Fetch audit logs matching user role scope
      const logs = await getPrisma().audit_logs.findMany({
        where: role === 'operator' || role === 'employee' ? { user_id: userId } : {},
        orderBy: { created_at: 'desc' },
        take: 10,
        include: { users: { select: { username: true } } }
      });

      const sopIds: string[] = [];
      logs.forEach((log) => {
        const meta = log.metadata as any;
        if (meta && typeof meta === 'object' && meta.sopId) {
          sopIds.push(meta.sopId);
        }
      });

      const uniqueSopIds = Array.from(new Set(sopIds));

      const templates = await getPrisma().sop_templates.findMany({
        where: { id: { in: uniqueSopIds } },
        select: { id: true, title: true }
      });

      const titleMap = new Map(templates.map((t) => [t.id, t.title]));

      let activity = logs.map((log) => {
        const rawUser = log.users?.username || 'System';
        const displayUser = formatUsername(rawUser);
        const meta = log.metadata as any;
        const sopTitle = (meta && meta.sopId && titleMap.get(meta.sopId)) || 'SOP';
        const category = mapActionToCategory(log.action);
        const isSelf = log.user_id === userId;

        let message = '';
        const actor = isSelf && (role === 'operator' || role === 'employee') ? 'You' : displayUser;

        if (log.action === 'sop.viewed') {
          message = `${actor} viewed "${sopTitle}"`;
        } else if (log.action === 'sop.signed') {
          message = `${actor} completed checklist run for "${sopTitle}"`;
        } else {
          const friendlyAction = log.action.replace(/[._]/g, ' ');
          message = `${actor} performed ${friendlyAction}`;
        }

        return {
          id: log.id,
          message,
          category,
          timestamp: log.created_at,
          isSelf
        };
      });

      if (role === 'auditor') {
        activity = activity.filter((item) => AUDITOR_ALLOWED_CATEGORIES.includes(item.category));
      }

      res.json({
        role,
        summary,
        activity
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
