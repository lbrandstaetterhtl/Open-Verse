// server/middleware/error-handler.ts
// Fängt ALLE unbehandelten Fehler ab und loggt sie

import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

export function globalErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Bereits gesendete Response nicht nochmal senden
  if (res.headersSent) {
    logger.error('error', 'Error after headers sent', err, {
      path:      req.path,
      requestId: req.requestId,
    });
    return;
  }

  // Kritische Fehler anders behandeln
  const isCritical =
    err.message?.includes('SQLITE') ||
    err.message?.includes('out of memory') ||
    err.message?.includes('ENOENT') ||
    err.name === 'SystemError';

  if (isCritical) {
    logger.critical('error', `Critical system error: ${err.message}`, err, {
      path:      req.path,
      method:    req.method,
      requestId: req.requestId,
      userId:    (req as any).user?.id,
    });
  } else {
    logger.error('error', `Unhandled route error: ${err.message}`, err, {
      path:      req.path,
      method:    req.method,
      requestId: req.requestId,
      userId:    (req as any).user?.id,
    });
  }

  const isDev = process.env.NODE_ENV !== 'production';

  res.status(err.status || err.statusCode || 500).json({
    error:     isDev ? err.message : 'Interner Serverfehler',
    requestId: req.requestId,
    ...(isDev && { stack: err.stack }),
  });
}
