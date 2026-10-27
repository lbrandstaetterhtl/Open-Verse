import { Router } from "express";
import { analyticsService } from "../services/analytics-service";
import { db } from "../db";
import { communityAnalytics, communities, creatorAnalytics, users } from "@shared/schema";
import { eq, desc, sql, gte } from "drizzle-orm";
import { subDays, format } from "date-fns";
import { hasPermission } from "../middleware/auth";

const router = Router();

// SECURITY: Permission-based access for analytics
router.use(hasPermission("analytics"));

router.get("/overview", async (req, res) => {
    try {
        // 1..365 days; anything else (negative, huge, "abc", arrays) falls back to the default.
        const raw = typeof req.query.days === "string" && /^\d{1,4}$/.test(req.query.days) ? Number(req.query.days) : 30;
        const days = Math.min(Math.max(raw || 30, 1), 365);
        const history = await analyticsService.getGrowthOverview(days);
        const latest = await analyticsService.getLatestSnapshot();

        res.json({
            latest,
            history: history.toReversed() // Chronological order for charts
        });
    } catch (error) {
        console.error("Failed to fetch analytics overview:", error);
        res.status(500).json({ error: "Failed to fetch analytics overview" });
    }
});

router.get("/hot-communities", async (req, res) => {
    try {
        const dateStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
        
        const leaderboard = await db.select({
            id: communities.id,
            name: communities.name,
            slug: communities.slug,
            imageUrl: communities.imageUrl,
            newPosts: communityAnalytics.newPosts,
            activeMembers: communityAnalytics.activeMembers,
            engagementScore: communityAnalytics.engagementScore
        })
        .from(communityAnalytics)
        .innerJoin(communities, eq(communityAnalytics.communityId, communities.id))
        .where(eq(communityAnalytics.snapshotDate, dateStr))
        .orderBy(desc(communityAnalytics.engagementScore))
        .limit(10)
        .execute();

        res.json(leaderboard);
    } catch (error) {
        console.error("Failed to fetch hot communities:", error);
        res.status(500).json({ error: "Failed to fetch hot communities" });
    }
});

router.get("/top-creators", async (req, res) => {
    try {
        const dateStr = format(subDays(new Date(), 1), "yyyy-MM-dd");

        const leaderboard = await db.select({
            id: users.id,
            username: users.username,
            profilePictureUrl: users.profilePictureUrl,
            newPosts: creatorAnalytics.newPosts,
            newFollowers: creatorAnalytics.newFollowers,
            engagementScore: creatorAnalytics.engagementScore
        })
        .from(creatorAnalytics)
        .innerJoin(users, eq(creatorAnalytics.userId, users.id))
        .where(eq(creatorAnalytics.snapshotDate, dateStr))
        .orderBy(desc(creatorAnalytics.engagementScore))
        .limit(10)
        .execute();

        res.json(leaderboard);
    } catch (error) {
        console.error("Failed to fetch top creators:", error);
        res.status(500).json({ error: "Failed to fetch top creators" });
    }
});

router.post("/compute", async (req, res) => {
    try {
        const date = req.body && typeof req.body === "object" ? req.body.date : undefined;
        let targetDate = subDays(new Date(), 1);
        if (date !== undefined && date !== null && date !== "") {
            const parsed = typeof date === "string" && date.length <= 40 && /^\d{4}-\d{2}-\d{2}/.test(date) ? new Date(date) : null;
            if (!parsed || Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() < 2000 || parsed.getTime() > Date.now() + 86400000) {
                return res.status(400).json({ error: "Invalid date", code: "INVALID_DATE" });
            }
            targetDate = parsed;
        }
        
        await analyticsService.computeDailySnapshot(targetDate);
        
        res.json({ message: `Snapshot for ${format(targetDate, "yyyy-MM-dd")} computed successfully.` });
    } catch (error) {
        console.error("Failed to manual compute snapshot:", error);
        res.status(500).json({ error: "Failed to compute snapshot" });
    }
});

export default router;
