import { Router } from "express";
import { analyticsService } from "../services/analytics-service";
import { db } from "../db";
import { communityAnalytics, communities, creatorAnalytics, users } from "@shared/schema";
import { eq, desc, sql, gte } from "drizzle-orm";
import { subDays, format } from "date-fns";

const router = Router();

// SECURITY: Owner-only access for analytics
router.use((req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    const user = req.user as any;
    if (user.role !== "owner") {
        return res.status(403).json({ message: "Only the site owner can access product analytics." });
    }
    next();
});

router.get("/overview", async (req, res) => {
    try {
        const days = parseInt(req.query.days as string) || 30;
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
        .all();

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
        .all();

        res.json(leaderboard);
    } catch (error) {
        console.error("Failed to fetch top creators:", error);
        res.status(500).json({ error: "Failed to fetch top creators" });
    }
});

router.post("/compute", async (req, res) => {
    try {
        const { date } = req.body;
        const targetDate = date ? new Date(date) : subDays(new Date(), 1);
        
        await analyticsService.computeDailySnapshot(targetDate);
        
        res.json({ message: `Snapshot for ${format(targetDate, "yyyy-MM-dd")} computed successfully.` });
    } catch (error) {
        console.error("Failed to manual compute snapshot:", error);
        res.status(500).json({ error: "Failed to compute snapshot" });
    }
});

export default router;
