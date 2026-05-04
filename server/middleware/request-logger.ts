// server/middleware/request-logger.ts
// Loggt JEDEN HTTP Request mit allen relevanten Infos

import { Request, Response, NextFunction } from 'express';
import { logger, generateRequestId } from '../logger';

// Request-ID zum Request-Objekt hinzufügen
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Unique ID für diesen Request
  req.requestId = generateRequestId();
  req.startTime = Date.now();

  // Request-ID in Response-Header (für Debugging)
  res.setHeader('X-Request-ID', req.requestId);

  // Response abfangen um Duration zu messen
  const originalEnd = res.end.bind(res);

  res.end = function(chunk?: any, encoding?: any, callback?: any) {
    const duration = Date.now() - req.startTime;

    // Statische Assets nicht loggen (zu viel Noise)
    const skipPaths = ['/favicon.ico', '/robots.txt'];
    const isStatic  = req.path.match(/\.(css|js|png|jpg|svg|ico|woff|woff2)$/);

    if (!skipPaths.includes(req.path) && !isStatic) {
      logger.http({
        method:     req.method,
        path:       req.path,
        statusCode: res.statusCode,
        duration,
        userId:     (req as any).user?.id ?? null,
        ip:         req.ip ?? req.socket.remoteAddress,
        requestId:  req.requestId,
        userAgent:  req.headers['user-agent'] as string,
      });
    }

    return originalEnd(chunk, encoding, callback);
  } as any;

  next();
}
