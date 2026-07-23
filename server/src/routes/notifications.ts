import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../context';
import { authenticateUser, setTenantContext } from '../middleware/auth';

const router = Router();

router.use(authenticateUser);
router.use(setTenantContext);

// GET /notifications - Get authenticated user's notifications (paginated, filterable)
router.get('/notifications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const tenantId = req.user!.tenantId;

    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '20', 10)));
    const skip = (page - 1) * limit;

    const isReadParam = req.query.isRead as string | undefined;
    const typeParam = req.query.type as string | undefined;

    const where: any = {
      tenant_id: tenantId,
      recipient_user_id: userId
    };

    if (isReadParam !== undefined && isReadParam !== '') {
      where.is_read = isReadParam === 'true';
    }

    if (typeParam && typeParam.trim() !== '') {
      where.type = typeParam.trim();
    }

    const prisma = getPrisma() as any;

    const [notifications, total] = await Promise.all([
      prisma.notifications.findMany({
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
      prisma.notifications.count({ where })
    ]);

    const unreadCount = await prisma.notifications.count({
      where: {
        tenant_id: tenantId,
        recipient_user_id: userId,
        is_read: false
      }
    });

    res.json({
      notifications,
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
});

// GET /notifications/unread-count - Get authenticated user's unread notification count
router.get('/notifications/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const tenantId = req.user!.tenantId;
    const prisma = getPrisma() as any;

    const unreadCount = await prisma.notifications.count({
      where: {
        tenant_id: tenantId,
        recipient_user_id: userId,
        is_read: false
      }
    });

    res.json({ unreadCount });
  } catch (error) {
    next(error);
  }
});

// PATCH /notifications/:id/read - Mark one notification as read
router.get('/notifications/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  // redirect or fallback if called via GET
  return res.status(405).json({ error: 'Use PATCH method to mark notification as read' });
});

router.patch('/notifications/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const tenantId = req.user!.tenantId;
    const prisma = getPrisma() as any;

    const notification = await prisma.notifications.findFirst({
      where: {
        id,
        tenant_id: tenantId,
        recipient_user_id: userId
      }
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found or access denied' });
    }

    const updated = await prisma.notifications.update({
      where: { id },
      data: {
        is_read: true,
        read_at: new Date()
      }
    });

    res.json({ message: 'Notification marked as read', notification: updated });
  } catch (error) {
    next(error);
  }
});

// PATCH /notifications/read-all - Mark all user notifications as read
router.patch('/notifications/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const tenantId = req.user!.tenantId;
    const prisma = getPrisma() as any;

    const result = await prisma.notifications.updateMany({
      where: {
        tenant_id: tenantId,
        recipient_user_id: userId,
        is_read: false
      },
      data: {
        is_read: true,
        read_at: new Date()
      }
    });

    res.json({ message: 'All notifications marked as read', count: result.count });
  } catch (error) {
    next(error);
  }
});

// DELETE /notifications/:id - Delete a notification if owned by user
router.delete('/notifications/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const tenantId = req.user!.tenantId;
    const prisma = getPrisma() as any;

    const notification = await prisma.notifications.findFirst({
      where: {
        id,
        tenant_id: tenantId,
        recipient_user_id: userId
      }
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found or access denied' });
    }

    await prisma.notifications.delete({
      where: { id }
    });

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
