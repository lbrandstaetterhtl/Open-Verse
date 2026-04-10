import { db } from "../db";
import { activityLogs } from "@shared/schema";
import { anomalyDetector } from "./anomaly-detector";
import { Request } from "express";

export type LogAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.register'
  | 'auth.password_change'
  | 'auth.password_reset_request'
  | 'auth.password_reset_complete'
  | 'auth.session_expired'
  | 'auth.account_locked'
  | 'auth.2fa_enabled'
  | 'auth.2fa_disabled'
  | 'auth.2fa_failed'
  | 'post.create'
  | 'post.edit'
  | 'post.delete'
  | 'post.hide'
  | 'post.restore'
  | 'post.view'
  | 'comment.create'
  | 'comment.edit'
  | 'comment.delete'
  | 'comment.hide'
  | 'media.upload'
  | 'media.delete'
  | 'like.add'
  | 'like.remove'
  | 'follow.add'
  | 'follow.remove'
  | 'block.add'
  | 'block.remove'
  | 'report.submit'
  | 'report.resolve'
  | 'mention.create'
  | 'community.create'
  | 'community.edit'
  | 'community.delete'
  | 'community.join'
  | 'community.leave'
  | 'community.invite'
  | 'community.ban_member'
  | 'community.unban_member'
  | 'user.profile_view'
  | 'user.profile_edit'
  | 'user.avatar_change'
  | 'user.settings_change'
  | 'user.delete_account'
  | 'user.deactivate'
  | 'user.reactivate'
  | 'admin.login'
  | 'admin.user_ban'
  | 'admin.user_unban'
  | 'admin.user_role_change'
  | 'admin.content_remove'
  | 'admin.content_restore'
  | 'admin.settings_change'
  | 'admin.bulk_action'
  | 'admin.data_export'
  | 'admin.impersonate'
  | 'ticket.create'
  | 'ticket.status_change'
  | 'ticket.priority_change'
  | 'ticket.comment'
  | 'ticket.assign'
  | 'ticket.delete'
  | 'ticket.restore'
  | 'security.suspicious_request'
  | 'security.rate_limit_exceeded'
  | 'security.blocked_ip'
  | 'security.xss_attempt'
  | 'security.sql_injection_attempt'
  | 'security.csrf_violation'
  | 'security.auth_bypass_attempt'
  | 'system.startup'
  | 'system.shutdown'
  | 'system.error'
  | 'system.migration'
  | 'system.backup'
  | 'system.config_change';

export interface LogEntry {
  userId?: number;
  userEmail?: string;
  userRole?: string;
  userUsername?: string;
  action: LogAction;
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
  private readonly FLUSH_INTERVAL_MS = 2000;

  async log(entry: LogEntry): Promise<void> {
    this.queue.push(entry);

    if (entry.severity === 'critical' || entry.severity === 'error') {
      await this.flush();
      return;
    }

    if (this.queue.length >= this.BATCH_SIZE) {
      await this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL_MS);
    }
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.queue.length);
    this.flushTimer = null;

    try {
      const recordsToInsert = [];
      const entriesForAnomaly = [];

      for (const entry of batch) {
        const deviceInfo = this.parseUserAgent(entry.req?.headers['user-agent']);
        const ipInfo = await this.getIpInfo(entry.req?.ip);
        
        const preparedEntry = {
          userId: entry.userId,
          userEmail: entry.userEmail,
          userRole: entry.userRole,
          userUsername: entry.userUsername,
          action: entry.action,
          category: entry.category,
          subcategory: entry.subcategory,
          description: entry.description,
          targetType: entry.targetType,
          targetId: entry.targetId ? String(entry.targetId) : undefined,
          targetLabel: entry.targetLabel,
          metadata: JSON.stringify(entry.metadata ?? {}),
          oldValue: entry.oldValue ? JSON.stringify(entry.oldValue) : undefined,
          newValue: entry.newValue ? JSON.stringify(entry.newValue) : undefined,
          ipAddress: entry.req?.ip || undefined,
          ipCountry: ipInfo?.country || undefined,
          ipCity: ipInfo?.city || undefined,
          userAgent: entry.req?.headers['user-agent'] || undefined,
          deviceType: deviceInfo.type,
          deviceOs: deviceInfo.os,
          deviceBrowser: deviceInfo.browser,
          sessionId: entry.req?.sessionID || undefined,
          status: entry.status ?? 'success',
          severity: entry.severity ?? 'info',
        };

        recordsToInsert.push(preparedEntry);
        entriesForAnomaly.push({ ...entry, deviceInfo, ...preparedEntry });
      }

      await db.insert(activityLogs).values(recordsToInsert as any[]);

      this.runAnomalyDetection(entriesForAnomaly).catch(err =>
        console.error('Anomaly detection failed:', err)
      );

    } catch (error) {
      console.error('[ActivityLogger] Failed to write batch:', error);
    }
  }

  private parseUserAgent(ua?: string) {
    if (!ua) return { type: 'unknown', os: 'unknown', browser: 'unknown' };

    const mobile = /Mobile|Android|iPhone|iPad/.test(ua);
    const tablet = /iPad|Tablet/.test(ua);

    return {
      type: tablet ? 'tablet' : mobile ? 'mobile' : 'desktop',
      os: /Windows/.test(ua) ? 'Windows' :
          /Mac/.test(ua) ? 'macOS' :
          /Linux/.test(ua) ? 'Linux' :
          /Android/.test(ua) ? 'Android' :
          /iOS|iPhone|iPad/.test(ua) ? 'iOS' : 'unknown',
      browser: /Chrome/.test(ua) && !/Chromium|Edge/.test(ua) ? 'Chrome' :
               /Firefox/.test(ua) ? 'Firefox' :
               /Safari/.test(ua) && !/Chrome/.test(ua) ? 'Safari' :
               /Edge/.test(ua) ? 'Edge' : 'unknown',
    };
  }

  private async getIpInfo(ip?: string) {
    if (!ip || ip === '127.0.0.1' || ip === '::1') {
      return { country: 'local', city: 'local' };
    }
    return { country: 'unknown', city: 'unknown' };
  }

  logFromRequest(req: Request, entry: Omit<LogEntry, 'req' | 'userId' | 'userEmail' | 'userRole' | 'userUsername'>) {
    const user = (req as any).user;
    return this.log({
      ...entry,
      userId: user?.id,
      userEmail: user?.email,
      userRole: user?.role,
      userUsername: user?.username,
      req,
    });
  }

  private async runAnomalyDetection(batch: any[]): Promise<void> {
    for (const entry of batch) {
      if (!entry.userId) continue;

      await Promise.allSettled([
        anomalyDetector.checkBruteForce(entry),
        anomalyDetector.checkMassAction(entry),
        anomalyDetector.checkImpossibleTravel(entry),
        anomalyDetector.checkNewDevice(entry),
        anomalyDetector.checkContentSpam(entry),
        anomalyDetector.checkFollowUnfollowLoop(entry),
        anomalyDetector.checkAccountSharing(entry),
        anomalyDetector.checkApiAbuse(entry),
      ]);
    }
  }
}

export const activityLogger = new ActivityLoggerService();
