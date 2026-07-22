import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma, tenantStorage } from '../context';
import { config } from '../config';

export interface UserPayload {
  userId: string;
  tenantId: string;
  role: string;
  page_permissions?: any;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

/**
 * Middleware to authenticate user JWT token.
 * Attaches decoded payload (userId, tenantId, role) to req.user.
 */
export const authenticateUser = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or invalid' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as UserPayload;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Middleware to establish RLS tenant context for all queries executed in this request.
 * Starts a Prisma transaction, runs `SET LOCAL app.current_tenant`, and executes
 * the rest of the request within AsyncLocalStorage transaction context.
 *
 * If the response returns an error status (>= 400), the transaction is rolled back.
 */
export const setTenantContext = async (req: Request, res: Response, next: NextFunction) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    return res.status(401).json({ error: 'Tenant context required' });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    return res.status(400).json({ error: 'Invalid tenantId format' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Run SET LOCAL app.current_tenant inside this transaction connection
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);

      // 2. Verify user still exists and is active
      if (req.user?.userId) {
        const currentUser = await tx.users.findUnique({
          where: { id: req.user.userId },
          select: { id: true, status: true }
        });

        if (!currentUser || currentUser.status !== 'active') {
          res.status(401).json({ error: 'User account is inactive or disabled' });
          return;
        }
      }

      // 2. Wrap the execution of subsequent handlers in a Promise
      await new Promise<void>((resolve, reject) => {
        const onFinish = () => {
          cleanup();
          if (res.statusCode >= 400) {
            reject(new Error(`Transaction rolled back due to error response status ${res.statusCode}`));
          } else {
            resolve(); // commits transaction
          }
        };

        const onError = (err: any) => {
          cleanup();
          reject(err); // rolls back transaction
        };

        const cleanup = () => {
          res.off('finish', onFinish);
          res.off('close', onFinish);
          req.off('error', onError);
        };

        res.on('finish', onFinish);
        res.on('close', onFinish); // fallback if client disconnects early
        req.on('error', onError);

        // Run the remainder of the request lifecycle in the AsyncLocalStorage context
        tenantStorage.run(tx, () => {
          next();
        });
      });
    });
  } catch (error) {
    // Forward transaction failures to Express error handler
    if (!res.headersSent) {
      next(error);
    }
  }
};

/**
 * Middleware factory to restrict route access based on user role.
 */
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};
