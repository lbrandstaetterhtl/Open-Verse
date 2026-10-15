import { Router } from "express";
import { db } from "../db";
import { users, posts, reports, comments, activityLogs, adminSettings } from "@shared/schema";
import { adminUpdateUserSchema, adminUpdateReportSchema } from "@shared/schema";
import { eq, desc, count, sql, and, or, inArray, like } from "drizzle-orm";
import { activityLogger } from "../services/activity-logger";
import rateLimit from "express-rate-limit";
import { SettingsService } from "../services/settings";
import { bulkActionService } from "../services/bulk-action-service";
import { bans, autoPunishmentRules, autoPunishmentExecutions, insertAutoPunishmentRuleSchema } from "@shared/schema";
import { hasPermission, isAdmin, isOwner } from "../middleware/auth";
import { sanitizeUser } from "../storage";
import { parsePagination } from "../utils/pagination";

const router = Router();

// Every admin route requires an admin or owner; routes below add their specific permission on top.
router.use(isAdmin);

router.get("/stats", hasPermission("dashboard"), async (req, res) => {
    try {
        // Use sql`` comparisons for SQLite integer booleans (true=1, false=0)
        const totalUsersResult = await db.select({ count: count() }).from(users);
        const verifiedUsersResult = await db.select({ count: count() }).from(users).where(sql`verified = 1`);
        const bannedUsersResult = await db.select({ count: count() }).from(users).where(sql`karma < 0`);
        const totalPostsResult = await db.select({ count: count() }).from(posts);
        const pendingResult = await db.select({ count: count() }).from(reports).where(sql`status = 'pending'`);
        const resolvedResult = await db.select({ count: count() }).from(reports).where(sql`status = 'resolved'`);
        const rejectedResult = await db.select({ count: count() }).from(reports).where(sql`status = 'rejected'`);

        const toNum = (v: any) => Number(v ?? 0);

        res.json({
            totalUsers: toNum(totalUsersResult[0].count),
            activeUsers: toNum(totalUsersResult[0].count),
            verifiedUsers: toNum(verifiedUsersResult[0].count),
            bannedUsers: toNum(bannedUsersResult[0].count),
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
        // Normalize: SQLite stores timestamps as Unix seconds integers.
        // If createdAt is null or 0, provide a fallback ISO string.
        const normalized = allUsers.map(({ password: _password, ...u }: any) => ({
            ...u,
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

router.patch("/users/:id", hasPermission("users"), async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        if (isNaN(userId)) {
            return res.status(400).send("Invalid user ID");
        }

        const result = adminUpdateUserSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json(result.error);
        }

        // Prevent crash on empty update object
        if (Object.keys(result.data).length === 0) {
            return res.status(400).send("No valid fields provided for update");
        }

        const currentAdmin = req.user as any;
        const targetId = userId;
        const updateData = { ...result.data };

        // Role/isAdmin synchronization and security checks
        if (updateData.role !== undefined || updateData.isAdmin !== undefined) {
            // SYNC [ADMIN-ROLE]: Ensure isAdmin and role are consistent
            if (updateData.role === "admin" || updateData.role === "owner") {
                updateData.isAdmin = true;
            } else if (updateData.role === "user") {
                updateData.isAdmin = false;
            } else if (updateData.isAdmin === true && updateData.role === undefined) {
                // If only isAdmin set to true, default role to admin if it was user
                const [target] = await db.select().from(users).where(eq(users.id, targetId));
                if (target && target.role === "user") updateData.role = "admin";
            } else if (updateData.isAdmin === false && updateData.role === undefined) {
                updateData.role = "user";
            }

            // SECURITY [OWNER-PROMOTION]: Only owners can promote to owner
            if (updateData.role === "owner" && currentAdmin.role !== "owner") {
                return res.status(403).send("Only system owners can promote others to owner status");
            }

            // SECURITY [LAST-OWNER]: Prevent demoting the last system owner
            const [target] = await db.select().from(users).where(eq(users.id, targetId));
            if (target && target.role === "owner" && updateData.role !== "owner") {
                const ownersResults = await db.select({ count: count() }).from(users).where(eq(users.role, "owner"));
                if (ownersResults[0].count <= 1) {
                    return res.status(400).send("The platform must have at least one owner");
                }
            }
        }

        // Remove undefined fields and handle SQLite boolean mapping
        const isSqlite = process.env.USE_SQLITE === "true";
        const cleanUpdateData = Object.fromEntries(
            Object.entries(updateData)
                .filter(([_, v]) => v !== undefined)
                .map(([k, v]) => {
                    // DB columns are integers (0/1), so we must convert booleans
                    if (typeof v === "boolean") {
                        return [k, v ? 1 : 0];
                    }
                    return [k, v];
                })
        );

        const [updatedUser] = await db.update(users)
            .set(cleanUpdateData)
            .where(eq(users.id, userId))
            .returning();

        if (!updatedUser) {
            return res.status(404).send("User not found");
        }

        // FEATURE [AL-004]: Log the user update
        activityLogger.logFromRequest(req, {
            action: "user.settings_change",
            category: "users",
            targetType: "User",
            targetId: String(updatedUser.id),
            targetLabel: updatedUser.username,
            description: `Admin updated user profile for ${updatedUser.username}`,
            newValue: result.data,
            severity: "warning",
            status: "success",
        }).catch(err => console.error('[Monitor] user.settings_change failed:', err));

        res.json(sanitizeUser(updatedUser));
    } catch (error) {
        console.error("Failed to update user:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.delete("/users/:id", hasPermission("users"), async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        if (isNaN(userId)) return res.status(400).send("Invalid user ID");

        const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
        if (!targetUser) return res.status(404).send("User not found");

        // SECURITY: Prevent deleting owners via this endpoint
        if (targetUser.role === "owner") {
            return res.status(403).send("System owners cannot be deleted through the dashboard.");
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
        console.error("Failed to delete user:", error);
        res.status(500).json({ 
            error: "Failed to delete user due to database dependencies.",
            details: error.message 
        });
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
        if (!result.success) return res.status(400).json(result.error);

        const [updatedReport] = await db.update(reports)
            .set({ status: result.data.status })
            .where(eq(reports.id, parseInt(req.params.id)))
            .returning();

        activityLogger.logFromRequest(req, {
            action: "report.resolve",
            category: "moderation",
            targetType: "Report",
            targetId: String(updatedReport.id),
            description: `Admin updated report status to ${result.data.status}`,
            severity: result.data.status === "rejected" ? "info" : "warning",
            status: "success",
            newValue: { status: result.data.status }
        }).catch(err => console.error('[Monitor] report.resolve failed:', err));

        res.json(updatedReport);
    } catch (error) {
        console.error("Failed to update report:", error);
        res.status(500).send("Internal Server Error");
    }
});

// FEATURE [AL-005]: Activity Log Endpoints
router.get("/logs", hasPermission("logs"), async (req, res) => {
    try {
        const { category, severity, status, search, adminId } = req.query;
        const conditions = [];

        if (category) conditions.push(eq(activityLogs.category, category as string));
        if (severity) conditions.push(eq(activityLogs.severity, severity as any));
        if (status) conditions.push(eq(activityLogs.status, status as any));
        if (adminId) conditions.push(eq(activityLogs.userId, parseInt(adminId as string)));
        if (search) {
            const pattern = `%${search}%`;
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
        console.error("Failed to fetch activity logs:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Stricter limit for exports and write-heavy admin tools; read-only dashboard routes above stay unthrottled.
router.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: "Admin request limit reached. Please wait 15 minutes."
}));

router.get("/logs/export", hasPermission("logs"), async (req, res) => {
    try {
        const { limit, offset } = parsePagination(req.query, { defaultLimit: 5000, maxLimit: 5000 });

        // SEC-FIX [SEC-010]: Prevent DoS by capping export size
        const pagedLogs = await db.select()
            .from(activityLogs)
            .orderBy(desc(activityLogs.createdAt))
            .limit(limit)
            .offset(offset);

        const format = req.query.format === "csv" ? "csv" : "json";

        if (format === "csv") {
            const header = "ID,Timestamp,Admin,Action,Category,Description,Severity,Status\n";
            const rows = pagedLogs.map((l: any) => 
                `${l.id},${l.createdAt},${l.adminEmail},${l.action},${l.category},"${l.description.replaceAll('"', '""')}",${l.severity},${l.status}`
            ).join("\n");
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename=activity_logs_${Date.now()}.csv`);
            return res.send(header + rows);
        }

        res.json(pagedLogs);
    } catch (error) {
        console.error("Failed to export logs:", error);
        res.status(500).send("Internal Server Error");
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
router.post("/bulk/users", hasPermission("security"), async (req, res) => {
    try {
        const result = await bulkActionService.bulkBanUsers({
            userIds: req.body.user_ids,
            performedBy: (req.user as any).id,
            reason: req.body.reason,
            banType: req.body.action as any,
            durationHours: req.body.duration_hours,
        });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/bulk/reports", hasPermission("reports"), async (req, res) => {
    try {
        const result = await bulkActionService.bulkCloseReports({
            reportIds: req.body.report_ids,
            performedBy: (req.user as any).id,
            action: req.body.action as any,
            reason: req.body.reason,
        });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/bulk/posts", hasPermission("reports"), async (req, res) => {
    try {
        const result = await bulkActionService.bulkDeletePosts({
            postIds: req.body.post_ids,
            performedBy: (req.user as any).id,
            action: req.body.action as any,
            reason: req.body.reason,
        });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// BAN MANAGEMENT
router.get("/bans", hasPermission("security"), async (req, res) => {
    try {
        const allBans = await db.select().from(bans).orderBy(desc(bans.createdAt));
        res.json(allBans);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/bans", hasPermission("security"), async (req, res) => {
    try {
        const body = req.body;
        const now = new Date();
        const expiresAt = body.duration_hours ? new Date(now.getTime() + body.duration_hours * 3600 * 1000) : null;
        const newBan = await db.insert(bans).values({
            banType: body.ban_type,
            userId: body.user_id,
            ipAddress: body.ip_address,
            deviceFingerprint: body.device_fingerprint,
            reason: body.reason,
            severity: body.severity || "medium",
            isPermanent: !body.duration_hours ? 1 : 0,
            expiresAt,
            isShadow: body.ban_type === "shadow" ? 1 : 0,
            createdBy: (req.user as any).id,
            createdByType: "admin",
            createdAt: now,
            updatedAt: now,
        }).returning();
        
        if (body.user_id) {
            if (body.ban_type === "shadow") {
                await db.update(users).set({ isShadowBanned: 1 }).where(eq(users.id, body.user_id));
            } else if (body.ban_type === "account") {
                await db.update(users).set({ karma: -9999 }).where(eq(users.id, body.user_id));
            }
        }
        res.json(newBan[0]);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.patch("/bans/:id/revoke", hasPermission("security"), async (req, res) => {
    try {
        const now = new Date();
        const updated = await db.update(bans).set({
            isActive: 0,
            revokedBy: (req.user as any).id,
            revokedAt: now,
            revokeReason: req.body.reason,
            updatedAt: now,
        }).where(eq(bans.id, parseInt(req.params.id))).returning();
        
        // Also unban user if it was an account/shadow ban
        if (updated[0] && updated[0].userId) {
            if (updated[0].banType === "shadow") {
               await db.update(users).set({ isShadowBanned: 0 }).where(eq(users.id, updated[0].userId));
            } else if (updated[0].banType === "account") {
               // We don't restore karma fully but let's reset to 0
               await db.update(users).set({ karma: 0 }).where(eq(users.id, updated[0].userId));
            }
        }
        res.json(updated[0]);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// AUTO-PUNISHMENT
router.get("/auto-punishments", hasPermission("security"), async (req, res) => {
    try {
        const rules = await db.select().from(autoPunishmentRules).orderBy(desc(autoPunishmentRules.id));
        const executions = await db.select().from(autoPunishmentExecutions).orderBy(desc(autoPunishmentExecutions.createdAt)).limit(50);
        res.json({ rules, executions });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/auto-punishments/rules", hasPermission("security"), async (req, res) => {
    try {
        const payload = insertAutoPunishmentRuleSchema.parse(req.body);
        const now = new Date();
        const newRule = await db.insert(autoPunishmentRules).values({
            ...payload,
            createdBy: (req.user as any).id,
            createdAt: now,
            updatedAt: now
        }).returning();
        res.json(newRule[0]);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.patch("/auto-punishments/rules/:id", hasPermission("security"), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const payload = insertAutoPunishmentRuleSchema.partial().parse(req.body);
        const now = new Date();
        
        const updateData: any = { ...payload, updatedAt: now };
        if (typeof payload.isActive === 'boolean') {
            updateData.isActive = payload.isActive ? 1 : 0;
        }

        const updated = await db.update(autoPunishmentRules)
            .set(updateData)
            .where(eq(autoPunishmentRules.id, id))
            .returning();
        
        if (updated.length === 0) return res.status(404).json({ error: "Rule not found" });
        res.json(updated[0]);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.delete("/auto-punishments/rules/:id", hasPermission("security"), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const deleted = await db.delete(autoPunishmentRules)
            .where(eq(autoPunishmentRules.id, id))
            .returning();
            
        if (deleted.length === 0) return res.status(404).json({ error: "Rule not found" });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
