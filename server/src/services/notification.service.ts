import { getPrisma } from '../context';
import { Prisma } from '@prisma/client';

export interface CreateNotificationParams {
  tenantId: string;
  recipientUserId: string;
  actorUserId?: string | null;
  type: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  metadata?: any;
}

/**
 * Creates a single notification record with deduplication protection.
 */
export async function createNotification(
  params: CreateNotificationParams,
  txClient?: Prisma.TransactionClient
): Promise<any> {
  try {
    const prismaClient = txClient || getPrisma();

    // Deduplication check: check if identical notification created in last 10 seconds
    const tenSecondsAgo = new Date(Date.now() - 10000);
    const existing = await (prismaClient as any).notifications.findFirst({
      where: {
        tenant_id: params.tenantId,
        recipient_user_id: params.recipientUserId,
        type: params.type,
        entity_id: params.entityId || undefined,
        created_at: { gte: tenSecondsAgo }
      }
    });

    if (existing) {
      return existing;
    }

    const created = await (prismaClient as any).notifications.create({
      data: {
        tenant_id: params.tenantId,
        recipient_user_id: params.recipientUserId,
        actor_user_id: params.actorUserId || null,
        type: params.type,
        title: params.title,
        message: params.message,
        entity_type: params.entityType || null,
        entity_id: params.entityId || null,
        action_url: params.actionUrl || null,
        metadata: params.metadata ? params.metadata : Prisma.JsonNull,
        is_read: false
      }
    });

    return created;
  } catch (error) {
    console.error('[NotificationService Warning] Failed to create notification:', error);
    return null;
  }
}

/**
 * Creates multiple notification records in bulk.
 */
export async function createManyNotifications(
  paramsList: CreateNotificationParams[],
  txClient?: Prisma.TransactionClient
): Promise<void> {
  if (!paramsList || paramsList.length === 0) return;

  try {
    for (const params of paramsList) {
      await createNotification(params, txClient);
    }
  } catch (error) {
    console.error('[NotificationService Warning] Failed to create bulk notifications:', error);
  }
}

/**
 * Creates notifications for all active users belonging to specific recipient roles in a tenant.
 */
export async function createRoleNotification(
  tenantId: string,
  roles: string[],
  notificationData: Omit<CreateNotificationParams, 'tenantId' | 'recipientUserId'>,
  txClient?: Prisma.TransactionClient
): Promise<void> {
  try {
    const prismaClient = txClient || getPrisma();

    const targetUsers = await (prismaClient as any).users.findMany({
      where: {
        tenant_id: tenantId,
        role: { in: roles },
        status: 'active'
      },
      select: { id: true }
    });

    const paramsList: CreateNotificationParams[] = targetUsers.map((u: any) => ({
      ...notificationData,
      tenantId,
      recipientUserId: u.id
    }));

    await createManyNotifications(paramsList, txClient);
  } catch (error) {
    console.error('[NotificationService Warning] Failed to send role notifications:', error);
  }
}
