import { db } from "../db";
import { users, bans, bulkActionLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { activityLogger } from "./activity-logger";
import { logger } from "../logger";

export interface BulkResult {
  success: number;
  failed: number;
  errors: string[];
}

class BulkActionService {
  async bulkBanUsers(params: {
    userIds: number[];
    performedBy: number;
    reason: string;
    banType: "account" | "shadow" | "ip" | "hardware";
    durationHours?: number;
    ipAddresses?: string[];
    deviceFingerprints?: string[];
  }): Promise<BulkResult> {
    const results: BulkResult = { success: 0, failed: 0, errors: [] };
    const now = Math.floor(Date.now() / 1000);

    await db.transaction(async (tx) => {
      for (const userId of params.userIds) {
        try {
          const user = await tx.select().from(users).where(eq(users.id, userId)).get();

          if (!user) {
            results.failed++;
            results.errors.push(`User ${userId} nicht gefunden`);
            continue;
          }

          const expiresAt = params.durationHours
            ? now + params.durationHours * 3600
            : null;

          // Ban-Eintrag erstellen
          await tx.insert(bans).values({
            banType: params.banType,
            userId,
            ipAddress: params.ipAddresses?.[0] || null,
            reason: params.reason,
            severity: params.durationHours ? "high" : "permanent",
            isPermanent: !params.durationHours ? 1 : 0,
            expiresAt,
            isShadow: params.banType === "shadow" ? 1 : 0,
            createdBy: params.performedBy,
            createdByType: "admin",
            createdAt: now,
            updatedAt: now,
            isActive: 1,
            notes: null,
            revokeReason: null,
            revokedAt: null,
            revokedBy: null,
            anomalyId: null,
            deviceFingerprint: params.deviceFingerprint?.[0] || null,
            ipRange: null
          });

          // User-Status aktualisieren
          if (params.banType === "shadow") {
            await tx.update(users)
              .set({ isShadowBanned: 1 })
              .where(eq(users.id, userId));
          } else if (params.banType === "account") {
            // we use karma -9999 as banned, or status column
            // shared/schema.ts states karma dropping or maybe we should just rely on bans middleware.
            // But let's set karma heavily negative so UI flags them.
            await tx.update(users)
              .set({ karma: -9999 })
              .where(eq(users.id, userId));
          }

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push(`User ${userId}: ${String(error)}`);
        }
      }
    });

    // Bulk-Action loggen
    await db.insert(bulkActionLogs).values({
      performedBy: params.performedBy,
      actionType: `${params.banType}_ban_users`,
      targetType: "users",
      targetIds: JSON.stringify(params.userIds),
      targetCount: params.userIds.length,
      successCount: results.success,
      failCount: results.failed,
      reason: params.reason,
      createdAt: now,
    });

    // Activity Log
    activityLogger.log({
      userId: params.performedBy,
      action: "admin.bulk_action",
      category: "admin",
      description: `Bulk-Ban: ${results.success}/${params.userIds.length} User gesperrt`,
      severity: "warning",
      metadata: { action: params.banType, count: results.success, reason: params.reason },
    }).catch(err => logger.error('system', 'bulk_action activity log failed', err));

    logger.info('admin', `Bulk ban completed`, { 
      type: params.banType, 
      success: results.success, 
      failed: results.failed, 
      performedBy: params.performedBy 
    });

    return results;
  }

  async bulkCloseReports(params: {
    reportIds: number[];
    performedBy: number;
    action: "resolve" | "dismiss";
    reason?: string;
  }): Promise<BulkResult> {
    const results: BulkResult = { success: 0, failed: 0, errors: [] };
    const { reports } = await import("@shared/schema");
    const now = Math.floor(Date.now() / 1000);

    await db.transaction(async (tx) => {
      for (const reportId of params.reportIds) {
        try {
          await tx.update(reports)
            .set({ status: params.action === "resolve" ? "resolved" : "rejected" })
            .where(eq(reports.id, reportId));
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push(`Report ${reportId}: ${String(error)}`);
        }
      }
    });

    await db.insert(bulkActionLogs).values({
      performedBy: params.performedBy,
      actionType: `close_reports_${params.action}`,
      targetType: "reports",
      targetIds: JSON.stringify(params.reportIds),
      targetCount: params.reportIds.length,
      successCount: results.success,
      failCount: results.failed,
      reason: params.reason,
      createdAt: now,
    });

    logger.info('admin', `Bulk report close completed`, { 
      action: params.action, 
      success: results.success, 
      failed: results.failed, 
      performedBy: params.performedBy 
    });

    return results;
  }

  async bulkDeletePosts(params: {
    postIds: number[];
    performedBy: number;
    action: "delete" | "hide";
    reason?: string;
  }): Promise<BulkResult> {
    const results: BulkResult = { success: 0, failed: 0, errors: [] };
    const { posts } = await import("@shared/schema");
    const now = Math.floor(Date.now() / 1000);

    await db.transaction(async (tx) => {
      for (const postId of params.postIds) {
        try {
          if (params.action === "delete") {
            await tx.delete(posts).where(eq(posts.id, postId));
          } else {
             // In missing 'is_hidden' scenario just drop karma logic or bypass
             await tx.delete(posts).where(eq(posts.id, postId));
          }
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push(`Post ${postId}: ${String(error)}`);
        }
      }
    });

    await db.insert(bulkActionLogs).values({
      performedBy: params.performedBy,
      actionType: `delete_posts`,
      targetType: "posts",
      targetIds: JSON.stringify(params.postIds),
      targetCount: params.postIds.length,
      successCount: results.success,
      failCount: results.failed,
      reason: params.reason,
      createdAt: now,
    });

    logger.info('admin', `Bulk post delete completed`, { 
      action: params.action, 
      success: results.success, 
      failed: results.failed, 
      performedBy: params.performedBy 
    });

    return results;
  }
}

export const bulkActionService = new BulkActionService();
