import { Request, Response, NextFunction } from "express";
import { metricsService } from "../services/metrics-service";
import { activityLogger } from "../services/activity-logger";

export function monitoringMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    if (req.path.startsWith('/api/') && req.path !== '/api/health') {
      metricsService.record('api_response_time', duration, {
        endpoint: req.path,
        method: req.method,
        status: String(statusCode)
      });

      if (statusCode >= 400 && statusCode !== 401 && statusCode !== 403) {
        metricsService.record('api_error', 1, {
          endpoint: req.path,
          status: String(statusCode)
        });
      }

      if (statusCode === 401) {
        activityLogger.log({
          userId: (req as any).user?.id,
          action: 'security.suspicious_request',
          category: 'security',
          description: `Unauthorized request to ${req.method} ${req.path}`,
          severity: 'warning',
          status: 'blocked',
          req,
        });
      }

      if (statusCode === 403) {
        activityLogger.log({
          userId: (req as any).user?.id,
          action: 'security.auth_bypass_attempt',
          category: 'security',
          description: `Forbidden request to ${req.method} ${req.path}`,
          severity: 'warning',
          status: 'blocked',
          req,
        });
      }
    }
  });

  next();
}

export function slowQueryMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (duration > 2000 && req.path.startsWith('/api/')) {
      console.warn(`[SLOW REQUEST] ${req.method} ${req.path} took ${duration}ms`);
      activityLogger.log({
        action: 'system.error',
        category: 'system',
        description: `Slow request: ${req.method} ${req.path} took ${duration}ms`,
        severity: 'warning',
        metadata: { duration, endpoint: req.path, method: req.method },
        req,
      });
    }
  });

  next();
}
