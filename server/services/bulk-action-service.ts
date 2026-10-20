import { db } from "../db";
import { users, bans, bulkActionLogs, reports, posts } from "@shared/schema";
import { and, eq, gt, inArray, isNotNull, lte, or } from "drizzle-orm";
import { activityLogger } from "./activity-logger";
import { logger } from "../logger";

export interface BulkResult {
  success: number;
  failed: number;
  /** One entry per id that was not processed: "<Kind> <id>: <reason>" (never database error texts). */
  errors: string[];
}

type Performer = { id: number; role: string };

/** An active ban: not revoked and either permanent or not yet expired (same rule as middleware/ban-check.ts). */
export const activeBanCondition = () =>
  and(eq(bans.isActive, 1), or(eq(bans.isPermanent, 1), gt(bans.expiresAt, new Date())));

/**
 * Bans are state of their own (the bans table, enforced by middleware/ban-check.ts and the login); karma is
 * never touched. Lifting a ban only clears the shadow-ban flag, and only when no other active shadow ban
 * of that user remains.
 */
export async function liftUserBanEffects(ban: { userId: number | null; banType: string }) {
  if (!ban.userId || ban.banType !== "shadow") return;
  const stillBanned = await db.select({ id: bans.id }).from(bans)
    .where(and(eq(bans.userId, ban.userId), eq(bans.banType, "shadow"), activeBanCondition())).limit(1);
  if (stillBanned.length > 0) return;
  await db.update(users).set({ isShadowBanned: 0 }).where(eq(users.id, ban.userId));
}

/**
 * Temporary bans end at their end date: marks expired bans inactive and lifts the shadow-ban flag they set.
 * Runs periodically (startBanExpirySweep); account/IP/device bans are already ignored by ban-check once expired.
 */
export async function expireBans(): Promise<number> {
  const expired = await db.update(bans)
    .set({ isActive: 0, updatedAt: new Date() })
    .where(and(eq(bans.isActive, 1), eq(bans.isPermanent, 0), isNotNull(bans.expiresAt), lte(bans.expiresAt, new Date())))
    .returning();
  for (const ban of expired) await liftUserBanEffects(ban);
  return expired.length;
}

let sweepTimer: NodeJS.Timeout | null = null;
export function startBanExpirySweep(intervalMs = 5 * 60 * 1000) {
  if (sweepTimer) return;
  const run = () => expireBans().catch((err) => logger.error("security", "ban expiry sweep failed", err));
  sweepTimer = setInterval(run, intervalMs);
  sweepTimer.unref?.();
  setTimeout(run, 10_000).unref?.();
}

class BulkActionService {
  async bulkBanUsers(params: {
    userIds: number[];
    performedBy: Performer;
    reason: string;
    banType: "account" | "shadow";
    durationHours?: number | null;
  }): Promise<BulkResult> {
    const results: BulkResult = { success: 0, failed: 0, errors: [] };
    const fail = (id: number, why: string) => { results.failed++; results.errors.push(`User ${id}: ${why}`); };

    for (const userId of params.userIds) {
      try {
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) { fail(userId, "not found"); continue; }
        if (user.id === params.performedBy.id) { fail(userId, "you cannot ban yourself"); continue; }
        if (user.role === "owner") { fail(userId, "owners cannot be banned"); continue; }

        const now = new Date();
        const expiresAt = params.durationHours ? new Date(now.getTime() + params.durationHours * 3600 * 1000) : null;
        await db.insert(bans).values({
          banType: params.banType,
          userId,
          reason: params.reason,
          severity: params.durationHours ? "high" : "permanent",
          isPermanent: params.durationHours ? 0 : 1,
          expiresAt,
          isShadow: params.banType === "shadow" ? 1 : 0,
          createdBy: params.performedBy.id,
          createdByType: "admin",
          createdAt: now,
          updatedAt: now,
          isActive: 1,
        });

        if (params.banType === "shadow") {
          await db.update(users).set({ isShadowBanned: 1 }).where(eq(users.id, userId));
        }
        results.success++;
      } catch (error) {
        logger.error("security", "bulk ban failed for one user", error, { userId });
        fail(userId, "could not be banned");
      }
    }

    await this.logBulk(params.performedBy.id, `${params.banType}_ban_users`, "users", params.userIds, results, params.reason);
    activityLogger.log({
      userId: params.performedBy.id,
      action: "admin.bulk_action",
      category: "admin",
      description: `Bulk-Ban: ${results.success}/${params.userIds.length} User gesperrt`,
      targetType: "User",
      targetId: params.userIds.join(",").slice(0, 500),
      severity: "warning",
      metadata: { action: params.banType, count: results.success, reason: params.reason },
    }).catch(err => logger.error('system', 'bulk_action activity log failed', err));

    return results;
  }

  /** Revokes the active account and shadow bans of the given users. */
  async bulkUnbanUsers(params: { userIds: number[]; performedBy: Performer; reason: string }): Promise<BulkResult> {
    const results: BulkResult = { success: 0, failed: 0, errors: [] };
    for (const userId of params.userIds) {
      try {
        const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
        if (!user) { results.failed++; results.errors.push(`User ${userId}: not found`); continue; }
        const now = new Date();
        const revoked = await db.update(bans)
          .set({ isActive: 0, revokedBy: params.performedBy.id, revokedAt: now, revokeReason: params.reason, updatedAt: now })
          .where(and(eq(bans.userId, userId), eq(bans.isActive, 1), or(eq(bans.banType, "account"), eq(bans.banType, "shadow"))))
          .returning();
        for (const ban of revoked) await liftUserBanEffects(ban);
        results.success++;
      } catch (error) {
        logger.error("security", "bulk unban failed for one user", error, { userId });
        results.failed++;
        results.errors.push(`User ${userId}: could not be unbanned`);
      }
    }
    await this.logBulk(params.performedBy.id, "unban_users", "users", params.userIds, results, params.reason);
    return results;
  }

  async bulkCloseReports(params: {
    reportIds: number[];
    performedBy: Performer;
    action: "resolve" | "reject" | "dismiss";
    reason?: string;
  }): Promise<BulkResult> {
    const results: BulkResult = { success: 0, failed: 0, errors: [] };
    const status = params.action === "resolve" ? "resolved" : "rejected";

    for (const reportId of params.reportIds) {
      try {
        const [report] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
        if (!report) { results.failed++; results.errors.push(`Report ${reportId}: not found`); continue; }
        const now = new Date();
        await db.update(reports).set({
          status,
          resolvedBy: params.performedBy.id,
          resolvedAt: now,
          resolutionTimeSeconds: report.createdAt ? Math.max(0, Math.floor((now.getTime() - new Date(report.createdAt).getTime()) / 1000)) : null,
        }).where(eq(reports.id, reportId));
        results.success++;
      } catch (error) {
        logger.error("security", "bulk report close failed for one report", error, { reportId });
        results.failed++;
        results.errors.push(`Report ${reportId}: could not be updated`);
      }
    }

    await this.logBulk(params.performedBy.id, `close_reports_${params.action}`, "reports", params.reportIds, results, params.reason);
    return results;
  }

  /** Permanently deletes posts. There is no "hidden" state for posts, so no "hide" action is offered. */
  async bulkDeletePosts(params: { postIds: number[]; performedBy: Performer; reason?: string }): Promise<BulkResult> {
    const results: BulkResult = { success: 0, failed: 0, errors: [] };
    const found: Array<{ id: number; authorId: number }> = params.postIds.length
      ? await db.select({ id: posts.id, authorId: posts.authorId }).from(posts).where(inArray(posts.id, params.postIds))
      : [];
    const authorIds: number[] = Array.from(new Set(found.map((p) => p.authorId)));
    const ownerRows: Array<{ id: number }> = authorIds.length
      ? await db.select({ id: users.id }).from(users).where(and(inArray(users.id, authorIds), eq(users.role, "owner")))
      : [];
    const owners = new Set(ownerRows.map((u) => u.id));
    const byId = new Map(found.map((p) => [p.id, p]));

    for (const postId of params.postIds) {
      const post = byId.get(postId);
      if (!post) { results.failed++; results.errors.push(`Post ${postId}: not found`); continue; }
      if (owners.has(post.authorId) && params.performedBy.role !== "owner") {
        results.failed++; results.errors.push(`Post ${postId}: posts of owners cannot be deleted`); continue;
      }
      try {
        await db.delete(posts).where(eq(posts.id, postId));
        results.success++;
      } catch (error) {
        logger.error("security", "bulk post delete failed for one post", error, { postId });
        results.failed++;
        results.errors.push(`Post ${postId}: could not be deleted`);
      }
    }

    await this.logBulk(params.performedBy.id, "delete_posts", "posts", params.postIds, results, params.reason);
    return results;
  }

  private async logBulk(performedBy: number, actionType: string, targetType: string, ids: number[], results: BulkResult, reason?: string) {
    try {
      await db.insert(bulkActionLogs).values({
        performedBy,
        actionType,
        targetType,
        targetIds: JSON.stringify(ids),
        targetCount: ids.length,
        successCount: results.success,
        failCount: results.failed,
        reason,
        createdAt: new Date(),
      });
    } catch (error) {
      logger.error("security", "bulk action log failed", error);
    }
    logger.info('security', `Bulk action completed`, { actionType, success: results.success, failed: results.failed, performedBy });
  }
}

export const bulkActionService = new BulkActionService();
