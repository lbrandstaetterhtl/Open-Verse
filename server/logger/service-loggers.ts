// server/logger/service-loggers.ts
// Vorkonfigurierte Logger für jeden Service

import { logger } from './index';

// Auto-Punishment Logger
export const apLogger = {
  ruleEvaluated: (ruleName: string, userId: number | undefined, result: 'skip' | 'execute', reason: string) => {
    logger.log({
      level:    result === 'execute' ? 'warn' : 'debug',
      category: 'security',
      message:  `Auto-Punishment rule "${ruleName}": ${result}`,
      userId,
      data:     { ruleName, result, reason },
    });
  },

  actionExecuted: (ruleName: string, action: string, userId: number | undefined, success: boolean) => {
    logger.log({
      level:    success ? 'warn' : 'error',
      category: 'security',
      message:  `Auto-Punishment executed: ${action} for user ${userId}`,
      userId,
      data:     { ruleName, action, success },
    });
  },

  dryRun: (ruleName: string, action: string, userId: number | undefined) => {
    logger.log({
      level:    'info',
      category: 'security',
      message:  `[DRY-RUN] Would execute: ${action} for user ${userId}`,
      userId,
      data:     { ruleName, action, dryRun: true },
    });
  },
};

// Anomaly Detection Logger
export const anomalyLogger = {
  detected: (type: string, userId: number | undefined, severity: string, details: Record<string, unknown>) => {
    logger.securityEvent({
      type,
      userId,
      severity: severity as any,
      details:  { anomalyType: type, ...details },
    });
  },

  deduplicated: (type: string, userId: number | undefined) => {
    logger.log({
      level:    'debug',
      category: 'security',
      message:  `Anomaly deduplicated: ${type} for user ${userId}`,
      userId,
      data:     { type },
    });
  },
};

// DB Logger
export const dbLogger = {
  connection: (status: 'connected' | 'error', details?: Record<string, unknown>) => {
    logger.log({
      level:    status === 'error' ? 'critical' : 'info',
      category: 'db',
      message:  `Database ${status}`,
      data:     details,
    });
  },

  migration: (name: string, status: 'started' | 'completed' | 'failed', error?: unknown) => {
    logger.log({
      level:    status === 'failed' ? 'critical' : 'info',
      category: 'db',
      message:  `Migration "${name}": ${status}`,
      error,
    });
  },
};
