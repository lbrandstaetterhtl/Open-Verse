import { Router } from "express";
import net from "node:net";
import { z } from "zod";
import { db } from "../db";
import { users, posts, reports, comments, activityLogs, adminSettings } from "@shared/schema";
import { adminUpdateUserSchema, adminUpdateReportSchema } from "@shared/schema";
import { eq, desc, count, sql, and, or, inArray, like } from "drizzle-orm";
import { activityLogger } from "../services/activity-logger";
import rateLimit from "express-rate-limit";
import { SettingsService } from "../services/settings";
import { bulkActionService, liftUserBanEffects, activeBanCondition, startBanExpirySweep } from "../services/bulk-action-service";
import { bans, autoPunishmentRules, autoPunishmentExecutions, insertAutoPunishmentRuleSchema } from "@shared/schema";
import { hasPermission, isAdmin, isOwner } from "../middleware/auth";
import { sanitizeUser } from "../storage";
import { parsePagination } from "../utils/pagination";
import { parseId, validateIdParams } from "../utils/params";
import { userHasPermission } from "../utils/permissions";
import { dbId, text, isPlainBody, queryString } from "../utils/admin-input";
import { checkGroupAssignment } from "./admin-groups";
import { logger } from "../logger";

import { sendValidationError, sendInternalError, isZodError } from "../utils/http-errors";
const router = Router();

// Every admin route requires an admin or owner; routes below add their specific permission on top.
router.use(isAdmin);
// Malformed ids ("abc", "-1", "1.5", > 2^31-1) are answered with 404 before any handler runs.
validateIdParams(router, ["id"]);
// Temporary bans end at their end date (marks them inactive and lifts shadow-ban flags).
startBanExpirySweep();

/** Ids of users with an active (not revoked, not expired) account ban. */
async function bannedUserIds(): Promise<Set<number>> {
    const rows = await db.select({ userId: bans.userId }).from(bans).where(and(eq(bans.banType, "account"), activeBanCondition()));
    return new Set(rows.map((r: any) => r.userId).filter((id: any): id is number => typeof id === "number"));
}

router.get("/stats", hasPermission("dashboard"), async (req, res) => {
    try {
        // Use sql`` comparisons for SQLite integer booleans (true=1, false=0)
        const totalUsersResult = await db.select({ count: count() }).from(users);
        const verifiedUsersResult = await db.select({ count: count() }).from(users).where(sql`verified = 1`);
        // Banned = an active account ban in the bans table (karma is not a ban state).
        const bannedCount = (await bannedUserIds()).size;
        const totalPostsResult = await db.select({ count: count() }).from(posts);
        const pendingResult = await db.select({ count: count() }).from(reports).where(sql`status = 'pending'`);
        const resolvedResult = await db.select({ count: count() }).from(reports).where(sql`status = 'resolved'`);
        const rejectedResult = await db.select({ count: count() }).from(reports).where(sql`status = 'rejected'`);

        const toNum = (v: any) => Number(v ?? 0);

        res.json({
            totalUsers: toNum(totalUsersResult[0].count),
            activeUsers: toNum(totalUsersResult[0].count),
            verifiedUsers: toNum(verifiedUsersResult[0].count),
            bannedUsers: bannedCount,
            deletedUsers: 0,
            totalPosts: toNum(totalPostsResult[0].count),
            totalReports: toNum(pendingResult[0].count) + toNum(resolvedResult[0].count) + toNum(rejectedResult[0].count),
            pendingReports: toNum(pendingResult[0].count),
            resolvedReports: toNum(resolvedResult[0].count),
            rejectedReports: toNum(rejectedResult[0].count),
        });
    } catch (error) {
        console.error("Failed to fetch admin stats:", error);
        // SECURITY FIX [VULN-006]: Return generic error, don't leak internals
        res.status(500).json({ error: "Failed to fetch admin stats" });
    }
});

router.get("/users", hasPermission("users"), async (req, res) => {
    try {
        const allUsers = await db.select().from(users).orderBy(desc(users.id));
        const banned = await bannedUserIds();
        // Normalize: SQLite stores timestamps as Unix seconds integers.
        // If createdAt is null or 0, provide a fallback ISO string.
        const normalized = allUsers.map(({ password: _password, ...u }: any) => ({
            ...u,
            isBanned: banned.has(u.id),
            createdAt: u.createdAt
                ? (typeof u.createdAt === "number"
                    ? new Date(u.createdAt * 1000).toISOString()
                    : u.createdAt)
                : new Date().toISOString(),
        }));
        res.json(normalized);
    } catch (error) {
        console.error("Failed to fetch users:", error);
        // SECURITY FIX [VULN-006]: Return generic error, don't leak internals
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

router.get("/reports", hasPermission("reports"), async (req, res) => {
    try {
        const allReports = await db.select().from(reports).orderBy(desc(reports.createdAt));

        // PERF-FIX [N+1-001]: Batch fetch all users and content to prevent N+1 queries
        const reporterIds = [...new Set(allReports.map(r => r.reporterId))];
        const postIds = [...new Set(allReports.filter(r => r.postId).map(r => r.postId))];
        const commentIds = [...new Set(allReports.filter(r => r.commentId).map(r => r.commentId))];

        const [reportersData, postsData, commentsData] = await Promise.all([
            reporterIds.length > 0 ? db.select().from(users).where(inArray(users.id, reporterIds)) : [],
            postIds.length > 0 ? db.select().from(posts).where(inArray(posts.id, postIds)) : [],
            commentIds.length > 0 ? db.select().from(comments).where(inArray(comments.id, commentIds)) : []
        ]);

        // Batch fetch all post/comment authors
        const authorIds = [...new Set([
            ...postsData.map(p => p.authorId),
            ...commentsData.map(c => c.authorId)
        ])];
        const authorsData = authorIds.length > 0
            ? await db.select().from(users).where(inArray(users.id, authorIds))
            : [];

        // Create maps for O(1) lookups
        const reportersMap = new Map(reportersData.map(u => [u.id, u]));
        const postsMap = new Map(postsData.map(p => [p.id, p]));
        const commentsMap = new Map(commentsData.map(c => [c.id, c]));
        const authorsMap = new Map(authorsData.map(u => [u.id, u]));

        // Attach reporter and content information
        const extendedReports = allReports.map((report: any) => {
            const reporter = reportersMap.get(report.reporterId);

            let content = null;
            if (report.postId) {
                const post = postsMap.get(report.postId);
                if (post) {
                    const author = authorsMap.get(post.authorId);
                    content = { type: post.category === "discussion" ? "discussion" : "post", title: post.title, content: post.content, author: author ? { username: author.username, id: author.id } : undefined };
                }
            } else if (report.commentId) {
                const comment = commentsMap.get(report.commentId);
                if (comment) {
                    const author = authorsMap.get(comment.authorId);
                    content = { type: "comment", content: comment.content, author: author ? { username: author.username, id: author.id } : undefined };
                }
            }

            return {
                ...report,
                reporter: reporter ? { username: reporter.username } : undefined,
                content
            };
        });

        res.json(extendedReports);
    } catch (error) {
        console.error("Failed to fetch reports:", error);
        res.status(500).send("Internal Server Error");
    }
});

const forbidden = (res: any, error: string, code: string) => res.status(403).json({ error, code });

router.patch("/users/:id", hasPermission("users"), async (req, res) => {
    try {
        const userId = Number(req.params.id);
        if (!isPlainBody(req.body)) return res.status(400).json({ error: "No valid fields provided for update" });

        const result = adminUpdateUserSchema.safeParse(req.body);
        if (!result.success) {
            return sendValidationError(res, result.error);
        }

        const updateData: Record<string, any> = Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined));
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: "No valid fields provided for update" });
        }

        const currentAdmin = req.user as any;
        const callerIsOwner = currentAdmin.role === "owner";
        const [target] = await db.select().from(users).where(eq(users.id, userId));
        if (!target) return res.status(404).json({ error: "User not found" });

        // SECURITY [OWNER-PROTECTION]: only owners may change anything on an owner account
        // (role, karma < 0 = locked out, freeze, email …), mirroring the DELETE rule below.
        if (target.role === "owner" && !callerIsOwner) {
            return forbidden(res, "Only owners can change owner accounts", "OWNER_PROTECTED");
        }

        // SECURITY [ROLES]: roles are granted by owners only (an admin role already allows moderation).
        if (updateData.role !== undefined || updateData.isAdmin !== undefined) {
            if (!callerIsOwner) {
                if (updateData.role === "owner") return res.status(403).json({ error: "Only system owners can promote others to owner status" });
                return forbidden(res, "Only owners can change roles", "ROLE_CHANGE_OWNER_ONLY");
            }
            // SYNC [ADMIN-ROLE]: Ensure isAdmin and role are consistent
            if (updateData.role === "admin" || updateData.role === "owner") updateData.isAdmin = 1;
            else if (updateData.role === "user") updateData.isAdmin = 0;
            else if (updateData.isAdmin === 1) updateData.role = target.role === "user" ? "admin" : target.role;
            else if (updateData.isAdmin === 0) updateData.role = "user";

            // SECURITY [LAST-OWNER]: Prevent demoting the last system owner
            if (target.role === "owner" && updateData.role !== "owner") {
                const ownersResults = await db.select({ count: count() }).from(users).where(eq(users.role, "owner"));
                if (Number(ownersResults[0].count) <= 1) {
                    return res.status(400).json({ error: "The platform must have at least one owner" });
                }
            }
        }

        // SECURITY [GROUPS]: changing the admin group needs the groups permission and follows the same
        // rules as POST /api/admin/groups/assign (never your own group, never more than you hold).
        if (updateData.adminGroupId !== undefined && updateData.adminGroupId !== target.adminGroupId) {
            if (!callerIsOwner && !(await userHasPermission(currentAdmin, "groups"))) {
                return res.status(403).json({ error: "Forbidden", code: "PERMISSION_DENIED", permission: "groups" });
            }
            const denied = await checkGroupAssignment(currentAdmin, target as any, updateData.adminGroupId);
            if (denied) return res.status(denied.status).json(denied.body);
        } else if (updateData.adminGroupId !== undefined) {
            delete updateData.adminGroupId; // unchanged
        }

        // Unique columns: answer 409 instead of a database error.
        if (updateData.username !== undefined && updateData.username.toLowerCase() !== target.username.toLowerCase()) {
            const [taken] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = lower(${updateData.username})`).limit(1);
            if (taken && taken.id !== userId) return res.status(409).json({ error: "Username already taken" });
        }
        if (updateData.email !== undefined && updateData.email.toLowerCase() !== target.email.toLowerCase()) {
            const [taken] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = lower(${updateData.email})`).limit(1);
            if (taken && taken.id !== userId) return res.status(409).json({ error: "Email already registered" });
        }

        if (Object.keys(updateData).length === 0) return res.json(sanitizeUser(target));

        const [updatedUser] = await db.update(users)
            .set(updateData)
            .where(eq(users.id, userId))
            .returning();

        if (!updatedUser) {
            return res.status(404).json({ error: "User not found" });
        }

        // FEATURE [AL-004]: Log the user update
        activityLogger.logFromRequest(req, {
            action: "user.settings_change",
            category: "users",
            targetType: "User",
            targetId: String(updatedUser.id),
            targetLabel: updatedUser.username,
            description: `Admin updated user profile for ${updatedUser.username}`,
            oldValue: Object.fromEntries(Object.keys(updateData).map((k) => [k, (target as any)[k]])),
            newValue: updateData,
            severity: "warning",
            status: "success",
        }).catch(err => console.error('[Monitor] user.settings_change failed:', err));

        res.json(sanitizeUser(updatedUser));
    } catch (error: any) {
        if (error?.code === "23505" || error?.cause?.code === "23505") {
            return res.status(409).json({ error: "Username already taken" });
        }
        sendInternalError(res, error, "admin user update failed");
    }
});

router.delete("/users/:id", hasPermission("users"), async (req, res) => {
    try {
        const userId = Number(req.params.id);

        const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
        if (!targetUser) return res.status(404).json({ error: "User not found" });

        // SECURITY: Prevent deleting owners via this endpoint
        if (targetUser.role === "owner") {
            return res.status(403).json({ error: "System owners cannot be deleted through the dashboard." });
        }
        if (targetUser.id === (req.user as any).id) {
            return forbidden(res, "You cannot delete your own account here", "SELF_DELETE");
        }

        // Handle dependencies to prevent Foreign Key violations
        await db.transaction(async (tx) => {
            // 1. Delete notifications and messages (Fix: receiver_id instead of recipient_id)
            await tx.delete(sql`notifications` as any).where(sql`user_id = ${userId}`);
            await tx.delete(sql`messages` as any).where(or(sql`sender_id = ${userId}`, sql`receiver_id = ${userId}`));

            // 2. Delete likes and reactions
            await tx.delete(sql`post_likes` as any).where(sql`user_id = ${userId}`);
            await tx.delete(sql`comment_likes` as any).where(sql`user_id = ${userId}`);

            // 3. Delete community memberships and requests
            await tx.delete(sql`community_members` as any).where(sql`user_id = ${userId}`);
            await tx.delete(sql`community_join_requests` as any).where(sql`user_id = ${userId}`);
            await tx.delete(sql`community_bans` as any).where(sql`user_id = ${userId}`);

            // 4. Delete followers/following data
            await tx.delete(sql`followers` as any).where(or(sql`follower_id = ${userId}`, sql`following_id = ${userId}`));

            // 5. Nullify posts and comments
            await tx.update(posts).set({ authorId: 0 as any }).where(eq(posts.authorId, userId));
            await tx.update(comments).set({ authorId: 0 as any }).where(eq(comments.authorId, userId));

            // 6. Delete reports made by user
            await tx.delete(reports).where(eq(reports.reporterId, userId));

            // 7. Finally delete the user
            await tx.delete(users).where(eq(users.id, userId));
        });

        activityLogger.logFromRequest(req, {
            action: "user.delete_account",
            category: "users",
            targetType: "User",
            targetId: String(userId),
            targetLabel: targetUser.username,
            description: `Admin deleted user ${targetUser.username} and handled dependencies`,
            severity: "critical",
            status: "success",
        }).catch(err => console.error('[Monitor] admin.user_delete failed:', err));

        res.json({ success: true });
    } catch (error: any) {
        logger.error("security", "admin user delete failed", error);
        if (!res.headersSent) res.status(500).json({ error: "Failed to delete user due to database dependencies." });
    }
});

router.post("/reset-roles", isOwner, async (req, res) => {
    try {
        await db.update(users).set({ role: "user", isAdmin: 0 }).where(sql`role != 'owner'`);
        res.json({ success: true });
    } catch (error) {
        console.error("Failed to reset roles:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.patch("/reports/:id", hasPermission("reports"), async (req, res) => {
    try {
        // SECURITY FIX [VULN-005]: Validate report status against schema
        const result = adminUpdateReportSchema.safeParse(req.body);
        if (!result.success) return sendValidationError(res, result.error);

        const reportId = Number(req.params.id);
        const [existing] = await db.select().from(reports).where(eq(reports.id, reportId));
        if (!existing) return res.status(404).json({ error: "Report not found" });

        const status = result.data.status;
        const now = new Date();
        const closing = status !== "pending";
        const [updatedReport] = await db.update(reports)
            .set({
                status,
                resolvedBy: closing ? (req.user as any).id : null,
                resolvedAt: closing ? now : null,
                resolutionTimeSeconds: closing && existing.createdAt
                    ? Math.max(0, Math.floor((now.getTime() - new Date(existing.createdAt).getTime()) / 1000))
                    : null,
            })
            .where(eq(reports.id, reportId))
            .returning();
        if (!updatedReport) return res.status(404).json({ error: "Report not found" });

        activityLogger.logFromRequest(req, {
            action: "report.resolve",
            category: "moderation",
            targetType: "Report",
            targetId: String(updatedReport.id),
            description: `Admin updated report status to ${status}`,
            severity: status === "rejected" ? "info" : "warning",
            status: "success",
            oldValue: { status: existing.status },
            newValue: { status }
        }).catch(err => console.error('[Monitor] report.resolve failed:', err));

        res.json(updatedReport);
    } catch (error) {
        sendInternalError(res, error, "admin report update failed");
    }
});

const badQuery = (res: any) => res.status(400).json({ error: "Invalid input", code: "VALIDATION_ERROR" });

// FEATURE [AL-005]: Activity Log Endpoints
router.get("/logs", hasPermission("logs"), async (req, res) => {
    try {
        const category = queryString(req.query.category, 100);
        const severity = queryString(req.query.severity, 50);
        const status = queryString(req.query.status, 50);
        const search = queryString(req.query.search, 200);
        const adminIdRaw = queryString(req.query.adminId, 20);
        if ([category, severity, status, search, adminIdRaw].includes(false)) return badQuery(res);
        const adminId = adminIdRaw === undefined ? undefined : parseId(adminIdRaw);
        if (adminId === null) return badQuery(res);

        const conditions = [];
        if (category) conditions.push(eq(activityLogs.category, category));
        if (severity) conditions.push(eq(activityLogs.severity, severity));
        if (status) conditions.push(eq(activityLogs.status, status));
        if (adminId) conditions.push(eq(activityLogs.userId, adminId));
        if (search) {
            const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
            conditions.push(or(
                like(activityLogs.description, pattern),
                like(activityLogs.targetLabel, pattern),
                like(activityLogs.userEmail, pattern),
                like(activityLogs.userUsername, pattern),
            ));
        }

        const logs = await db.select()
            .from(activityLogs)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(activityLogs.createdAt))
            .limit(100);

        res.json(logs);
    } catch (error) {
        sendInternalError(res, error, "admin logs failed");
    }
});

// Stricter limit for exports and write-heavy admin tools; read-only dashboard routes above stay unthrottled.
router.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: "Admin request limit reached. Please wait 15 minutes." }
}));

/** One CSV field (RFC 4180), with spreadsheet formulas neutralised. */
function csvField(value: unknown): string {
    let s = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

router.get("/logs/export", hasPermission("logs"), async (req, res) => {
    try {
        const { limit, offset } = parsePagination(req.query, { defaultLimit: 5000, maxLimit: 5000 });
        if (offset > 10_000_000) return badQuery(res);

        // SEC-FIX [SEC-010]: Prevent DoS by capping export size
        const pagedLogs = await db.select()
            .from(activityLogs)
            .orderBy(desc(activityLogs.createdAt))
            .limit(limit)
            .offset(offset);

        const format = req.query.format === "csv" ? "csv" : "json";

        if (format === "csv") {
            const header = "ID,Timestamp,Admin,Action,Category,Target,Description,Severity,Status\n";
            const rows = pagedLogs.map((l: any) => [
                l.id, l.createdAt, l.userUsername || l.userEmail || (l.userId ? `#${l.userId}` : ""), l.action, l.category,
                [l.targetType, l.targetLabel || l.targetId].filter(Boolean).join(" "), l.description, l.severity, l.status,
            ].map(csvField).join(",")).join("\n");
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename=activity_logs_${Date.now()}.csv`);
            return res.send(header + rows);
        }

        res.json(pagedLogs);
    } catch (error) {
        sendInternalError(res, error, "admin log export failed");
    }
});

// FEATURE [AS-005]: Admin Settings Endpoints
router.get("/settings", hasPermission("settings"), async (req, res) => {
    try {
        const settings = await db.select().from(adminSettings);
        // Mask sensitive data
        const safeSettings = settings.map((s: any) => ({
            ...s,
            value: s.isSensitive ? "********" : s.value,
        }));
        res.json(safeSettings);
    } catch (error) {
        console.error("Failed to fetch settings:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.patch("/settings/:id", hasPermission("settings"), async (req, res) => {
    try {
        const settingId = parseInt(req.params.id);
        const { value } = req.body;

        const [existing] = await db.select().from(adminSettings).where(eq(adminSettings.id, settingId));
        if (!existing) return res.status(404).send("Setting not found");
        if (existing.isReadonly) return res.status(403).send("Setting is readonly");

        await SettingsService.set(req, existing.category, existing.key, value);
        res.json({ success: true });
    } catch (error) {
        console.error("Failed to update setting:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post("/settings/clear-cache", hasPermission("settings"), async (req, res) => {
    try {
        SettingsService.clearCache();
        res.json({ success: true, message: "Settings cache cleared" });
    } catch (error) {
        console.error("Failed to clear settings cache:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post("/settings/seed", hasPermission("settings"), async (req, res) => {
    try {
        await SettingsService.seed();
        res.json({ success: true });
    } catch (error) {
        console.error("Failed to seed settings:", error);
        res.status(500).send("Internal Server Error");
    }
});

// BULK ACTIONS
const idList = z.array(dbId).min(1).max(100).transform((ids) => Array.from(new Set(ids)));
const bulkUsersSchema = z.object({
    user_ids: idList,
    // "ban" is what the dashboard toolbar sends; it is an account ban.
    action: z.enum(["ban", "account", "shadow", "unban"]),
    reason: text(500, 1).optional().default("Bulk action"),
    duration_hours: z.union([z.number().int().min(1).max(87600), z.null()]).optional(),
});
const bulkReportsSchema = z.object({
    report_ids: idList,
    action: z.enum(["resolve", "reject", "dismiss"]),
    reason: text(500).optional(),
});
const bulkPostsSchema = z.object({
    post_ids: idList,
    action: z.literal("delete").optional().default("delete"),
    reason: text(500).optional(),
});
const performer = (req: any) => ({ id: req.user.id as number, role: req.user.role as string });

// The bulk toolbar of the user list: account/shadow bans of the selected users ("users", like the list).
router.post("/bulk/users", hasPermission("users"), async (req, res) => {
    try {
        const parsed = bulkUsersSchema.safeParse(req.body);
        if (!parsed.success) return sendValidationError(res, parsed.error);
        const { user_ids, action, reason, duration_hours } = parsed.data;
        const result = action === "unban"
            ? await bulkActionService.bulkUnbanUsers({ userIds: user_ids, performedBy: performer(req), reason })
            : await bulkActionService.bulkBanUsers({
                userIds: user_ids,
                performedBy: performer(req),
                reason,
                banType: action === "shadow" ? "shadow" : "account",
                durationHours: duration_hours,
            });
        res.json(result);
    } catch (e: any) {
        sendInternalError(res, e, "admin bulk users failed");
    }
});

router.post("/bulk/reports", hasPermission("reports"), async (req, res) => {
    try {
        const parsed = bulkReportsSchema.safeParse(req.body);
        if (!parsed.success) return sendValidationError(res, parsed.error);
        const result = await bulkActionService.bulkCloseReports({
            reportIds: parsed.data.report_ids,
            performedBy: performer(req),
            action: parsed.data.action,
            reason: parsed.data.reason,
        });
        res.json(result);
    } catch (e: any) {
        sendInternalError(res, e, "admin bulk reports failed");
    }
});

router.post("/bulk/posts", hasPermission("reports"), async (req, res) => {
    try {
        const parsed = bulkPostsSchema.safeParse(req.body);
        if (!parsed.success) return sendValidationError(res, parsed.error);
        const result = await bulkActionService.bulkDeletePosts({
            postIds: parsed.data.post_ids,
            performedBy: performer(req),
            reason: parsed.data.reason,
        });
        res.json(result);
    } catch (e: any) {
        sendInternalError(res, e, "admin bulk posts failed");
    }
});

// BAN MANAGEMENT
router.get("/bans", hasPermission("security"), async (req, res) => {
    try {
        const allBans = await db.select().from(bans).orderBy(desc(bans.createdAt));
        res.json(allBans);
    } catch (e: any) {
        sendInternalError(res, e, "admin bans list failed");
    }
});

const createBanSchema = z.object({
    ban_type: z.enum(["account", "shadow", "ip", "hardware"]),
    user_id: z.union([dbId, z.null()]).optional(),
    ip_address: z.union([text(64).refine((s) => net.isIP(s) !== 0, { message: "Invalid IP address" }), z.null()]).optional(),
    device_fingerprint: z.union([text(128, 1), z.null()]).optional(),
    reason: text(500, 1),
    severity: z.union([z.enum(["low", "medium", "high", "critical", "permanent"]), z.null()]).optional(),
    // 0 / null / missing = permanent
    duration_hours: z.union([z.number().int().min(0).max(87600), z.null()]).optional(),
}).superRefine((b, ctx) => {
    if ((b.ban_type === "account" || b.ban_type === "shadow") && !b.user_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["user_id"], message: "Required" });
    }
    if (b.ban_type === "ip" && !b.ip_address) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ip_address"], message: "Required" });
    if (b.ban_type === "hardware" && !b.device_fingerprint) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["device_fingerprint"], message: "Required" });
    }
});

router.post("/bans", hasPermission("security"), async (req, res) => {
    try {
        const parsed = createBanSchema.safeParse(req.body);
        if (!parsed.success) return sendValidationError(res, parsed.error);
        await createBan(req, res, parsed.data);
    } catch (e: any) {
        sendInternalError(res, e, "admin ban create failed");
    }
});

/** Creates a validated ban (POST /bans, POST /users/:id/ban) and answers the request. */
async function createBan(req: any, res: any, body: z.infer<typeof createBanSchema>) {
    const caller = req.user as any;

    let target: any = null;
    if (body.user_id) {
        [target] = await db.select().from(users).where(eq(users.id, body.user_id));
        if (!target) return res.status(404).json({ error: "User not found" });
        if (target.id === caller.id) return forbidden(res, "You cannot ban yourself", "SELF_BAN");
        if (target.role === "owner") return forbidden(res, "Owners cannot be banned", "OWNER_PROTECTED");
    }

    const now = new Date();
    const expiresAt = body.duration_hours ? new Date(now.getTime() + body.duration_hours * 3600 * 1000) : null;
    const [newBan] = await db.insert(bans).values({
        banType: body.ban_type,
        userId: body.user_id ?? null,
        ipAddress: body.ip_address ?? null,
        deviceFingerprint: body.device_fingerprint ?? null,
        reason: body.reason,
        severity: body.severity || "medium",
        isPermanent: body.duration_hours ? 0 : 1,
        expiresAt,
        isShadow: body.ban_type === "shadow" ? 1 : 0,
        createdBy: caller.id,
        createdByType: "admin",
        createdAt: now,
        updatedAt: now,
    }).returning();

    // Account bans live in the bans table only (enforced by ban-check and the login); karma is untouched.
    if (target && body.ban_type === "shadow") {
        await db.update(users).set({ isShadowBanned: 1 }).where(eq(users.id, target.id));
    }

    activityLogger.logFromRequest(req, {
        action: "user.ban",
        category: "security",
        targetType: target ? "User" : "Ban",
        targetId: String(target ? target.id : newBan.id),
        targetLabel: target?.username ?? body.ip_address ?? undefined,
        description: `Admin created a ${body.ban_type} ban`,
        newValue: { banType: body.ban_type, durationHours: body.duration_hours ?? null },
        severity: "warning",
    }).catch(err => console.error('[Monitor] ban create log failed:', err));

    res.json(newBan);
}

const revokeSchema = z.object({ reason: z.union([text(500), z.null()]).optional() });

router.patch("/bans/:id/revoke", hasPermission("security"), async (req, res) => {
    try {
        const parsed = revokeSchema.safeParse(isPlainBody(req.body) ? req.body : {});
        if (!parsed.success) return sendValidationError(res, parsed.error);
        const now = new Date();
        const [updated] = await db.update(bans).set({
            isActive: 0,
            revokedBy: (req.user as any).id,
            revokedAt: now,
            revokeReason: parsed.data.reason ?? null,
            updatedAt: now,
        }).where(eq(bans.id, Number(req.params.id))).returning();
        if (!updated) return res.status(404).json({ error: "Ban not found", code: "BAN_NOT_FOUND" });

        // A shadow ban also clears the user's shadow flag (unless another shadow ban is still active); karma is never changed.
        await liftUserBanEffects(updated);
        res.json(updated);
    } catch (e: any) {
        sendInternalError(res, e, "admin ban revoke failed");
    }
});

// Restricting a single account from the user list is user moderation, like freezing or shadow-banning it
// via PATCH /users/:id, so it needs the "users" permission. The bans registry itself (all bans, IP and
// device bans, revoking any ban) stays with "security".
const userBanSchema = z.object({
    reason: text(500, 1),
    // 0 / null / missing = permanent
    duration_hours: z.union([z.number().int().min(0).max(87600), z.null()]).optional(),
});

router.post("/users/:id/ban", hasPermission("users"), async (req, res) => {
    try {
        const parsed = userBanSchema.safeParse(req.body);
        if (!parsed.success) return sendValidationError(res, parsed.error);
        await createBan(req, res, { ban_type: "account", user_id: Number(req.params.id), ...parsed.data });
    } catch (e: any) {
        sendInternalError(res, e, "admin user ban failed");
    }
});

/** Lifts the user's active account bans (shadow bans are toggled separately via PATCH /users/:id). */
router.post("/users/:id/unban", hasPermission("users"), async (req, res) => {
    try {
        const parsed = revokeSchema.safeParse(isPlainBody(req.body) ? req.body : {});
        if (!parsed.success) return sendValidationError(res, parsed.error);
        const userId = Number(req.params.id);
        const [target] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, userId));
        if (!target) return res.status(404).json({ error: "User not found" });
        const now = new Date();
        const revoked = await db.update(bans).set({
            isActive: 0,
            revokedBy: (req.user as any).id,
            revokedAt: now,
            revokeReason: parsed.data.reason ?? null,
            updatedAt: now,
        }).where(and(eq(bans.userId, userId), eq(bans.banType, "account"), eq(bans.isActive, 1))).returning({ id: bans.id });

        activityLogger.logFromRequest(req, {
            action: "user.unban",
            category: "security",
            targetType: "User",
            targetId: String(target.id),
            targetLabel: target.username,
            description: `Admin lifted ${revoked.length} account ban(s)`,
            severity: "warning",
        }).catch(err => console.error('[Monitor] unban log failed:', err));

        res.json({ success: true, revoked: revoked.length });
    } catch (e: any) {
        sendInternalError(res, e, "admin user unban failed");
    }
});

// AUTO-PUNISHMENT (its own permission in the admin UI: AutoPunishmentPage / AppSidebar "auto_punishment")
router.get("/auto-punishments", hasPermission("auto_punishment"), async (req, res) => {
    try {
        const rules = await db.select().from(autoPunishmentRules).orderBy(desc(autoPunishmentRules.id));
        const executions = await db.select().from(autoPunishmentExecutions).orderBy(desc(autoPunishmentExecutions.createdAt)).limit(50);
        res.json({ rules, executions });
    } catch (e: any) {
        sendInternalError(res, e, "auto-punishment list failed");
    }
});

router.post("/auto-punishments/rules", hasPermission("auto_punishment"), async (req, res) => {
    try {
        const payload = insertAutoPunishmentRuleSchema.parse(req.body);
        const now = new Date();
        const newRule = await db.insert(autoPunishmentRules).values({
            ...payload,
            createdAt: now,
            updatedAt: now
        }).returning();
        res.json(newRule[0]);
    } catch (e: any) {
        if (isZodError(e)) return sendValidationError(res, e);
        sendInternalError(res, e, "auto-punishment rule save failed");
    }
});

router.patch("/auto-punishments/rules/:id", hasPermission("auto_punishment"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!isPlainBody(req.body)) return res.status(400).json({ error: "No valid fields provided for update" });
        const payload = insertAutoPunishmentRuleSchema.partial().parse(req.body);
        const fields = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
        if (Object.keys(fields).length === 0) return res.status(400).json({ error: "No valid fields provided for update" });

        const updated = await db.update(autoPunishmentRules)
            .set({ ...fields, updatedAt: new Date() })
            .where(eq(autoPunishmentRules.id, id))
            .returning();

        if (updated.length === 0) return res.status(404).json({ error: "Rule not found" });
        res.json(updated[0]);
    } catch (e: any) {
        if (isZodError(e)) return sendValidationError(res, e);
        sendInternalError(res, e, "auto-punishment rule save failed");
    }
});

router.delete("/auto-punishments/rules/:id", hasPermission("auto_punishment"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const deleted = await db.delete(autoPunishmentRules)
            .where(eq(autoPunishmentRules.id, id))
            .returning();

        if (deleted.length === 0) return res.status(404).json({ error: "Rule not found" });
        res.json({ success: true });
    } catch (e: any) {
        sendInternalError(res, e, "auto-punishment rule delete failed");
    }
});

export default router;
