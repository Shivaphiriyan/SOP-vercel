import { Request } from 'express';
import { getPrisma } from '../context';
import { Prisma } from '@prisma/client';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'secret',
  'jwtsecret',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'cloudinaryapisecret',
  'cloudinary_api_secret',
  'cookie',
  'session'
]);

/**
 * Recursively sanitizes data structures by replacing sensitive fields with '[REDACTED]'.
 */
export function sanitizeAuditData(data: any): any {
  if (data === null || data === undefined) return data;

  if (typeof data !== 'object' || data instanceof Date) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitiveKey =
      SENSITIVE_KEYS.has(lowerKey) ||
      lowerKey.includes('password') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('apikey') ||
      lowerKey.includes('token');

    if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
      sanitized[key] = sanitizeAuditData(value);
    } else if (isSensitiveKey) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export interface CreateAuditLogParams {
  tenantId: string;
  actorUserId?: string | null;
  actorNameSnapshot?: string | null;
  actorEmailSnapshot?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  description?: string;
  oldValues?: any;
  newValues?: any;
  metadata?: any;
  status?: string;
}

/**
 * Creates an immutable audit log entry in the database.
 * Does not throw errors to prevent breaking primary business logic if audit logging fails.
 */
export async function createAuditLog(
  params: CreateAuditLogParams,
  req?: Request,
  txClient?: Prisma.TransactionClient
): Promise<void> {
  try {
    const prismaClient = txClient || getPrisma();

    let ipAddress = req ? ((req.headers['x-forwarded-for'] as string) || req.ip || req.socket?.remoteAddress || null) : null;
    if (ipAddress && ipAddress.includes(',')) {
      ipAddress = ipAddress.split(',')[0].trim();
    }

    const userAgent = req ? ((req.headers['user-agent'] as string) || null) : null;
    const requestMethod = req ? req.method : null;
    const requestPath = req ? (req.originalUrl || req.path) : null;

    const actorUserId = params.actorUserId !== undefined ? params.actorUserId : (req?.user?.userId || null);
    const actorNameSnapshot = params.actorNameSnapshot !== undefined ? params.actorNameSnapshot : (req?.user?.role ? `${req.user.role}:${req.user.userId}` : null);

    const oldValues = params.oldValues ? sanitizeAuditData(params.oldValues) : Prisma.JsonNull;
    const newValues = params.newValues ? sanitizeAuditData(params.newValues) : Prisma.JsonNull;
    const metadata = params.metadata ? sanitizeAuditData(params.metadata) : Prisma.JsonNull;

    await (prismaClient as any).audit_logs.create({
      data: {
        tenant_id: params.tenantId,
        actor_user_id: actorUserId,
        actor_name_snapshot: actorNameSnapshot,
        actor_email_snapshot: params.actorEmailSnapshot || null,
        action: params.action,
        entity_type: params.entityType || 'system',
        entity_id: params.entityId || null,
        description: params.description || `Action ${params.action} performed`,
        old_values: oldValues,
        new_values: newValues,
        metadata: metadata,
        ip_address: ipAddress,
        user_agent: userAgent,
        request_method: requestMethod,
        request_path: requestPath,
        status: params.status || 'success'
      }
    });
  } catch (error) {
    console.error('[AuditService Warning] Failed to record audit log:', error);
  }
}
