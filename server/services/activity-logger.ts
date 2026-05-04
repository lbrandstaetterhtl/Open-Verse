import { db } from "../db";
import { activityLogs } from "@shared/schema";
import { anomalyDetector } from "./anomaly-detector";
import type { Request } from "express";

/**
 * APE-FIX [LOG-001]: Explicit Unix Timestamps
 */
function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

export interface LogEntry {
  userId?: number;
  userEmail?: string;
  userRole?: string;
  userUsername?: string;
  action: string;
  category: string;
  subcategory?: string;
  description: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  metadata?: Record<string, unknown>;
  oldValue?: unknown;
  newValue?: unknown;
  status?: 'success' | 'failure' | 'warning' | 'blocked';
  severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  req?: Request;
}

class ActivityLoggerService {
  private queue: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly MAX_QUEUE_SIZE = 5000;
  private readonly FLUSH_INTERVAL_MS = 2000;

  async log(entry: LogEntry): Promise<void> {
    if (this.queue.length >= this.MAX_QUEUE_SIZE) return;
    this.queue.push(entry);

    if (entry.severity === 'critical' || entry.severity === 'error' || this.queue.length >= this.BATCH_SIZE) {
      await this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL_MS);
    }
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    this.flushTimer = null;
    const now = nowUnix();

    try {
      const recordsToInsert = batch.map(entry => {
        const deviceInfo = this.parseUserAgent(entry.req?.headers['user-agent']);
        return {
          userId: entry.userId,
          userEmail: entry.userEmail,
          userRole: entry.userRole,
          userUsername: entry.userUsername,
          action: entry.action,
          category: entry.category,
          subcategory: entry.subcategory,
          description: entry.description,
          metadata: JSON.stringify(entry.metadata ?? {}),
          ipAddress: entry.req?.ip || entry.req?.socket?.remoteAddress,
          userAgent: entry.req?.headers['user-agent'],
          deviceType: deviceInfo.type,
          deviceOs: deviceInfo.os,
          deviceBrowser: deviceInfo.browser,
          status: entry.status ?? 'success',
          severity: entry.severity ?? 'info',
          createdAt: now, // Explicit Integer
        };
      });

      await db.insert(activityLogs).values(recordsToInsert as any[]);

      for (const entry of recordsToInsert) {
        this.runAnomalyDetection(entry).catch(console.error);
      }
    } catch (error) {
      console.error('[ActivityLogger] Flush failed:', error);
    }
  }

  private async runAnomalyDetection(entry: any): Promise<void> {
    // Brute Force check for ALL actions of type login_failed
    await anomalyDetector.checkBruteForce(entry);
    await anomalyDetector.checkMassAction(entry);
    await anomalyDetector.checkImpossibleTravel(entry);
    await anomalyDetector.checkNewDevice(entry);
    await anomalyDetector.checkContentSpam(entry);
    await anomalyDetector.checkAccountSharing(entry);
  }

  private parseUserAgent(ua?: string) {
    if (!ua) return { type: 'unknown', os: 'unknown', browser: 'unknown' };
    const mobile = /Mobile|Android|iPhone|iPad/.test(ua);
    return {
      type: mobile ? 'mobile' : 'desktop',
      os: /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : 'unknown',
      browser: /Chrome/.test(ua) && !/Edge/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) && !/Chrome/.test(ua) ? 'Safari' : /Edge/.test(ua) ? 'Edge' : 'unknown',
    };
  }

  logFromRequest(req: Request, entry: any) {
    const user = (req as any).user;
    return this.log({ ...entry, userId: user?.id, userEmail: user?.email, userRole: user?.role, userUsername: user?.username, req });
  }
}

export const activityLogger = new ActivityLoggerService();
