import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma, getPrisma } from '../context';
import { authenticateUser, setTenantContext } from '../middleware/auth';

const router = Router();
const getJwtSecret = () => process.env.JWT_SECRET || 'replace-this-with-a-long-random-string';

// Helper to slugify tenant name for comparison
const slugify = (text: string) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * POST /auth/login
 * Accepts: { username, password, tenantSlug }
 */
router.post('/auth/login', async (req, res, next) => {
  const { username, password, tenantSlug } = req.body;

  if (!username || !password || !tenantSlug) {
    return res.status(400).json({ error: 'Missing username, password, or tenantSlug' });
  }

  try {
    // 1. Look up the tenant by slugifying the name (public table, no RLS)
    const tenants = await prisma.tenants.findMany();
    const tenant = tenants.find(
      (t) => slugify(t.name) === slugify(tenantSlug) || t.name.toLowerCase() === tenantSlug.toLowerCase()
    );

    if (!tenant) {
      return res.status(401).json({ error: 'Invalid tenant' });
    }

    // 2. Look up user scoped to that tenant.
    // Because users table has RLS, we must run the query inside a transaction
    // and execute SET LOCAL app.current_tenant first.
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenant.id}'`);
      return await tx.users.findFirst({
        where: {
          username: username,
          tenant_id: tenant.id
        }
      });
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // 3. Verify password with bcrypt
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // 4. Issue JWT containing userId, tenantId, role, and page_permissions
    const token = jwt.sign(
      {
        userId: user.id,
        tenantId: user.tenant_id,
        role: user.role,
        page_permissions: user.page_permissions as any
      },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    res.json({ token });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/signup
 * Accepts: { companyName, adminUsername, adminPassword }
 */
router.post('/auth/signup', async (req, res, next) => {
  const { companyName, adminUsername, adminPassword } = req.body;

  if (!companyName || !adminUsername || !adminPassword) {
    return res.status(400).json({ error: 'Missing companyName, adminUsername, or adminPassword' });
  }

  try {
    const targetSlug = slugify(companyName);
    
    // 1. Check if a tenant with this slug already exists to prevent collisions
    const existingTenants = await prisma.tenants.findMany();
    const isDuplicate = existingTenants.some(
      (t) => slugify(t.name) === targetSlug || t.name.toLowerCase() === companyName.toLowerCase()
    );

    if (isDuplicate) {
      return res.status(400).json({ error: 'A company with this name already exists. Please choose a different name.' });
    }

    // 2. Hash the password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // 3. Create tenant and user in a transaction
    const { newTenant, newUser } = await prisma.$transaction(async (tx) => {
      // Create tenant
      const tenant = await tx.tenants.create({
        data: { name: companyName }
      });

      // Set RLS context for user creation
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenant.id}'`);

      // Create admin user
      const user = await tx.users.create({
        data: {
          tenant_id: tenant.id,
          username: adminUsername,
          password_hash: hashedPassword,
          role: 'admin',
          status: 'active',
          page_permissions: { attendance: true, leaveRequests: true, payroll: true, sopLibrary: true } as any
        }
      });

      return { newTenant: tenant, newUser: user };
    });

    // 4. Issue JWT containing userId, tenantId, role, and page_permissions
    const token = jwt.sign(
      {
        userId: newUser.id,
        tenantId: newUser.tenant_id,
        role: newUser.role,
        page_permissions: newUser.page_permissions as any
      },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    res.status(201).json({ token });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /me
 * Protected by authenticateUser and setTenantContext.
 * Returns the current user's profile info.
 */
router.get('/me', authenticateUser, setTenantContext, async (req, res, next) => {
  try {
    const user = await getPrisma().users.findUnique({
      where: {
        id: req.user!.userId
      },
      select: {
        id: true,
        tenant_id: true,
        username: true,
        role: true,
        status: true,
        hourly_rate: true,
        page_permissions: true,
        created_at: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /test-no-context
 * Public route that queries users WITHOUT setting any tenant context.
 * Used to verify the RLS "fail closed" behavior (should return zero rows).
 */
router.get('/test-no-context', async (req, res, next) => {
  try {
    const users = await getPrisma().users.findMany();
    res.json(users);
  } catch (error) {
    next(error);
  }
});

export default router;
