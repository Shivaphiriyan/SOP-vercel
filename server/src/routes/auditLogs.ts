import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../context';
import { authenticateUser, setTenantContext } from '../middleware/auth';

const router = Router();

router.use(authenticateUser);
router.use(setTenantContext);

// Middleware to authorize audit logs view access
const requireAuditAccess = (req: Request, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  const pagePermissions = req.user?.page_permissions;

  const isAuthorized =
    role === 'admin' ||
    role === 'supervisor' ||
    role === 'auditor' ||
    pagePermissions?.auditLogs === true ||
    pagePermissions?.audit_logs === true;

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions to access audit logs' });
  }

  next();
};

// GET /audit-logs - Read-only paginated & filterable list of audit logs
router.get('/audit-logs', requireAuditAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;

    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '20', 10)));
    const skip = (page - 1) * limit;

    const { actorUserId, action, entityType, status, search, dateFrom, dateTo } = req.query;

    const where: any = {
      tenant_id: tenantId
    };

    if (actorUserId && typeof actorUserId === 'string' && actorUserId.trim() !== '') {
      where.actor_user_id = actorUserId.trim();
    }

    if (action && typeof action === 'string' && action.trim() !== '') {
      where.action = action.trim();
    }

    if (entityType && typeof entityType === 'string' && entityType.trim() !== '') {
      where.entity_type = entityType.trim();
    }

    if (status && typeof status === 'string' && status.trim() !== '') {
      where.status = status.trim();
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      where.description = {
        contains: search.trim(),
        mode: 'insensitive'
      };
    }

    if (dateFrom || dateTo) {
      where.created_at = {};
      if (dateFrom && typeof dateFrom === 'string' && dateFrom.trim() !== '') {
        where.created_at.gte = new Date(dateFrom.trim());
      }
      if (dateTo && typeof dateTo === 'string' && dateTo.trim() !== '') {
        where.created_at.lte = new Date(dateTo.trim());
      }
    }

    const prisma = getPrisma() as any;

    const [logs, total] = await Promise.all([
      prisma.audit_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          actor_user: {
            select: {
              id: true,
              username: true,
              role: true
            }
          }
        }
      }),
      prisma.audit_logs.count({ where })
    ]);

    res.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
});

// GET /audit-logs/:id - Get single audit log detail
router.get('/audit-logs/:id', requireAuditAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const prisma = getPrisma() as any;

    const log = await prisma.audit_logs.findFirst({
      where: {
        id,
        tenant_id: tenantId
      },
      include: {
        actor_user: {
          select: {
            id: true,
            username: true,
            role: true
          }
        }
      }
    });

    if (!log) {
      return res.status(404).json({ error: 'Audit log entry not found or access denied' });
    }

    res.json({ log });
  } catch (error) {
    next(error);
  }
});

export default router;
