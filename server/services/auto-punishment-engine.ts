import { db } from "../db";
import { users, bans, autoPunishmentRules, autoPunishmentExecutions, anomalyEvents } from "@shared/schema";
import { eq, and, gte, count, sql, isNull } from "drizzle-orm";
import { notificationService } from "./notification-service";
import { alertService } from "./alert-service";
import { apLogger } from "../logger/service-loggers";
import { logger } from "../logger";

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
      apLogger.ruleEvaluated('WHITELIST', anomaly.userId, 'skip', 'User is whitelisted');
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
      logger.error('security', 'AutoPunishment evaluation failed', error, { anomalyType: anomaly.anomalyType, userId: anomaly.userId });
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
      apLogger.ruleEvaluated(rule.name, anomaly.userId!, 'skip', `Severity ${anomaly.severity} < ${rule.severityThreshold}`);
      return;
    }

    const now = Math.floor(Date.now() / 1000);

    // APE-FIX [BUG-011]: Robust Cooldown Check
    const [recentExecution] = await db.select()
      .from(autoPunishmentExecutions)
      .where(and(
        eq(autoPunishmentExecutions.ruleId, rule.id),
        eq(autoPunishmentExecutions.userId, anomaly.userId!),
        gte(autoPunishmentExecutions.createdAt, new Date(Date.now() - (rule.cooldownHours ?? 1) * 3600 * 1000))
      ))
      .limit(1);

    if (recentExecution) {
      apLogger.ruleEvaluated(rule.name, anomaly.userId!, 'skip', `Cooldown active (last: ${recentExecution.createdAt})`);
      return; 
    }

    // APE-FIX [BUG-007]: Escalation Safety Puffer
    if (rule.escalateAfterCount && rule.escalateAfterCount > 1) {
      const result = await db.select({ count: count() })
        .from(anomalyEvents)
        .where(and(
          eq(anomalyEvents.userId, anomaly.userId!),
          eq(anomalyEvents.anomalyType, anomaly.anomalyType),
          gte(anomalyEvents.createdAt, new Date(Date.now() - (rule.escalationWindowHours ?? 24) * 3600 * 1000))
        )).execute();

      const recentAnomalies = result[0]?.count ?? 0;
      if (recentAnomalies < rule.escalateAfterCount) {
        apLogger.ruleEvaluated(rule.name, anomaly.userId!, 'skip', `Only ${recentAnomalies}/${rule.escalateAfterCount} anomalies in window`);
        return;
      }
    }

    // APE-FIX [DRY-001]: Dry-Run Mode
    if (this.DRY_RUN) {
      apLogger.dryRun(rule.name, rule.action, anomaly.userId!);
      return;
    }

    // APE-FIX [MAT-001]: Account Maturity Check
    if (['freeze', 'temp_ban', 'permanent_ban'].includes(rule.action)) {
      const isMature = await this.isAccountMatureEnough(anomaly.userId!);
      if (!isMature) {
        apLogger.ruleEvaluated(rule.name, anomaly.userId!, 'skip', 'Account too new (<24h), downgrading to warn');
        await this.executeAction({ ...rule, action: 'warn', actionReason: `[MATURITY-DOWNGRADE] ${rule.actionReason}` }, anomaly);
        return;
      }
    }

    apLogger.ruleEvaluated(rule.name, anomaly.userId!, 'execute', `Action: ${rule.action}`);
    await this.executeAction(rule, anomaly);
  }

  private async isAccountMatureEnough(userId: number): Promise<boolean> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return false;
    const now = Date.now();
    const createdAt = user.createdAt instanceof Date ? user.createdAt.getTime() : Number(user.createdAt) * 1000;
    return (now - createdAt) >= 86400 * 1000; // 24 hours
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
      const expiresAtDate = rule.actionDurationHours ? new Date(Date.now() + (rule.actionDurationHours * 3600 * 1000)) : null;

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
            isPermanent: expiresAtDate ? 0 : 1,
            expiresAt: expiresAtDate,
            isShadow: 1,
            createdByType: 'auto_punishment',
            anomalyId: anomaly.id || null,
            createdAt: new Date(),
            updatedAt: new Date()
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
            expiresAt: expiresAtDate,
            createdByType: 'auto_punishment',
            anomalyId: anomaly.id || null,
            createdAt: new Date(),
            updatedAt: new Date()
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
              expiresAt: expiresAtDate,
              createdByType: 'auto_punishment',
              anomalyId: anomaly.id || null,
              createdAt: new Date(),
              updatedAt: new Date()
            }).returning();
            banId = ipBan.id;
          }
          break;
      }

      if (anomaly.id) {
        await db.update(anomalyEvents)
          .set({ status: 'resolved', autoAction: rule.action, updatedAt: new Date() })
          .where(eq(anomalyEvents.id, anomaly.id));
      }

    } catch (error) {
      success = false;
      errorMessage = String(error);
      logger.error('security', `AutoPunishment action execution failed: ${rule.action}`, error, { userId: anomaly.userId, ruleId: rule.id });
    }

    apLogger.actionExecuted(rule.name, rule.action, anomaly.userId!, success);

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
      createdAt: new Date(),
    });
  }
}

export const autoPunishmentEngine = new AutoPunishmentEngine();
