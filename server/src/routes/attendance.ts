import { Router } from 'express';
import { getPrisma } from '../context';
import { authenticateUser, setTenantContext, requireRole } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';
import { createNotification } from '../services/notification.service';

const router = Router();

// Helper: Haversine distance formula
function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Radius of the Earth in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: UTC start and end bounds for a calendar workday
function getWorkdayBounds(d: Date = new Date()) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * POST /attendance/check-in
 * Body: { lat, lng, accuracy }
 */
router.post('/attendance/check-in', authenticateUser, setTenantContext, async (req, res, next) => {
  const { lat, lng, accuracy } = req.body;
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;

  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Missing coordinates (lat, lng)' });
  }

  const now = new Date();
  const workDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  try {
    // 1. Check if an active open session exists (check_out_at is null)
    const activeLog = await getPrisma().attendance_logs.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        check_out_at: null
      }
    });

    if (activeLog) {
      return res.status(409).json({ error: 'You have already checked in today.' });
    }

    // 2. Check if employee has already checked in on today's workday (by work_date or workday bounds)
    const existingTodayLog = await getPrisma().attendance_logs.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        work_date: workDate
      }
    });

    if (existingTodayLog) {
      if (existingTodayLog.check_out_at !== null) {
        return res.status(409).json({ error: "Today's attendance is already completed." });
      }
      return res.status(409).json({ error: 'You have already checked in today.' });
    }

    // 3. Office location radius check
    const tenant = await getPrisma().tenants.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.location_lat !== null && tenant.location_lng !== null) {
      const officeLat = tenant.location_lat;
      const officeLng = tenant.location_lng;
      const allowedRadius = tenant.location_radius_m ?? 200;

      const distance = getDistanceInMeters(lat, lng, officeLat, officeLng);
      if (distance > allowedRadius) {
        return res.status(400).json({
          error: `Cannot check in: Outside of allowed office radius. You are ${Math.round(distance)}m away, but allowed limit is ${allowedRadius}m.`
        });
      }
    }

    // 4. Create new attendance log with work_date
    const log = await getPrisma().attendance_logs.create({
      data: {
        tenant_id: tenantId,
        user_id: userId,
        work_date: workDate,
        check_in_at: now,
        check_in_lat: lat,
        check_in_lng: lng,
        check_in_accuracy_m: accuracy || null
      }
    });

    // Audit log
    await createAuditLog({
      tenantId,
      actorUserId: userId,
      action: 'attendance.check_in',
      entityType: 'attendance_log',
      entityId: log.id,
      description: `Checked in at ${now.toLocaleTimeString()}`,
      newValues: { check_in_at: now, lat, lng }
    }, req);

    res.status(201).json(log);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'You have already checked in today.' });
    }
    next(error);
  }
});

/**
 * POST /attendance/check-out
 * Body: { lat, lng, accuracy }
 */
router.post('/attendance/check-out', authenticateUser, setTenantContext, async (req, res, next) => {
  const { lat, lng, accuracy } = req.body;
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;
  const now = new Date();
  const workDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  try {
    // 1. Find user's active open check-in session
    const activeLog = await getPrisma().attendance_logs.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        check_out_at: null
      },
      orderBy: {
        check_in_at: 'desc'
      }
    });

    if (!activeLog) {
      // Check if attendance was already checked out today
      const completedTodayLog = await getPrisma().attendance_logs.findFirst({
        where: {
          tenant_id: tenantId,
          user_id: userId,
          work_date: workDate,
          check_out_at: {
            not: null
          }
        }
      });

      if (completedTodayLog) {
        return res.status(409).json({ error: "Today's attendance is already completed." });
      }

      return res.status(400).json({ error: 'No active attendance session was found.' });
    }

    // 2. Validate timestamp ordering
    const checkInTime = new Date(activeLog.check_in_at).getTime();
    if (now.getTime() < checkInTime) {
      return res.status(400).json({ error: 'Checkout timestamp cannot be earlier than check-in' });
    }

    // 3. Update existing active log with check-out info
    const updatedLog = await getPrisma().attendance_logs.update({
      where: { id: activeLog.id },
      data: {
        check_out_at: now,
        check_out_lat: lat !== undefined ? lat : null,
        check_out_lng: lng !== undefined ? lng : null,
        check_out_accuracy_m: accuracy !== undefined ? accuracy : null
      }
    });

    // Audit log
    await createAuditLog({
      tenantId,
      actorUserId: userId,
      action: 'attendance.check_out',
      entityType: 'attendance_log',
      entityId: updatedLog.id,
      description: `Checked out at ${now.toLocaleTimeString()}`,
      newValues: { check_out_at: now, lat, lng }
    }, req);

    res.json(updatedLog);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /attendance/me
 * Retrieves current user's attendance log history.
 */
router.get('/attendance/me', authenticateUser, setTenantContext, async (req, res, next) => {
  try {
    const logs = await getPrisma().attendance_logs.findMany({
      where: { user_id: req.user!.userId },
      orderBy: { check_in_at: 'desc' }
    });
    res.json(logs);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /attendance/office
 * Retrieves the current tenant's office location for displaying on the map.
 */
router.get('/attendance/office', authenticateUser, setTenantContext, async (req, res, next) => {
  try {
    const tenant = await getPrisma().tenants.findUnique({
      where: { id: req.user!.tenantId },
      select: {
        location_lat: true,
        location_lng: true,
        location_radius_m: true
      }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json(tenant);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/attendance
 * Retrieves all tenant employees' attendance logs.
 * Restricted to admins and supervisors.
 */
router.get(
  '/admin/attendance',
  authenticateUser,
  setTenantContext,
  requireRole('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      const logs = await getPrisma().attendance_logs.findMany({
        orderBy: { check_in_at: 'desc' },
        include: {
          users: {
            select: {
              username: true,
              role: true
            }
          }
        }
      });
      res.json(logs);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
