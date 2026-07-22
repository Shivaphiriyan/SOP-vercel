import { Request, Response, NextFunction } from 'express';
import { sanitizeLogData } from '../utils/sanitize';

/**
 * Global Express error handling middleware.
 * Logs full details to the console/logs and returns a generic JSON response to the client.
 */
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // If response headers have already been sent, delegate to the default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Log full error details (stack trace, request info) to server console
  console.error('=== UNHANDLED EXCEPTION ===');
  console.error(`Timestamp: ${new Date().toISOString()}`);
  console.error(`Route: ${req.method} ${req.originalUrl}`);
  console.error('Query Params:', sanitizeLogData(req.query));
  console.error('Body:', sanitizeLogData(req.body));
  if (req.user) {
    console.error('User Payload:', {
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      role: req.user.role
    });
  }
  console.error('Error Details:', err.stack || err);
  console.error('===========================');

  // Return generic error message to the client, hiding internal details
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
