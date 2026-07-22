import { Router } from 'express';
import bcrypt from 'bcrypt';
import { getPrisma } from '../context';
import { authenticateUser, setTenantContext, requireRole } from '../middleware/auth';

const router = Router();

const defaultPermissionsForRole = (role: string) => {
  if (role === 'admin' || role === 'supervisor') {
    return { attendance: true, leaveRequests: true, payroll: true, sopLibrary: true };
  } else if (role === 'operator' || role === 'employee') {
    return { attendance: true, leaveRequests: true, payroll: false, sopLibrary: true };
  } else if (role === 'auditor') {
    return { attendance: false, leaveRequests: false, payroll: false, sopLibrary: true };
  }
  return { attendance: true, leaveRequests: true, payroll: false, sopLibrary: true };
};

// Protect all /admin routes with admin role
router.use('/admin', authenticateUser, setTenantContext, requireRole('admin'));

/**
 * POST /admin/users
 * Create a new user for the current tenant.
 */
router.post('/admin/users', async (req, res, next) => {
  const { username, tempPassword, role } = req.body;

  if (!username || !tempPassword || !role) {
    return res.status(400).json({ error: 'Missing username, tempPassword, or role' });
  }

  const validRoles = ['admin', 'supervisor', 'operator', 'auditor', 'employee'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const newUser = await getPrisma().users.create({
      data: {
        tenant_id: req.user!.tenantId,
        username: username.trim(),
        password_hash: passwordHash,
        role: role,
        status: 'invited',
        page_permissions: defaultPermissionsForRole(role) as any
      },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        page_permissions: true,
        created_at: true
      }
    });

    res.status(201).json(newUser);
  } catch (error: any) {
    // Handle unique constraint violation from Prisma (duplicate username in same tenant)
    if (error.code === 'P2002' && error.meta?.target?.includes('username')) {
      return res.status(400).json({ error: 'A user with this username already exists in this workspace.' });
    }
    // PostgreSQL error code for unique violation
    if (error.code === '23505') {
      return res.status(400).json({ error: 'A user with this username already exists in this workspace.' });
    }
    next(error);
  }
});

/**
 * GET /admin/users
 * List all users for the current tenant.
 */
router.get('/admin/users', async (req, res, next) => {
  try {
    const users = await getPrisma().users.findMany({
      where: {
        status: {
          not: 'disabled'
        }
      },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        page_permissions: true,
        created_at: true
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    res.json(users);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /admin/users/:id
 * Update a user's role or status.
 */
router.patch('/admin/users/:id', async (req, res, next) => {
  const { id } = req.params;
  const { role, status } = req.body;

  if (role && !['admin', 'supervisor', 'operator', 'auditor'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  if (status && !['invited', 'active', 'disabled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const updatedUser = await getPrisma().users.update({
      where: { id },
      data: {
        ...(role && { role }),
        ...(status && { status })
      },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        page_permissions: true,
        created_at: true
      }
    });

    res.json(updatedUser);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    next(error);
  }
});

/**
 * PATCH /admin/users/:id/permissions
 * Update a user's page permissions.
 */
router.patch('/admin/users/:id/permissions', async (req, res, next) => {
  const { id } = req.params;
  const { permissions } = req.body;

  if (!permissions || typeof permissions !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid permissions object' });
  }

  // Validate the keys/values
  const expectedKeys = ['attendance', 'leaveRequests', 'payroll', 'sopLibrary'];
  for (const key of expectedKeys) {
    if (permissions[key] !== undefined && typeof permissions[key] !== 'boolean') {
      return res.status(400).json({ error: `Permission '${key}' must be a boolean` });
    }
  }

  try {
    const user = await getPrisma().users.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingPermissions = (user.page_permissions as any) || {};
    const updatedPermissions = {
      ...existingPermissions,
      ...permissions
    };

    const updatedUser = await getPrisma().users.update({
      where: { id },
      data: {
        page_permissions: updatedPermissions as any
      },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        page_permissions: true,
        created_at: true
      }
    });

    res.json(updatedUser);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    next(error);
  }
});

/**
 * GET /admin/settings
 * Retrieve the current tenant's location settings.
 */
router.get('/admin/settings', async (req, res, next) => {
  try {
    const tenant = await getPrisma().tenants.findUnique({
      where: { id: req.user!.tenantId },
      select: {
        location_lat: true,
        location_lng: true,
        location_radius_m: true,
        leave_notice_days: true
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
 * PATCH /admin/settings
 * Update the current tenant's location settings.
 */
router.patch('/admin/settings', async (req, res, next) => {
  const { location_lat, location_lng, location_radius_m, leave_notice_days } = req.body;

  try {
    const updatedTenant = await getPrisma().tenants.update({
      where: { id: req.user!.tenantId },
      data: {
        ...(location_lat !== undefined && { location_lat }),
        ...(location_lng !== undefined && { location_lng }),
        ...(location_radius_m !== undefined && { location_radius_m }),
        ...(leave_notice_days !== undefined && { leave_notice_days })
      },
      select: {
        location_lat: true,
        location_lng: true,
        location_radius_m: true,
        leave_notice_days: true
      }
    });

    res.json(updatedTenant);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /admin/users/:id
 * Delete a user by ID.
 */
router.delete('/admin/users/:id', async (req, res, next) => {
  const { id } = req.params;
  const { adminPassword } = req.body;

  if (id === req.user!.userId) {
    return res.status(400).json({ error: 'You cannot delete your own admin account.' });
  }

  if (!adminPassword) {
    return res.status(400).json({ error: 'Admin password is required to confirm deletion.' });
  }

  try {
    // 1. Fetch current logged-in user to verify password
    const adminUser = await getPrisma().users.findUnique({
      where: { id: req.user!.userId }
    });

    if (!adminUser) {
      return res.status(401).json({ error: 'Admin user not found.' });
    }

    // 2. Verify admin password
    const passwordMatch = await bcrypt.compare(adminPassword, adminUser.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid admin password. Deletion aborted.' });
    }

    // 3. Fetch user to delete
    const user = await getPrisma().users.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Soft-delete: set status to 'disabled' and update username to release original name
    await getPrisma().users.update({
      where: { id },
      data: {
        status: 'disabled',
        username: `${user.username}_deleted_${Date.now()}`
      }
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    next(error);
  }
});

export default router;
