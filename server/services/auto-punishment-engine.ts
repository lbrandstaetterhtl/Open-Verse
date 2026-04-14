import { db } from "../db";
import { users, bans, autoPunishmentRules, autoPunishmentExecutions, anomalyEvents } from "@shared/schema";
import { eq, and, gte, count } from "drizzle-orm";
import { activityLogger } from "./activity-logger";
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
  async evaluate(anomaly: AnomalyContext): Promise<void> {
    if (!anomaly.userId) return; // Nur User-bezogene Anomalien
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
    const severityOrder = { warning: 0, info: 0, high: 1, critical: 2 };
    const anomalySeverity = severityOrder[anomaly.severity as keyof typeof severityOrder] ?? 0;
    const thresholdSeverity = severityOrder[rule.severityThreshold as keyof typeof severityOrder] ?? 1;

    if (anomalySeverity < thresholdSeverity) return;

    const now = Math.floor(Date.now() / 1000);

    const recentExecution = await db.select()
      .from(autoPunishmentExecutions)
      .where(and(
        eq(autoPunishmentExecutions.ruleId, rule.id),
        eq(autoPunishmentExecutions.userId, anomaly.userId!),
        gte(autoPunishmentExecutions.createdAt, now - (rule.cooldownHours ?? 1) * 3600)
      ))
      .get();

    if (recentExecution) return; 

    if (rule.escalateAfterCount && rule.escalateAfterCount > 1) {
      const recentAnomalies = await db.select({ count: count() })
        .from(anomalyEvents)
        .where(and(
          eq(anomalyEvents.userId, anomaly.userId!),
          eq(anomalyEvents.anomalyType, anomaly.anomalyType),
          gte(anomalyEvents.createdAt, now - (rule.escalationWindowHours ?? 24) * 3600)
        ))
        .get();

      if ((recentAnomalies?.count ?? 0) < rule.escalateAfterCount) return;
    }

    await this.executeAction(rule, anomaly);
  }

  private async executeAction(
    rule: typeof autoPunishmentRules.$inferSelect,
    anomaly: AnomalyContext
  ): Promise<void> {
    console.log(`[AutoPunishment] Executing rule "${rule.name}" for user ${anomaly.userId}: ${rule.action}`);

    let banId: number | undefined;
    let success = true;
    let errorMessage: string | undefined = undefined;
    const now = Math.floor(Date.now() / 1000);

    try {
      const expiresAt = rule.actionDurationHours
        ? now + (rule.actionDurationHours * 3600)
        : null;

      switch (rule.action) {
        case 'warn':
          await notificationService.createNotification({
            userId: anomaly.userId!,
            type: "system_warning",
            title: "Account Warnung",
            message: rule.actionReason,
          });
          break;

        case 'freeze':
          await db.update(users)
            .set({
              isFrozen: 1,
              frozenUntil: expiresAt,
              freezeReason: rule.actionReason,
            })
            .where(eq(users.id, anomaly.userId!));

          activityLogger.log({
            userId: anomaly.userId!,
            action: 'admin.user_ban',
            category: 'admin',
            description: `[AUTO] Account eingefroren: ${rule.actionReason}`,
            severity: 'warning',
            metadata: { rule: rule.name, anomalyType: anomaly.anomalyType, auto: true }
          }).catch(() => {});
          break;

        case 'shadow_ban':
          const shadowBan = await db.insert(bans).values({
            banType: 'shadow',
            userId: anomaly.userId,
            ipAddress: anomaly.ipAddress || null,
            reason: `[AUTO] ${rule.actionReason}`,
            severity: 'medium',
            isPermanent: !rule.actionDurationHours ? 1 : 0,
            expiresAt,
            isShadow: 1,
            createdByType: 'auto_punishment',
            anomalyId: anomaly.id || null,
            createdAt: now,
            updatedAt: now
          }).returning();

          await db.update(users)
            .set({ isShadowBanned: 1 })
            .where(eq(users.id, anomaly.userId!));

          banId = shadowBan[0]?.id;
          break;

        case 'temp_ban':
        case 'permanent_ban':
          const accountBan = await db.insert(bans).values({
            banType: 'account',
            userId: anomaly.userId,
            ipAddress: anomaly.ipAddress || null,
            reason: `[AUTO] ${rule.actionReason}`,
            severity: rule.action === 'permanent_ban' ? 'permanent' : 'high',
            isPermanent: rule.action === 'permanent_ban' ? 1 : 0,
            expiresAt,
            isShadow: 0,
            createdByType: 'auto_punishment',
            anomalyId: anomaly.id || null,
            createdAt: now,
            updatedAt: now
          }).returning();

          await db.update(users)
            .set({ karma: -9999 })
            .where(eq(users.id, anomaly.userId!));

          banId = accountBan[0]?.id;

          activityLogger.log({
            userId: anomaly.userId!,
            action: 'admin.user_ban',
            category: 'security',
            description: `[AUTO] Account gesperrt: ${rule.actionReason}`,
            severity: 'critical',
            metadata: { rule: rule.name, auto: true, permanent: rule.action === 'permanent_ban' }
          }).catch(() => {});
          break;

        case 'ip_ban':
          if (anomaly.ipAddress) {
            const ipBan = await db.insert(bans).values({
              banType: 'ip',
              userId: anomaly.userId,
              ipAddress: anomaly.ipAddress,
              reason: `[AUTO] ${rule.actionReason}`,
              severity: 'high',
              isPermanent: !rule.actionDurationHours ? 1 : 0,
              expiresAt,
              createdByType: 'auto_punishment',
              anomalyId: anomaly.id || null,
              createdAt: now,
              updatedAt: now
            }).returning();
            banId = ipBan[0]?.id;
          }
          break;

        case 'hardware_ban':
          if (anomaly.deviceFingerprint) {
            const hwBan = await db.insert(bans).values({
              banType: 'hardware',
              userId: anomaly.userId,
              deviceFingerprint: anomaly.deviceFingerprint,
              reason: `[AUTO] ${rule.actionReason}`,
              severity: 'high',
              isPermanent: !rule.actionDurationHours ? 1 : 0,
              expiresAt,
              createdByType: 'auto_punishment',
              anomalyId: anomaly.id || null,
              createdAt: now,
              updatedAt: now
            }).returning();
            banId = hwBan[0]?.id;
          }
          break;
      }

      if (anomaly.id) {
        await db.update(anomalyEvents)
          .set({
            status: 'resolved',
            autoAction: rule.action,
            updatedAt: now,
          })
          .where(eq(anomalyEvents.id, anomaly.id));
      }

      await alertService.fire({
        severity: 'warning',
        title: `Auto-Punishment ausgeführt: ${rule.action}`,
        description: `Regel "${rule.name}" hat automatisch "${rule.action}" für User ${anomaly.userId} ausgeführt. Anomalie: ${anomaly.anomalyType}`,
      });

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
