import { Router } from "express";
import { db } from "../db";
import { users, posts, reports, comments } from "@shared/schema";
import { eq, desc, count, sql } from "drizzle-orm";

const router = Router();

// Middleware to ensure user is admin
router.use((req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    const user = req.user as any;
    if (!user.isAdmin && user.role !== "admin" && user.role !== "owner") {
        return res.status(403).send("Forbidden");
    }
    next();
});

router.get("/stats", async (req, res) => {
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
        res.status(500).json({ error: String(error) });
    }
});

router.get("/users", async (req, res) => {
    try {
        const allUsers = await db.select().from(users).orderBy(desc(users.id));
        // Normalize: SQLite stores timestamps as Unix seconds integers.
        // If createdAt is null or 0, provide a fallback ISO string.
        const normalized = allUsers.map((u: any) => ({
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
        res.status(500).json({ error: String(error) });
    }
});

router.get("/reports", async (req, res) => {
    try {
        const allReports = await db.select().from(reports).orderBy(desc(reports.createdAt));

        // Attach reporter and content information
        const extendedReports = await Promise.all(allReports.map(async (report: any) => {
            const reporterResult = await db.select().from(users).where(eq(users.id, report.reporterId));
            const reporter = reporterResult[0];

            let content = null;
            if (report.postId) {
                const postResult = await db.select().from(posts).where(eq(posts.id, report.postId));
                const post = postResult[0];
                if (post) {
                    const authorResult = await db.select().from(users).where(eq(users.id, post.authorId));
                    const author = authorResult[0];
                    content = { type: post.category === "discussion" ? "discussion" : "post", title: post.title, content: post.content, author: author ? { username: author.username, id: author.id } : undefined };
                }
            } else if (report.commentId) {
                const commentResult = await db.select().from(comments).where(eq(comments.id, report.commentId));
                const comment = commentResult[0];
                if (comment) {
                    const authorResult = await db.select().from(users).where(eq(users.id, comment.authorId));
                    const author = authorResult[0];
                    content = { type: "comment", content: comment.content, author: author ? { username: author.username, id: author.id } : undefined };
                }
            }

            return {
                ...report,
                reporter: reporter ? { username: reporter.username } : undefined,
                content
            };
        }));

        res.json(extendedReports);
    } catch (error) {
        console.error("Failed to fetch reports:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.patch("/users/:id", async (req, res) => {
    try {
        const [updatedUser] = await db.update(users)
            .set(req.body)
            .where(eq(users.id, parseInt(req.params.id)))
            .returning();
        res.json(updatedUser);
    } catch (error) {
        console.error("Failed to update user:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.delete("/users/:id", async (req, res) => {
    try {
        await db.delete(users).where(eq(users.id, parseInt(req.params.id)));
        res.json({ success: true });
    } catch (error) {
        console.error("Failed to delete user:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post("/reset-roles", async (req, res) => {
    try {
        await db.update(users).set({ role: "user", isAdmin: false }).where(sql`role != 'owner'`);
        res.json({ success: true });
    } catch (error) {
        console.error("Failed to reset roles:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.patch("/reports/:id", async (req, res) => {
    try {
        const [updatedReport] = await db.update(reports)
            .set({ status: req.body.status })
            .where(eq(reports.id, parseInt(req.params.id)))
            .returning();
        res.json(updatedReport);
    } catch (error) {
        console.error("Failed to update report:", error);
        res.status(500).send("Internal Server Error");
    }
});

export default router;
