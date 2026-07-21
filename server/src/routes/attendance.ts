import { Router } from 'express';
import { getPrisma } from '../context';
import { authenticateUser, setTenantContext, requireRole } from '../middleware/auth';

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

/**
 * POST /attendance/check-in
 * Body: { lat, lng, accuracy }
 */
router.post('/attendance/check-in', authenticateUser, setTenantContext, async (req, res, next) => {
  const { lat, lng, accuracy } = req.body;

  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Missing coordinates (lat, lng)' });
  }

  try {
    // 1. Fetch tenant to see if an office location is configured
    // Since tenants table does not have RLS policies, we use raw basePrisma or getPrisma
    const tenant = await getPrisma().tenants.findUnique({
      where: { id: req.user!.tenantId }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.location_lat !== null && tenant.location_lng !== null) {
      const officeLat = tenant.location_lat;
      const officeLng = tenant.location_lng;
      const allowedRadius = tenant.location_radius_m ?? 200; // Default to 200m

      const distance = getDistanceInMeters(lat, lng, officeLat, officeLng);
      if (distance > allowedRadius) {
        return res.status(400).json({
          error: `Cannot check in: Outside of allowed office radius. You are ${Math.round(distance)}m away, but allowed limit is ${allowedRadius}m.`
        });
      }
    }

    // 2. Insert attendance log row
    const log = await getPrisma().attendance_logs.create({
      data: {
        tenant_id: req.user!.tenantId,
        user_id: req.user!.userId,
        check_in_at: new Date(),
        check_in_lat: lat,
        check_in_lng: lng,
        check_in_accuracy_m: accuracy || null
      }
    });

    res.status(201).json(log);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /attendance/check-out
 * Body: { lat, lng, accuracy }
 */
router.post('/attendance/check-out', authenticateUser, setTenantContext, async (req, res, next) => {
  const { lat, lng, accuracy } = req.body;

  try {
    // 1. Find user's active check-in (where check_out_at is null)
    const activeLog = await getPrisma().attendance_logs.findFirst({
      where: {
        user_id: req.user!.userId,
        check_out_at: null
      },
      orderBy: {
        check_in_at: 'desc'
      }
    });

    if (!activeLog) {
      return res.status(400).json({ error: 'No active check-in session found. You must check-in first.' });
    }

    // 2. Update existing row with check-out info
    const updatedLog = await getPrisma().attendance_logs.update({
      where: { id: activeLog.id },
      data: {
        check_out_at: new Date(),
        check_out_lat: lat !== undefined ? lat : null,
        check_out_lng: lng !== undefined ? lng : null,
        check_out_accuracy_m: accuracy !== undefined ? accuracy : null
      }
    });

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
