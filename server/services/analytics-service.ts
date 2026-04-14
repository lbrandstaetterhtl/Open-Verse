import { db } from "../db";
import { 
  analyticsSnapshots, 
  communityAnalytics, 
  creatorAnalytics, 
  users, 
  posts, 
  comments, 
  activityLogs, 
  communities, 
  followers, 
  postLikes,
  type AnalyticsSnapshot,
  type CommunityAnalytics,
  type CreatorAnalytics
} from "@shared/schema";
import { eq, and, gte, lte, sql, count, desc, inArray, or } from "drizzle-orm";
import { subDays, startOfDay, endOfDay, format } from "date-fns";

export class AnalyticsService {
  /**
   * Computes a comprehensive daily snapshot
   * @param date Date to compute for (defaults to yesterday)
   */
  async computeDailySnapshot(date: Date = subDays(new Date(), 1)): Promise<void> {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    
    // Unix seconds
    const startTs = Math.floor(dayStart.getTime() / 1000);
    const endTs = Math.floor(dayEnd.getTime() / 1000);
    const dateStr = format(dayStart, "yyyy-MM-dd");

    try {
      console.log(`[Analytics] Computing snapshot for ${dateStr}...`);

      // 1. User Growth
      const newUsersResult = await db.select({ count: count() })
        .from(users)
        .where(this.timestampCondition(users.createdAt, dayStart, dayEnd))
        .get();
      const totalUsersResult = await db.select({ count: count() }).from(users).get();

      // 2. Active Users (DAU/WAU/MAU)
      const dauResult = await db.select({ count: sql<number>`count(distinct user_id)` })
        .from(activityLogs)
        .where(this.timestampCondition(activityLogs.createdAt, dayStart, dayEnd))
        .get();
      
      const wauStart = subDays(dayEnd, 7);
      const wauResult = await db.select({ count: sql<number>`count(distinct user_id)` })
        .from(activityLogs)
        .where(this.timestampCondition(activityLogs.createdAt, wauStart, dayEnd))
        .get();

      const mauStart = subDays(dayEnd, 30);
      const mauResult = await db.select({ count: sql<number>`count(distinct user_id)` })
        .from(activityLogs)
        .where(this.timestampCondition(activityLogs.createdAt, mauStart, dayEnd))
        .get();

      // 3. Content Metrics
      const newPostsResult = await db.select({ count: count() })
        .from(posts)
        .where(this.timestampCondition(posts.createdAt, dayStart, dayEnd))
        .get();
      
      const newCommentsResult = await db.select({ count: count() })
        .from(comments)
        .where(this.timestampCondition(comments.createdAt, dayStart, dayEnd))
        .get();

      const newLikesResult = await db.select({ count: count() })
        .from(postLikes)
        .where(this.timestampCondition(postLikes.createdAt, dayStart, dayEnd))
        .get();
      
      const newFollowsResult = await db.select({ count: count() })
        .from(followers)
        .where(this.timestampCondition(followers.createdAt, dayStart, dayEnd))
        .get();

      const newCommunitiesResult = await db.select({ count: count() })
        .from(communities)
        .where(this.timestampCondition(communities.createdAt, dayStart, dayEnd))
        .get();

      // 4. Retention (D1)
      const d1Start = subDays(dayStart, 1);
      const d1End = endOfDay(d1Start);
      
      const cohortUsers = await db.select({ id: users.id })
        .from(users)
        .where(this.timestampCondition(users.createdAt, d1Start, d1End))
        .all();
      
      let d1Retention = 0;
      if (cohortUsers.length > 0) {
        const cohortIds = cohortUsers.map(u => u.id);
        const activeFromCohort = await db.select({ count: sql<number>`count(distinct user_id)` })
            .from(activityLogs)
            .where(and(
                this.timestampCondition(activityLogs.createdAt, dayStart, dayEnd),
                inArray(activityLogs.userId, cohortIds as number[])
            ))
            .get();
        d1Retention = (activeFromCohort?.count ?? 0) / cohortUsers.length;
      }

      // 5. Save Snapshot
      const snapshot: any = {
        snapshotDate: dateStr,
        snapshotHour: null, // Ensure explicitly null for daily granularity
        granularity: 'day',
        newUsers: newUsersResult?.count ?? 0,
        totalUsers: totalUsersResult?.count ?? 0,
        activeUsersDay: dauResult?.count ?? 0,
        activeUsersWeek: wauResult?.count ?? 0,
        activeUsersMonth: mauResult?.count ?? 0,
        newPosts: newPostsResult?.count ?? 0,
        newComments: newCommentsResult?.count ?? 0,
        newLikes: newLikesResult?.count ?? 0,
        newFollows: newFollowsResult?.count ?? 0,
        newCommunities: newCommunitiesResult?.count ?? 0,
        engagementRate: (dauResult?.count ?? 0) > 0 
            ? ((newPostsResult?.count ?? 0) + (newCommentsResult?.count ?? 0) + (newLikesResult?.count ?? 0)) / (dauResult?.count ?? 1)
            : 0,
        d1Retention: d1Retention,
        createdAt: Math.floor(Date.now() / 1000)
      };

      await db.insert(analyticsSnapshots)
        .values(snapshot)
        .onConflictDoUpdate({
          target: [analyticsSnapshots.snapshotDate, analyticsSnapshots.snapshotHour, analyticsSnapshots.granularity],
          set: snapshot
        });

      // 6. Community Analytics
      await this.computeCommunityAnalytics(dayStart, dayEnd, dateStr);

      // 7. Creator Analytics
      await this.computeCreatorAnalytics(dayStart, dayEnd, dateStr);

      console.log(`[Analytics] Successfully computed snapshot for ${dateStr}`);
    } catch (error) {
      console.error(`[Analytics] Failed to compute snapshot for ${dateStr}:`, error);
      throw error;
    }
  }

  private async computeCommunityAnalytics(start: Date, end: Date, dateStr: string) {
    const allCommunities = await db.select().from(communities).all();
    
    for (const community of allCommunities) {
      const newPosts = await db.select({ count: count() })
        .from(posts)
        .where(and(eq(posts.communityId, community.id), this.timestampCondition(posts.createdAt, start, end)))
        .get();
      
      const activeMembers = await db.select({ count: sql<number>`count(distinct user_id)` })
        .from(activityLogs)
        .where(and(
            eq(activityLogs.category, 'content'),
            sql`json_extract(${activityLogs.metadata}, '$.community_id') = ${community.id}`,
            this.timestampCondition(activityLogs.createdAt, start, end)
        ))
        .get();

      const stats = {
        communityId: community.id,
        snapshotDate: dateStr,
        newPosts: newPosts?.count ?? 0,
        activeMembers: activeMembers?.count ?? 0,
        engagementScore: ((newPosts?.count ?? 0) * 10) + ((activeMembers?.count ?? 0) * 5),
        createdAt: Math.floor(Date.now() / 1000)
      };

      await db.insert(communityAnalytics)
        .values(stats)
        .onConflictDoUpdate({
          target: [communityAnalytics.communityId, communityAnalytics.snapshotDate],
          set: stats
        });
    }
  }

  private async computeCreatorAnalytics(start: Date, end: Date, dateStr: string) {
    const startTs = Math.floor(start.getTime() / 1000);
    const endTs = Math.floor(end.getTime() / 1000);

    // Get creators active in the period
    const activeCreators = await db.select({ userId: posts.authorId })
        .from(posts)
        .where(this.timestampCondition(posts.createdAt, start, end))
        .groupBy(posts.authorId)
        .all();

    for (const { userId } of activeCreators) {
        const newPosts = await db.select({ count: count() })
            .from(posts)
            .where(and(eq(posts.authorId, userId as number), this.timestampCondition(posts.createdAt, start, end)))
            .get();
        
        const newFollowers = await db.select({ count: count() })
            .from(followers)
            .where(and(eq(followers.followingId, userId as number), this.timestampCondition(followers.createdAt, start, end)))
            .get();

        const stats = {
            userId: userId as number,
            snapshotDate: dateStr,
            newPosts: newPosts?.count ?? 0,
            newFollowers: newFollowers?.count ?? 0,
            engagementScore: ((newPosts?.count ?? 0) * 20) + ((newFollowers?.count ?? 0) * 50),
            createdAt: Math.floor(Date.now() / 1000)
        };

        await db.insert(creatorAnalytics)
            .values(stats)
            .onConflictDoUpdate({
                target: [creatorAnalytics.userId, creatorAnalytics.snapshotDate],
                set: stats
            });
    }
  }

  private timestampCondition(column: any, start: Date, end: Date) {
    const s = start.toISOString().replace('T', ' ').slice(0, 19);
    const e = end.toISOString().replace('T', ' ').slice(0, 19);
    return sql`(
      CASE 
        WHEN typeof(${column}) = 'integer' THEN datetime(${column}, 'unixepoch')
        ELSE datetime(${column})
      END
    ) BETWEEN ${s} AND ${e}`;
  }

  async getGrowthOverview(days: number = 30) {
    const limitDate = Math.floor(subDays(new Date(), days).getTime() / 1000);
    return await db.select()
        .from(analyticsSnapshots)
        .where(gte(analyticsSnapshots.createdAt, limitDate))
        .orderBy(desc(analyticsSnapshots.snapshotDate))
        .all();
  }

  async getLatestSnapshot(): Promise<AnalyticsSnapshot | null> {
    const result = await db.select().from(analyticsSnapshots)
        .orderBy(desc(analyticsSnapshots.snapshotDate))
        .limit(1)
        .get();
    return result || null;
  }
}

export const analyticsService = new AnalyticsService();
