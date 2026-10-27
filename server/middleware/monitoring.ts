import type { Request, Response, NextFunction } from "express";
import { metricsService } from "../services/metrics-service";
import { activityLogger } from "../services/activity-logger";
import { logger } from "../logger";

export function monitoringMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    if (req.path.startsWith('/api/') && req.path !== '/api/health') {
      metricsService.record('api_response_time', duration, {
        endpoint: req.path.slice(0, 200),
        method: req.method,
        status: String(statusCode)
      });

      if (statusCode >= 400 && statusCode !== 401 && statusCode !== 403) {
        metricsService.record('api_error', 1, {
          endpoint: req.path.slice(0, 200),
          status: String(statusCode)
        });
      }

      // Only signed-in callers get an activity_logs row for a refused request. Anonymous 401/403 answers
      // (every page load asks GET /api/user; CSRF failures; banned addresses) are routine and unbounded:
      // they only show up in the api_response_time metric above (with their status) instead of writing a row
      // and running the anomaly checks each time.
      const userId = (req as any).user?.id;
      if (!userId) {
        // nothing more to record
      } else if (statusCode === 401) {
        activityLogger.log({
          userId,
          action: 'security.suspicious_request',
          category: 'security',
          description: `Unauthorized request to ${req.method} ${req.path.slice(0, 200)}`,
          severity: 'warning',
          status: 'blocked',
          req,
        });
      } else if (statusCode === 403) {
        activityLogger.log({
          userId,
          action: 'security.auth_bypass_attempt',
          category: 'security',
          description: `Forbidden request to ${req.method} ${req.path.slice(0, 200)}`,
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
      logger.warn('performance', `Slow request detected: ${req.method} ${req.path}`, {
        duration,
        method: req.method,
        path: req.path,
        requestId: (req as any).requestId,
      });
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
