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

/**
 * GET /dashboard/summary
 * Returns summary statistics and recent activities tailored to the user's role.
 * - Admin, Supervisor, Auditor: Company-wide metrics and tenant recent logs.
 * - Operator: Personal weekly hours, pending leaves, active checklists, and personal logs.
 */
router.get(
  '/dashboard/summary',
  authenticateUser,
  setTenantContext,
  async (req, res, next) => {
    try {
      const role = req.user!.role;
      const userId = req.user!.userId;

      let summary = {};
      let logs = [];

      if (role === 'admin' || role === 'supervisor' || role === 'auditor') {
        // --- COMPANY-WIDE METRICS (Admin, Supervisor, Auditor) ---
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        const totalEmployees = await getPrisma().users.count({
          where: {
            status: {
              not: 'disabled'
            }
          }
        });

        const completedToday = await getPrisma().checklist_runs.count({
          where: {
            status: 'completed',
            completed_at: {
              gte: todayStart
            }
          }
        });

        const pendingLeaves = await getPrisma().leave_requests.count({
          where: {
            status: 'pending'
          }
        });

        const activeSops = await (getPrisma().sop_templates as any).count({
          where: {
            is_current: true,
            archived: false
          }
        });

        summary = {
          totalEmployees,
          completedToday,
          pendingLeaves,
          activeSops
        };

        // Fetch 5 most recent tenant-wide audit logs
        logs = await getPrisma().audit_logs.findMany({
          orderBy: {
            created_at: 'desc'
          },
          take: 5,
          include: {
            users: {
              select: {
                username: true
              }
            }
          }
        });

      } else {
        // --- PERSONAL METRICS (Operator) ---
        
        // Calculate start of current week (Monday 00:00:00 UTC)
        const now = new Date();
        const day = now.getUTCDay();
        const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now);
        monday.setUTCDate(diff);
        monday.setUTCHours(0, 0, 0, 0);

        // Fetch operator logs to calculate hours this week
        const userLogs = await getPrisma().attendance_logs.findMany({
          where: {
            user_id: userId,
            check_in_at: {
              gte: monday
            },
            check_out_at: {
              not: null
            }
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

        // Count own pending leave requests
        const pendingLeaves = await getPrisma().leave_requests.count({
          where: {
            user_id: userId,
            status: 'pending'
          }
        });

        // Count own active checklists (in_progress checklist runs)
        const activeChecklists = await getPrisma().checklist_runs.count({
          where: {
            operator_id: userId,
            status: 'in_progress'
          }
        });

        summary = {
          hoursThisWeek,
          pendingLeaves,
          activeChecklists
        };

        // Fetch 5 most recent operator-specific audit logs
        logs = await getPrisma().audit_logs.findMany({
          where: {
            user_id: userId
          },
          orderBy: {
            created_at: 'desc'
          },
          take: 5,
          include: {
            users: {
              select: {
                username: true
              }
            }
          }
        });
      }

      // Map audit logs to descriptive text
      const sopIds: string[] = [];
      logs.forEach((log) => {
        const meta = log.metadata as any;
        if (meta && typeof meta === 'object' && meta.sopId) {
          sopIds.push(meta.sopId);
        }
      });

      const uniqueSopIds = Array.from(new Set(sopIds));

      const templates = await getPrisma().sop_templates.findMany({
        where: {
          id: {
            in: uniqueSopIds
          }
        },
        select: {
          id: true,
          title: true
        }
      });

      const titleMap = new Map(templates.map((t) => [t.id, t.title]));

      const activity = logs.map((log) => {
        const rawUser = log.users?.username || 'System';
        const displayUser = formatUsername(rawUser);
        const meta = log.metadata as any;
        const sopTitle = (meta && meta.sopId && titleMap.get(meta.sopId)) || 'SOP';

        let message = '';
        if (log.action === 'sop.viewed') {
          message = `${displayUser} viewed "${sopTitle}"`;
        } else if (log.action === 'sop.signed') {
          message = `${displayUser} signed checklist run for "${sopTitle}"`;
        } else {
          const friendlyAction = log.action.replace(/[._]/g, ' ');
          message = `${displayUser} performed ${friendlyAction}`;
        }

        return {
          id: log.id,
          message,
          timestamp: log.created_at
        };
      });

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
