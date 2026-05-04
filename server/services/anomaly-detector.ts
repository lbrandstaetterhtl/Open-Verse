import { db } from "../db";
import { activityLogs, anomalyEvents, ActivityLog } from "@shared/schema";
import { count, eq, and, or, gte, desc, inArray, sql } from "drizzle-orm";
import { alertService } from "./alert-service";
import { autoPunishmentEngine } from "./auto-punishment-engine";

class AnomalyDetector {

  async checkBruteForce(entry: any): Promise<void> {
    if (entry.action !== 'auth.login_failed') return;
    const ip = entry.req?.ip || "unknown";
    
    // SEC-FIX [SEC-008]: Dynamic Penalization
    // If there are recent open anomalies for this user/IP, lower the threshold
    const [recentAnomalies] = await db.select({ count: count() })
      .from(anomalyEvents)
      .where(and(
        or(entry.userId ? eq(anomalyEvents.userId, entry.userId) : sql`1=0`, eq(anomalyEvents.description, ip)),
        eq(anomalyEvents.status, 'open'),
        sql`${anomalyEvents.createdAt} >= ${new Date(Date.now() - 3600000).toISOString()}` // 1 hour
      ));
    
    const baseThreshold = 10;
    const penaltyThreshold = recentAnomalies?.count ? Math.max(3, baseThreshold - (recentAnomalies.count * 2)) : baseThreshold;

    const [failedLogins] = await db.select({ count: count() })
      .from(activityLogs)
      .where(and(
        eq(activityLogs.action, 'auth.login_failed'),
        or(
          entry.userId ? eq(activityLogs.userId, entry.userId) : sql`1=0`,
          eq(activityLogs.ipAddress, ip)
        ),
        sql`${activityLogs.createdAt} >= ${new Date(Date.now() - 900000).toISOString()}`
      ));
 
    const countVal = failedLogins?.count ?? 0;
    if (countVal >= penaltyThreshold) {
      await this.createAnomaly({
        userId: entry.userId,
        type: 'brute_force_login',
        severity: countVal >= baseThreshold ? 'critical' : 'high',
        title: 'Verschärfter Brute-Force-Schutz',
        description: `Wiederholte fehlgeschlagene Logins (${countVal}). Schwelle reduziert durch Vorfälle auf ${penaltyThreshold}. IP: ${ip}`,
        triggerValue: countVal,
        thresholdValue: penaltyThreshold,
        autoAction: 'account_flagged',
        evidence: { ip, failedAttempts: countVal, penaltyApplied: penaltyThreshold < baseThreshold }
      });
    }
  }

  async checkMassAction(entry: any): Promise<void> {
    const action = entry.action;
    const massActionThresholds: Record<string, { window: number; limit: number; severity: string }> = {
      'like.add':      { window: 3600,  limit: 200,  severity: 'warning' },
      'follow.add':    { window: 3600,  limit: 100,  severity: 'warning' },
      'follow.remove': { window: 3600,  limit: 100,  severity: 'warning' },
      'comment.create':{ window: 3600,  limit: 50,   severity: 'warning' },
      'post.create':   { window: 3600,  limit: 20,   severity: 'warning' },
      'report.submit': { window: 86400, limit: 20,   severity: 'high' },
      'block.add':     { window: 3600,  limit: 50,   severity: 'info' },
    };

    const config = massActionThresholds[action];
    if (!config || !entry.userId) return;

    const [recentCount] = await db.select({ count: count() })
      .from(activityLogs)
      .where(and(
        eq(activityLogs.userId, entry.userId),
        eq(activityLogs.action, action as any),
        sql`${activityLogs.createdAt} >= ${new Date(Date.now() - config.window * 1000).toISOString()}`
      ));

    const countVal = recentCount?.count ?? 0;
    if (countVal >= config.limit) {
      await this.createAnomaly({
        userId: entry.userId,
        type: 'mass_action',
        severity: config.severity as any,
        title: `Massen-Aktion erkannt: ${action}`,
        description: `User hat ${countVal} "${action}" Aktionen in ${config.window / 3600} Stunden ausgeführt`,
        triggerValue: countVal,
        thresholdValue: config.limit,
        autoAction: countVal >= config.limit * 2 ? 'rate_limited' : 'none',
        evidence: { action, count: countVal, windowHours: config.window / 3600 }
      });
    }
  }

  async checkImpossibleTravel(entry: any): Promise<void> {
    if (entry.action !== 'auth.login' || entry.status !== 'success' || !entry.userId) return;
    const ipInfo = entry.req?.ipInfo || { country: 'unknown' };
    const country = entry.ipCountry || ipInfo.country;

    const lastLogin = await db.select()
      .from(activityLogs)
      .where(and(
        eq(activityLogs.userId, entry.userId),
        eq(activityLogs.action, 'auth.login'),
        eq(activityLogs.status, 'success')
      ))
      .orderBy(desc(activityLogs.createdAt))
      .limit(2)
      .execute();

    if (lastLogin.length < 2) return;

    const previousLogin = lastLogin[1];
    const currentLogin = lastLogin[0];

    if (previousLogin.ipCountry &&
        previousLogin.ipCountry !== country &&
        previousLogin.ipCountry !== 'local' &&
        country !== 'local' &&
        country !== 'unknown') {

      const prevTime = previousLogin.createdAt instanceof Date ? previousLogin.createdAt.getTime() : new Date(previousLogin.createdAt!).getTime();
      const currTime = currentLogin.createdAt instanceof Date ? currentLogin.createdAt.getTime() : new Date(currentLogin.createdAt!).getTime();
      const timeDiff = (currTime - prevTime) / 1000;
      const twoHours = 2 * 60 * 60;

      if (timeDiff < twoHours) {
        await this.createAnomaly({
          userId: entry.userId,
          type: 'impossible_travel',
          severity: 'high',
          title: 'Impossible Travel erkannt',
          description: `Login aus ${country} nur ${Math.floor(timeDiff / 60)} Minuten nach Login aus ${previousLogin.ipCountry}`,
          triggerValue: timeDiff / 60,
          thresholdValue: 120,
          autoAction: 'account_flagged',
          evidence: {
            previousCountry: previousLogin.ipCountry,
            currentCountry: country,
            timeDifferenceMinutes: Math.floor(timeDiff / 60),
            previousIp: previousLogin.ipAddress,
            currentIp: currentLogin.ipAddress
          }
        });
      }
    }
  }

  async checkNewDevice(entry: any): Promise<void> {
    if (entry.action !== 'auth.login' || entry.status !== 'success' || !entry.userId) return;
    const { browser, os } = entry.deviceInfo || {};
    if (!browser || !os || browser === 'unknown' || os === 'unknown') return;

    const knownDevices = await db.select({
      browser: activityLogs.deviceBrowser,
      os: activityLogs.deviceOs
    })
      .from(activityLogs)
      .where(and(
        eq(activityLogs.userId, entry.userId),
        eq(activityLogs.action, 'auth.login'),
        eq(activityLogs.status, 'success')
      ))
      .orderBy(desc(activityLogs.createdAt))
      .limit(20)
      .execute();

    const isKnownDevice = knownDevices.some(d =>
      d.browser === browser && d.os === os
    );

    if (!isKnownDevice && knownDevices.length >= 3) {
      await this.createAnomaly({
        userId: entry.userId,
        type: 'new_device_login',
        severity: 'warning',
        title: 'Login von unbekanntem Gerät',
        description: `Login von neuem Gerät: ${browser} auf ${os}`,
        triggerValue: 1,
        thresholdValue: 1,
        autoAction: 'none',
        evidence: {
          newDevice: { browser, os },
          knownDevices: knownDevices.slice(0, 5)
        }
      });
    }
  }

  async checkContentSpam(entry: any): Promise<void> {
    if (!['post.create', 'comment.create'].includes(entry.action) || !entry.userId) return;

    const [recentContent] = await db.select({ count: count() })
      .from(activityLogs)
      .where(and(
        eq(activityLogs.userId, entry.userId),
        inArray(activityLogs.action, ['post.create', 'comment.create']),
        sql`${activityLogs.createdAt} >= ${new Date(Date.now() - 300000).toISOString()}`
      ));

    const countVal = recentContent?.count ?? 0;
    if (countVal >= 10) {
      await this.createAnomaly({
        userId: entry.userId,
        type: 'spam_content',
        severity: 'high',
        title: 'Content-Spam erkannt',
        description: `${countVal} Posts/Comments in 5 Minuten erstellt`,
        triggerValue: countVal,
        thresholdValue: 10,
        autoAction: 'rate_limited',
        evidence: { count: countVal, window: '5min' }
      });
    }
  }

  async checkFollowUnfollowLoop(entry: any): Promise<void> {
    if (!['follow.add', 'follow.remove'].includes(entry.action) || !entry.userId) return;

    // Check if the user has followed and unfollowed the exact same target multiple times recently
    const recentFollowActivity = await db.select()
      .from(activityLogs)
      .where(and(
        eq(activityLogs.userId, entry.userId),
        inArray(activityLogs.action, ['follow.add', 'follow.remove']),
        eq(activityLogs.targetId, String(entry.targetId)),
        sql`${activityLogs.createdAt} >= ${new Date(Date.now() - 3600000).toISOString()}`
      ))
      .orderBy(desc(activityLogs.createdAt))
      .execute();

    if (recentFollowActivity.length >= 6) { // e.g. follow, unfollow, follow, unfollow, follow, unfollow
      await this.createAnomaly({
        userId: entry.userId,
        type: 'mass_action', // Categorize as mass action or behavior abuse
        severity: 'warning',
        title: 'Verdächtiges Follow/Unfollow',
        description: `User hat den gleichen Account ${recentFollowActivity.length} mal in 1 Stunde gefolgt/entfolgt`,
        triggerValue: recentFollowActivity.length,
        thresholdValue: 6,
        autoAction: 'none',
        evidence: { targetId: entry.targetId, count: recentFollowActivity.length }
      });
    }
  }

  async checkAccountSharing(entry: any): Promise<void> {
    if (!entry.userId) return;

    const recentSessions = await db.select({
      ipAddress: activityLogs.ipAddress,
      sessionId: activityLogs.sessionId
    })
      .from(activityLogs)
      .where(and(
        eq(activityLogs.userId, entry.userId),
        sql`${activityLogs.createdAt} >= ${new Date(Date.now() - 3600000).toISOString()}`
      ))
      .groupBy(activityLogs.ipAddress)
      .execute();

    const uniqueIps = new Set(recentSessions.map(s => s.ipAddress).filter(Boolean));

    if (uniqueIps.size >= 5) {
      await this.createAnomaly({
        userId: entry.userId,
        type: 'account_sharing',
        severity: 'warning',
        title: 'Verdacht: Account-Sharing',
        description: `Account wird von ${uniqueIps.size} verschiedenen IP-Adressen in 1 Stunde genutzt`,
        triggerValue: uniqueIps.size,
        thresholdValue: 5,
        autoAction: 'none',
        evidence: { uniqueIpCount: uniqueIps.size, ips: [...uniqueIps].slice(0, 10) }
      });
    }
  }

  async checkApiAbuse(entry: any): Promise<void> {
    if (!entry.req || !entry.req.ip) return;
    const ip = entry.req.ip;

    const [requestsLastMinute] = await db.select({ count: count() })
      .from(activityLogs)
      .where(and(
        eq(activityLogs.ipAddress, ip),
        sql`${activityLogs.createdAt} >= ${new Date(Date.now() - 60000).toISOString()}`
      ));

    const countVal = requestsLastMinute?.count ?? 0;
    if (countVal >= 100) {
      await this.createAnomaly({
        userId: entry.userId,
        type: 'api_abuse',
        severity: 'high',
        title: 'API-Abuse erkannt',
        description: `${countVal} Requests/Minute von IP ${ip}`,
        triggerValue: countVal,
        thresholdValue: 100,
        autoAction: 'blocked',
        evidence: { ip, requestsPerMinute: countVal }
      });
    }
  }

  private async createAnomaly(params: {
    userId?: number;
    type: string;
    severity: 'info' | 'warning' | 'high' | 'critical';
    title: string;
    description: string;
    triggerValue: number;
    thresholdValue: number;
    autoAction: string;
    evidence: Record<string, unknown>;
  }): Promise<void> {

    const whereConditions = [
      eq(anomalyEvents.anomalyType, params.type),
      eq(anomalyEvents.status, 'open'),
      sql`${anomalyEvents.createdAt} >= ${new Date(Date.now() - 3600000).toISOString()}`
    ];
    if (params.userId) {
      whereConditions.push(eq(anomalyEvents.userId, params.userId));
    }

    const [existing] = await db.select()
      .from(anomalyEvents)
      .where(and(...whereConditions));

    if (existing) return;

    const inserted = await db.insert(anomalyEvents).values({
      userId: params.userId,
      anomalyType: params.type,
      severity: params.severity,
      title: params.title,
      description: params.description,
      evidence: JSON.stringify(params.evidence),
      triggerValue: params.triggerValue,
      thresholdValue: params.thresholdValue,
      autoAction: params.autoAction,
      status: 'open',
    }).returning({ id: anomalyEvents.id });

    if (params.severity === 'critical') {
      alertService.fire({
        severity: params.severity as any,
        title: params.title,
        description: params.description,
        metadata: { userId: params.userId, anomalyId: inserted[0].id }
      }).catch(err => console.error("Alert fire failed:", err));
    }

    // Auto-Punishment Engine evaluieren (fire-and-forget)
    autoPunishmentEngine.evaluate({
      id: inserted[0].id,
      userId: params.userId,
      anomalyType: params.type,
      severity: params.severity,
      evidence: params.evidence || {},
      ipAddress: (this as any).currentRequest?.ip || (this as any).currentRequest?.socket?.remoteAddress,
      deviceFingerprint: (this as any).currentRequest?.deviceFingerprint,
    }).catch(err => console.error('[AutoPunishment] Evaluation error:', err));
  }
}

export const anomalyDetector = new AnomalyDetector();
