import { Router } from 'express';
import { getPrisma } from '../context';
import { authenticateUser, setTenantContext, requireRole } from '../middleware/auth';

const router = Router();

/**
 * POST /leave-requests
 * Body: { startDate, endDate, reason }
 */
router.post('/leave-requests', authenticateUser, setTenantContext, async (req, res, next) => {
  const { startDate, endDate, reason, isEmergency } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Missing required fields: startDate, endDate' });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  if (end.getTime() < start.getTime()) {
    return res.status(400).json({ error: 'End date cannot be before start date' });
  }

  const isEmergencyBool = !!isEmergency;

  // Configurable validation rule: Must be submitted at least N days in advance of today (skipped if emergency)
  if (!isEmergencyBool) {
    try {
      const tenant = await getPrisma().tenants.findUnique({
        where: { id: req.user!.tenantId },
        select: { leave_notice_days: true }
      });
      const noticeDays = tenant?.leave_notice_days ?? 3;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const minAllowedDate = new Date(today.getTime() + noticeDays * 24 * 60 * 60 * 1000);

      if (start.getTime() < minAllowedDate.getTime()) {
        return res.status(400).json({
          error: `Cannot request leave: Leave requests must be submitted at least ${noticeDays} days in advance.`
        });
      }
    } catch (err) {
      return next(err);
    }
  }

  try {
    const request = await getPrisma().leave_requests.create({
      data: {
        tenant_id: req.user!.tenantId,
        user_id: req.user!.userId,
        start_date: start,
        end_date: end,
        reason: reason || null,
        status: 'pending',
        is_emergency: isEmergencyBool
      }
    });

    // Log emergency requests distinctly in audit_logs
    if (isEmergencyBool) {
      await getPrisma().audit_logs.create({
        data: {
          tenant_id: req.user!.tenantId,
          user_id: req.user!.userId,
          action: 'leave.emergency_requested',
          metadata: {
            leaveRequestId: request.id,
            startDate: startDate,
            endDate: endDate,
            reason: reason || null
          }
        }
      });
    }

    res.status(201).json(request);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /leave-requests/config
 * Retrieve notice period configuration for the current tenant.
 */
router.get('/leave-requests/config', authenticateUser, setTenantContext, async (req, res, next) => {
  try {
    const tenant = await getPrisma().tenants.findUnique({
      where: { id: req.user!.tenantId },
      select: { leave_notice_days: true }
    });
    res.json({ leave_notice_days: tenant?.leave_notice_days ?? 3 });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /leave-requests/:id
 * Body: { status } ('approved' or 'declined')
 * Restricted to admins and supervisors.
 */
router.patch(
  '/leave-requests/:id',
  authenticateUser,
  setTenantContext,
  requireRole('admin', 'supervisor'),
  async (req, res, next) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['approved', 'declined'].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be 'approved' or 'declined'." });
    }

    try {
      // Find request first to verify existence within tenant
      const leaveRequest = await getPrisma().leave_requests.findFirst({
        where: {
          id,
          tenant_id: req.user!.tenantId
        }
      });

      if (!leaveRequest) {
        return res.status(404).json({ error: 'Leave request not found' });
      }

      const updated = await getPrisma().leave_requests.update({
        where: { id },
        data: {
          status,
          reviewed_by: req.user!.userId,
          reviewed_at: new Date()
        }
      });

      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /leave-requests/me
 * Retrieves own leave requests history.
 */
router.get('/leave-requests/me', authenticateUser, setTenantContext, async (req, res, next) => {
  try {
    const requests = await getPrisma().leave_requests.findMany({
      where: { user_id: req.user!.userId },
      orderBy: { created_at: 'desc' }
    });
    res.json(requests);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/leave-requests
 * Retrieves all leave requests for the tenant.
 * Restricted to admins and supervisors.
 */
router.get(
  '/admin/leave-requests',
  authenticateUser,
  setTenantContext,
  requireRole('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      const requests = await getPrisma().leave_requests.findMany({
        where: {
          tenant_id: req.user!.tenantId
        },
        orderBy: { created_at: 'desc' },
        include: {
          users_leave_requests_user_idTousers: {
            select: {
              username: true,
              role: true
            }
          },
          users_leave_requests_reviewed_byTousers: {
            select: {
              username: true,
              role: true
            }
          }
        }
      });
      res.json(requests);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
