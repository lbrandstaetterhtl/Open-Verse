import { db } from "../db";
import { users, bans, autoPunishmentRules, autoPunishmentExecutions, anomalyEvents } from "@shared/schema";
import { eq, and, gte, count, sql, isNull } from "drizzle-orm";
import { notificationService } from "./notification-service";
import { alertService } from "./alert-service";

export interface AnomalyContext {
  id?: number;
  userId?: number | null;
  anomalyType: string;
  severity: string;
  evidence: Record<string, unknown>;
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
}

class AutoPunishmentEngine {
  // APE-FIX [DRY-001]: Safe Operational Configuration
  private readonly DRY_RUN = process.env.AUTO_PUNISHMENT_DRY_RUN === 'true';
  private readonly WHITELIST = (process.env.AUTO_PUNISHMENT_WHITELIST || '').split(',').map(Number).filter(n => !isNaN(n));

  async evaluate(anomaly: AnomalyContext): Promise<void> {
    if (!anomaly.userId) return;
    
    // APE-FIX [BUG-012]: Whitelist protection
    if (this.WHITELIST.includes(anomaly.userId)) {
      console.log(`[AutoPunishment] WHITELIST: Skipping protection for user ${anomaly.userId}`);
      return;
    }

    try {
      const rules = await db.select()
        .from(autoPunishmentRules)
        .where(and(
          eq(autoPunishmentRules.anomalyType, anomaly.anomalyType),
          eq(autoPunishmentRules.isActive, 1)
        ))
        .execute();

      for (const rule of rules) {
        await this.evaluateRule(rule, anomaly);
      }
    } catch (error) {
      console.error('[AutoPunishment] Evaluation failed:', error);
    }
  }

  private async evaluateRule(
    rule: typeof autoPunishmentRules.$inferSelect,
    anomaly: AnomalyContext
  ): Promise<void> {
    const logPrefix = `[AutoPunishment] Rule "${rule.name}" (${rule.id}):`;

    // APE-FIX [SEV-001]: High-Resolution Severity Comparison
    const severityOrder: Record<string, number> = {
      debug:    0,
      info:     1,
      warning:  2,
      high:     3,
      critical: 4,
    };
    
    const anomalySeverity = severityOrder[anomaly.severity] ?? 0;
    const thresholdSeverity = severityOrder[rule.severityThreshold] ?? 2;

    if (anomalySeverity < thresholdSeverity) {
      console.log(`${logPrefix} SKIP - severity ${anomaly.severity} (${anomalySeverity}) < threshold ${rule.severityThreshold} (${thresholdSeverity})`);
      return;
    }

    const now = Math.floor(Date.now() / 1000);

    // APE-FIX [BUG-011]: Robust Cooldown Check
    const recentExecution = await db.select()
      .from(autoPunishmentExecutions)
      .where(and(
        eq(autoPunishmentExecutions.ruleId, rule.id),
        eq(autoPunishmentExecutions.userId, anomaly.userId!),
        gte(autoPunishmentExecutions.createdAt, now - (rule.cooldownHours ?? 1) * 3600)
      ))
      .get();

    if (recentExecution) {
      console.log(`${logPrefix} SKIP - cooldown active, last execution ${recentExecution.createdAt}`);
      return; 
    }

    // APE-FIX [BUG-007]: Escalation Safety Puffer
    if (rule.escalateAfterCount && rule.escalateAfterCount > 1) {
      const result = await db.select({ count: count() })
        .from(anomalyEvents)
        .where(and(
          eq(anomalyEvents.userId, anomaly.userId!),
          eq(anomalyEvents.anomalyType, anomaly.anomalyType),
          gte(anomalyEvents.createdAt, now - (rule.escalationWindowHours ?? 24) * 3600)
        )).execute();

      const recentAnomalies = result[0]?.count ?? 0;
      if (recentAnomalies < rule.escalateAfterCount) {
        console.log(`${logPrefix} SKIP - only ${recentAnomalies}/${rule.escalateAfterCount} anomalies in window`);
        return;
      }
    }

    // APE-FIX [DRY-001]: Dry-Run Mode
    if (this.DRY_RUN) {
      console.log(`${logPrefix} DRY-RUN: Would execute ${rule.action} for user ${anomaly.userId}`);
      return;
    }

    // APE-FIX [MAT-001]: Account Maturity Check
    if (['freeze', 'temp_ban', 'permanent_ban'].includes(rule.action)) {
      const isMature = await this.isAccountMatureEnough(anomaly.userId!);
      if (!isMature) {
        console.log(`${logPrefix} MATURITY: Account too new (<24h), downgrading to warn`);
        await this.executeAction({ ...rule, action: 'warn', actionReason: `[MATURITY-DOWNGRADE] ${rule.actionReason}` }, anomaly);
        return;
      }
    }

    console.log(`${logPrefix} EXECUTING ${rule.action} for user ${anomaly.userId}`);
    await this.executeAction(rule, anomaly);
  }

  private async isAccountMatureEnough(userId: number): Promise<boolean> {
    const user = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return false;
    const now = Math.floor(Date.now() / 1000);
    return (now - user.createdAt) >= 86400; // 24 hours
  }

  private async executeAction(
    rule: typeof autoPunishmentRules.$inferSelect,
    anomaly: AnomalyContext
  ): Promise<void> {
    let banId: number | undefined;
    let success = true;
    let errorMessage: string | undefined;
    const now = Math.floor(Date.now() / 1000);

    try {
      const expiresAt = rule.actionDurationHours ? now + (rule.actionDurationHours * 3600) : null;

      switch (rule.action) {
        case 'warn':
          await notificationService.createNotification({
            userId: anomaly.userId!,
            type: "system_warning",
            title: "Account-Warnung",
            message: rule.actionReason,
          });
          break;

        case 'freeze':
          await db.update(users)
            .set({ isFrozen: 1, frozenUntil: expiresAt, freezeReason: rule.actionReason })
            .where(eq(users.id, anomaly.userId!));
          break;

        case 'shadow_ban':
          const [shadowBan] = await db.insert(bans).values({
            banType: 'shadow',
            userId: anomaly.userId,
            reason: rule.actionReason,
            severity: 'medium',
            isPermanent: expiresAt ? 0 : 1,
            expiresAt,
            isShadow: 1,
            createdByType: 'auto_punishment',
            anomalyId: anomaly.id || null,
            createdAt: now,
            updatedAt: now
          }).returning();
          await db.update(users).set({ isShadowBanned: 1 }).where(eq(users.id, anomaly.userId!));
          banId = shadowBan.id;
          break;

        case 'temp_ban':
        case 'permanent_ban':
          const [accountBan] = await db.insert(bans).values({
            banType: 'account',
            userId: anomaly.userId,
            reason: rule.actionReason,
            severity: rule.action === 'permanent_ban' ? 'permanent' : 'high',
            isPermanent: rule.action === 'permanent_ban' ? 1 : 0,
            expiresAt,
            createdByType: 'auto_punishment',
            anomalyId: anomaly.id || null,
            createdAt: now,
            updatedAt: now
          }).returning();
          await db.update(users).set({ karma: -1000 }).where(eq(users.id, anomaly.userId!));
          banId = accountBan.id;
          break;

        case 'ip_ban':
          if (anomaly.ipAddress) {
            const [ipBan] = await db.insert(bans).values({
              banType: 'ip',
              ipAddress: anomaly.ipAddress,
              reason: rule.actionReason,
              severity: 'high',
              expiresAt,
              createdByType: 'auto_punishment',
              anomalyId: anomaly.id || null,
              createdAt: now,
              updatedAt: now
            }).returning();
            banId = ipBan.id;
          }
          break;
      }

      if (anomaly.id) {
        await db.update(anomalyEvents)
          .set({ status: 'resolved', autoAction: rule.action, updatedAt: now })
          .where(eq(anomalyEvents.id, anomaly.id));
      }

    } catch (error) {
      success = false;
      errorMessage = String(error);
      console.error(`[AutoPunishment] Action failed:`, error);
    }

    await db.insert(autoPunishmentExecutions).values({
      ruleId: rule.id,
      ruleName: rule.name,
      anomalyId: anomaly.id || null,
      userId: anomaly.userId,
      banId: banId || null,
      actionTaken: rule.action,
      actionDetail: JSON.stringify({ reason: rule.actionReason }),
      success: success ? 1 : 0,
      errorMessage: errorMessage || null,
      createdAt: now,
    });
  }
}

export const autoPunishmentEngine = new AutoPunishmentEngine();
