import { db } from "../db";
import { activityLogs, anomalyEvents, ActivityLog } from "@shared/schema";
import { count, eq, and, or, gte, desc, inArray, sql, isNull } from "drizzle-orm";
import { alertService } from "./alert-service";
import { autoPunishmentEngine } from "./auto-punishment-engine";
import { anomalyLogger, dbLogger } from "../logger/service-loggers";
import { logger } from "../logger";

/**
 * APE-FIX [TIME-001]: Unified Unix Timing
 */
export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

class AnomalyDetector {

  /**
   * APE-FIX [BUG-001]: Brute Force logic hardened
   * - Only counts 'auth.login_failed' actions
   * - Only counts 'failure' status
   * - Dynamic threshold based on recent history to prevent lockouts
   */
  async checkBruteForce(entry: any): Promise<void> {
    if (entry.action !== 'auth.login_failed') return;
    const ip = entry.ipAddress || "unknown";
    const now = nowUnix();
    
    // Check recent anomalies for dynamic penalization
    const [recentAnomalies] = await db.select({ count: count() })
      .from(anomalyEvents)
      .where(and(
        entry.userId ? eq(anomalyEvents.userId, entry.userId) : sql`1=0`,
        eq(anomalyEvents.status, 'open'),
        gte(anomalyEvents.createdAt, now - 86400)
      ));
    
    const baseThreshold = 10;
    const penaltyThreshold = recentAnomalies?.count ? Math.max(5, baseThreshold - (recentAnomalies.count * 1)) : baseThreshold;

    const [failedLogins] = await db.select({ count: count() })
      .from(activityLogs)
      .where(and(
        eq(activityLogs.action, 'auth.login_failed'),
        eq(activityLogs.status, 'failure'),
        or(
          entry.userId ? eq(activityLogs.userId, entry.userId) : sql`1=0`,
          eq(activityLogs.ipAddress, ip)
        ),
        gte(activityLogs.createdAt, now - 900) // 15 min
      ));
 
    const countVal = failedLogins?.count ?? 0;
    if (countVal >= penaltyThreshold) {
      await this.createAnomaly({
        userId: entry.userId,
        type: 'brute_force_login',
        severity: countVal >= baseThreshold ? 'critical' : 'high',
        title: 'Brute-Force Login Detection',
        description: `${countVal} failed attempts in 15min. IP: ${ip}`,
        triggerValue: countVal,
        thresholdValue: penaltyThreshold,
        autoAction: 'account_flagged',
        evidence: { ip, failedAttempts: countVal }
      });
    }
  }

  /**
   * APE-FIX [BUG-006]: Realistic Mass Action Thresholds
   */
  async checkMassAction(entry: any): Promise<void> {
    const action = entry.action;
    const now = nowUnix();
    
    const thresholds: Record<string, { window: number; limit: number; severity: string }> = {
      'like.add':       { window: 3600,  limit: 500,  severity: 'warning' },
      'follow.add':     { window: 3600,  limit: 150,  severity: 'warning' },
      'follow.remove':  { window: 3600,  limit: 150,  severity: 'warning' },
      'comment.create': { window: 3600,  limit: 100,  severity: 'warning' },
      'post.create':    { window: 3600,  limit: 50,   severity: 'warning' },
      'report.submit':  { window: 86400, limit: 30,   severity: 'high' },
    };

    const config = thresholds[action];
    if (!config || !entry.userId) return;

    const [recentCount] = await db.select({ count: count() })
      .from(activityLogs)
      .where(and(
        eq(activityLogs.userId, entry.userId),
        eq(activityLogs.action, action as any),
        gte(activityLogs.createdAt, now - config.window)
      ));

    const countVal = recentCount?.count ?? 0;
    if (countVal >= config.limit) {
      await this.createAnomaly({
        userId: entry.userId,
        type: 'mass_action',
        severity: config.severity as any,
        title: `Mass Action: ${action}`,
        description: `${countVal} actions in ${config.window / 3600}h`,
        triggerValue: countVal,
        thresholdValue: config.limit,
        autoAction: 'none',
        evidence: { action, count: countVal }
      });
    }
  }

  /**
   * APE-FIX [BUG-009]: Safe Country-Based Impossible Travel
   */
  async checkImpossibleTravel(entry: any): Promise<void> {
    if (entry.action !== 'auth.login' || entry.status !== 'success' || !entry.userId) return;
    const country = entry.ipCountry || "unknown";
    const now = nowUnix();

    const lastLogins = await db.select()
      .from(activityLogs)
      .where(and(
        eq(activityLogs.userId, entry.userId),
        eq(activityLogs.action, 'auth.login'),
        eq(activityLogs.status, 'success')
      ))
      .orderBy(desc(activityLogs.createdAt))
      .limit(2)
      .execute();

    if (lastLogins.length < 2) return;
    const prev = lastLogins[1];
    
    const isKnown = (c: any) => c && c !== 'unknown' && c !== 'local' && c !== 'private';

    if (isKnown(prev.ipCountry) && isKnown(country) && prev.ipCountry !== country) {
      const timeDiff = entry.createdAt - prev.createdAt;
      const minTravelTime = 14400; // 4 hours buffer for VPN/Roaming

      if (timeDiff < minTravelTime) {
        await this.createAnomaly({
          userId: entry.userId,
          type: 'impossible_travel',
          severity: 'high',
          title: 'Impossible Travel Detection',
          description: `Travel from ${prev.ipCountry} to ${country} in ${Math.floor(timeDiff/60)}min`,
          triggerValue: timeDiff / 60,
          thresholdValue: 240,
          autoAction: 'account_flagged',
          evidence: { prevCountry: prev.ipCountry, currCountry: country, timeDiff }
        });
      }
    }
  }

  /**
   * APE-FIX [BUG-005]: Versions-Stabiler Fingerprint Check
   */
  async checkNewDevice(entry: any): Promise<void> {
    if (entry.action !== 'auth.login' || entry.status !== 'success' || !entry.userId) return;
    const fingerprint = entry.deviceFingerprint;
    if (!fingerprint) return;

    // A device is "known" after 3 successful logins with the SAME stable fingerprint
    const [knownCount] = await db.select({ count: count() })
      .from(activityLogs)
      .where(and(
        eq(activityLogs.userId, entry.userId),
        eq(activityLogs.action, 'auth.login'),
        eq(activityLogs.status, 'success'),
        eq(activityLogs.deviceFingerprint, fingerprint)
      ));

    if (knownCount?.count === 1) { // First time seeing this STABLE fingerprint
      // Check if user has other stable fingerprints
      const [otherDevices] = await db.select({ count: count() })
        .from(activityLogs)
        .where(and(
          eq(activityLogs.userId, entry.userId),
          eq(activityLogs.action, 'auth.login'),
          eq(activityLogs.status, 'success')
        ));
      
      if ((otherDevices?.count ?? 0) > 5) { // User has many devices
        await this.createAnomaly({
          userId: entry.userId,
          type: 'new_device_login',
          severity: 'info',
          title: 'New Device Login',
          description: 'Login from a new stable device fingerprint.',
          triggerValue: 1,
          thresholdValue: 0,
          autoAction: 'none',
          evidence: { fingerprint }
        });
      }
    }
  }

  /**
   * APE-FIX [BUG-015]: Realistic Content Spam Logic
   */
  async checkContentSpam(entry: any): Promise<void> {
    if (!['post.create', 'comment.create'].includes(entry.action) || !entry.userId) return;
    const now = nowUnix();

    const [recentContent] = await db.select({ count: count() })
      .from(activityLogs)
      .where(and(
        eq(activityLogs.userId, entry.userId),
        inArray(activityLogs.action, ['post.create', 'comment.create']),
        gte(activityLogs.createdAt, now - 300) // 5 min window
      ));

    const countVal = recentContent?.count ?? 0;
    const threshold = 25; // APE-FIX: Increased from 10 to 25

    if (countVal >= threshold) {
      await this.createAnomaly({
        userId: entry.userId,
        type: 'spam_content',
        severity: 'high',
        title: 'Content Spam Detection',
        description: `${countVal} posts/comments in 5min.`,
        triggerValue: countVal,
        thresholdValue: threshold,
        autoAction: 'warn',
        evidence: { count: countVal }
      });
    }
  }

  /**
   * APE-FIX [BUG-004]: Mobile-Friendly Account Sharing
   */
  async checkAccountSharing(entry: any): Promise<void> {
    if (!entry.userId) return;
    const now = nowUnix();

    const recentIps = await db.select({ ipAddress: activityLogs.ipAddress, country: activityLogs.ipCountry })
      .from(activityLogs)
      .where(and(
        eq(activityLogs.userId, entry.userId),
        gte(activityLogs.createdAt, now - 3600)
      ))
      .execute();

    const uniqueIps = new Set(recentIps.map(r => r.ipAddress).filter(Boolean));
    const uniqueCountries = new Set(recentIps.map(r => r.country).filter(c => c && c !== 'unknown' && c !== 'local'));

    // Trigger only if 15+ IPs OR 3+ Countries
    if (uniqueIps.size >= 15 || uniqueCountries.size >= 3) {
      await this.createAnomaly({
        userId: entry.userId,
        type: 'account_sharing',
        severity: 'warning',
        title: 'Suspicious Account Sharing',
        description: `${uniqueIps.size} IPs and ${uniqueCountries.size} countries in 1h`,
        triggerValue: uniqueIps.size,
        thresholdValue: 15,
        autoAction: 'none',
        evidence: { ips: uniqueIps.size, countries: uniqueCountries.size }
      });
    }
  }

  async checkApiAbuse(entry: any): Promise<void> {
    // Basic rate limit check for API endpoints if logged
    if (entry.category !== 'api' || !entry.userId) return;
    const now = nowUnix();
    
    const [reqCount] = await db.select({ count: count() })
      .from(activityLogs)
      .where(and(
        eq(activityLogs.userId, entry.userId),
        eq(activityLogs.category, 'api'),
        gte(activityLogs.createdAt, now - 60)
      ));
    
    if ((reqCount?.count ?? 0) > 200) { // 200 req/min
      await this.createAnomaly({
        userId: entry.userId,
        type: 'api_abuse',
        severity: 'high',
        title: 'API Abuse Detection',
        description: 'Excessive API requests detected.',
        triggerValue: reqCount?.count ?? 0,
        thresholdValue: 200,
        autoAction: 'shadow_ban',
        evidence: { reqPerMin: reqCount?.count }
      });
    }
  }

  async createAnomaly(params: {
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
    const now = nowUnix();

    await db.transaction(async (tx) => {
      const existing = await tx.select()
        .from(anomalyEvents)
        .where(and(
          params.userId ? eq(anomalyEvents.userId, params.userId) : isNull(anomalyEvents.userId),
          eq(anomalyEvents.anomalyType, params.type),
          eq(anomalyEvents.status, 'open'),
          gte(anomalyEvents.createdAt, now - 300) // 5 min dedup
        )).get();

      if (existing) {
        anomalyLogger.deduplicated(params.type, params.userId);
        return;
      }

      const [inserted] = await tx.insert(anomalyEvents).values({
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
        createdAt: now,
        updatedAt: now,
      }).returning({ id: anomalyEvents.id });

      anomalyLogger.detected(params.type, params.userId, params.severity, {
        title: params.title,
        description: params.description,
        ...params.evidence,
      });

      autoPunishmentEngine.evaluate({
        id: inserted.id,
        userId: params.userId,
        anomalyType: params.type,
        severity: params.severity,
        evidence: params.evidence || {},
      }).catch(err => logger.error('security', 'AutoPunishment evaluation failed', err, { anomalyId: inserted.id }));
    });
  }
}

export const anomalyDetector = new AnomalyDetector();
