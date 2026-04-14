import type {
  Community,
  InsertCommunity,
  CommunityMember,
  CommunityBan,
  Post,
  User,
  Report} from "@shared/schema";
import {
  communities,
  communityMembers,
  communityBans,
  communityJoinRequests,
  posts,
  users,
  reports,
  comments,
} from "@shared/schema";
import { db, getSqlite } from "../db";
import { eq, and, or, desc, sql, inArray } from "drizzle-orm";

export class CommunityStorage {
  async createCommunity(
    community: InsertCommunity & { creatorId: number; slug: string },
  ): Promise<Community> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const createdAt = Math.floor(Date.now() / 1000);
      const stmt = sqlite.prepare(`
        INSERT INTO communities (name, description, slug, creator_id, image_url, allowed_categories, is_private, created_at)
        VALUES (@name, @description, @slug, @creatorId, @imageUrl, @allowedCategories, @isPrivate, @createdAt)
      `);

      const info = stmt.run({
        ...community,
        allowedCategories: community.allowedCategories || "news,entertainment,discussion",
        isPrivate: community.isPrivate ? 1 : 0,
        createdAt,
      });

      const newCommunity = sqlite
        .prepare("SELECT * FROM communities WHERE id = ?")
        .get(info.lastInsertRowid) as any;

      return {
        id: newCommunity.id,
        name: newCommunity.name,
        slug: newCommunity.slug,
        description: newCommunity.description,
        creatorId: newCommunity.creator_id,
        imageUrl: newCommunity.image_url,
        allowedCategories: newCommunity.allowed_categories,
        isPrivate: Boolean(newCommunity.is_private),
        createdAt: new Date(newCommunity.created_at * 1000),
      };
    }

    const [newCommunity] = await db.insert(communities).values(community).returning();
    return newCommunity;
  }

  async getCommunity(id: number): Promise<Community | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const community = sqlite.prepare("SELECT * FROM communities WHERE id = ?").get(id);
      if (!community) return undefined;
      return {
        id: community.id,
        name: community.name,
        slug: community.slug,
        description: community.description,
        creatorId: community.creator_id,
        imageUrl: community.image_url,
        allowedCategories: community.allowed_categories || "news,entertainment,discussion",
        isPrivate: Boolean(community.is_private),
        createdAt: isNaN(Number(community.created_at)) ? new Date(community.created_at) : new Date(Number(community.created_at) * 1000),
      };
    }
    const [community] = await db.select().from(communities).where(eq(communities.id, id));
    return community;
  }

  async getCommunityBySlug(slug: string): Promise<Community | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const row: any = sqlite.prepare("SELECT * FROM communities WHERE slug = ?").get(slug);
      if (!row) return undefined;
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        imageUrl: row.image_url,
        creatorId: row.creator_id,
        allowedCategories: row.allowed_categories || "news,entertainment,discussion",
        isPrivate: Boolean(row.is_private),
        createdAt: isNaN(Number(row.created_at)) ? new Date(row.created_at) : new Date(Number(row.created_at) * 1000),
      };
    }
    const [community] = await db.select().from(communities).where(eq(communities.slug, slug));
    return community;
  }

  async getCommunities(options: { limit?: number; offset?: number } = {}): Promise<Community[]> {
    const { limit = 50, offset = 0 } = options;
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare("SELECT * FROM communities ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset);
      return rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        creatorId: row.creator_id,
        imageUrl: row.image_url,
        allowedCategories: row.allowed_categories || "news,entertainment,discussion",
        isPrivate: Boolean(row.is_private),
        createdAt: isNaN(Number(row.created_at)) ? new Date(row.created_at) : new Date(Number(row.created_at) * 1000),
      }));
    }
    return await db.select().from(communities).orderBy(desc(communities.createdAt)).limit(limit).offset(offset);
  }

  async getCommunityFeedPosts(userId: number, options: { limit?: number; offset?: number } = {}): Promise<Post[]> {
    const { limit = 50, offset = 0 } = options;
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const memberRows = sqlite
        .prepare("SELECT community_id FROM community_members WHERE user_id = ?")
        .all(userId) as { community_id: number }[];
      const communityIds = memberRows.map((r) => r.community_id);

      if (communityIds.length === 0) return [];

      const placeholders = communityIds.map(() => "?").join(",");
      const rows = sqlite
        .prepare(`
        SELECT * FROM posts 
        WHERE community_id IN (${placeholders}) 
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
        .all(...communityIds, limit, offset);

      return rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        authorId: row.author_id,
        category: row.category,
        karma: row.karma,
        mediaUrl: row.media_url,
        mediaType: row.media_type,
        communityId: row.community_id,
        createdAt: isNaN(Number(row.created_at)) ? new Date(row.created_at) : new Date(row.created_at * 1000),
      }));
    }

    const memberCommunities = await db
      .select({ id: communityMembers.communityId })
      .from(communityMembers)
      .where(eq(communityMembers.userId, userId));

    const communityIds = memberCommunities.map((c: { id: number }) => c.id);
    if (communityIds.length === 0) return [];

    return await db
      .select()
      .from(posts)
      .where(inArray(posts.communityId, communityIds))
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset);
  }

  // Members
  async addCommunityMember(
    communityId: number,
    userId: number,
    role: string = "member",
  ): Promise<CommunityMember> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const joinedAt = Math.floor(Date.now() / 1000);
      const stmt = sqlite.prepare(`
        INSERT INTO community_members (community_id, user_id, role, joined_at)
        VALUES (?, ?, ?, ?)
      `);

      const info = stmt.run(communityId, userId, role, joinedAt);
      const member = sqlite
        .prepare("SELECT * FROM community_members WHERE id = ?")
        .get(info.lastInsertRowid);

      return {
        ...member,
        joinedAt: new Date(member.joined_at * 1000),
      };
    }

    const [member] = await db
      .insert(communityMembers)
      .values({ communityId, userId, role })
      .returning();
    return member;
  }

  async removeCommunityMember(communityId: number, userId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite
        .prepare("DELETE FROM community_members WHERE community_id = ? AND user_id = ?")
        .run(communityId, userId);
      return;
    }
    await db
      .delete(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)));
  }

  async updateCommunityMemberRole(communityId: number, userId: number, role: string): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE community_members SET role = ? WHERE community_id = ? AND user_id = ?").run(role, communityId, userId);
      return;
    }
    await db
      .update(communityMembers)
      .set({ role })
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)));
  }

  async getCommunityMember(communityId: number, userId: number): Promise<CommunityMember | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const member = sqlite
        .prepare("SELECT * FROM community_members WHERE community_id = ? AND user_id = ?")
        .get(communityId, userId);
      if (!member) return undefined;
      return {
        ...member,
        joinedAt: isNaN(Number(member.joined_at)) ? new Date(member.joined_at) : new Date(Number(member.joined_at) * 1000),
      };
    }
    const [member] = await db
      .select()
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)));
    return member;
  }

  async getCommunityMembers(communityId: number): Promise<(CommunityMember & { user: User })[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare(`
        SELECT cm.*, u.username, u.email, u.created_at, u.email_verified, u.is_admin, u.verified, u.karma, u.bio
        FROM community_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.community_id = ?
      `).all(communityId);

      return rows.map((row: any) => ({
        id: row.id,
        communityId: row.community_id,
        userId: row.user_id,
        role: row.role,
        joinedAt: new Date(Number(row.joined_at) * 1000),
        user: {
          id: row.user_id,
          username: row.username,
          email: row.email,
          createdAt: new Date(Number(row.created_at) * 1000),
          emailVerified: Boolean(row.email_verified),
          isAdmin: Boolean(row.is_admin),
          verified: Boolean(row.verified),
          karma: row.karma,
          bio: row.bio,
        },
      }));
    }

    const members = await db
      .select({
        id: communityMembers.id,
        communityId: communityMembers.communityId,
        userId: communityMembers.userId,
        role: communityMembers.role,
        joinedAt: communityMembers.joinedAt,
        username: users.username,
        email: users.email,
        bio: users.bio,
        profilePictureUrl: users.profilePictureUrl,
      })
      .from(communityMembers)
      .innerJoin(users, eq(communityMembers.userId, users.id))
      .where(eq(communityMembers.communityId, communityId));

    return members.map((row) => ({
      id: row.id,
      communityId: row.communityId,
      userId: row.userId,
      role: row.role,
      joinedAt: row.joinedAt,
      user: {
        id: row.userId,
        username: row.username,
        email: row.email,
        bio: row.bio,
        profilePictureUrl: row.profilePictureUrl,
      } as User,
    }));
  }

  async getUserCommunities(userId: number): Promise<(Community & { role: string })[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare(`
        SELECT c.*, cm.role
        FROM community_members cm
        JOIN communities c ON cm.community_id = c.id
        WHERE cm.user_id = ?
      `).all(userId);

      return rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        slug: row.slug,
        creatorId: row.creator_id,
        imageUrl: row.image_url,
        isPrivate: Boolean(row.is_private),
        createdAt: isNaN(Number(row.created_at)) ? new Date(row.created_at) : new Date(Number(row.created_at) * 1000),
        role: row.role,
      }));
    }

    const result = await db
      .select({
        id: communities.id,
        name: communities.name,
        description: communities.description,
        slug: communities.slug,
        creatorId: communities.creatorId,
        imageUrl: communities.imageUrl,
        isPrivate: communities.isPrivate,
        createdAt: communities.createdAt,
        role: communityMembers.role,
      })
      .from(communityMembers)
      .innerJoin(communities, eq(communityMembers.communityId, communities.id))
      .where(eq(communityMembers.userId, userId));

    return result;
  }

  async getModeratedCommunities(userId: number): Promise<(Community & { role: string })[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare(`
        SELECT c.*, cm.role
        FROM community_members cm
        JOIN communities c ON cm.community_id = c.id
        WHERE cm.user_id = ? AND (cm.role = 'owner' OR cm.role = 'moderator')
      `).all(userId);

      return rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        slug: row.slug,
        creatorId: row.creator_id,
        imageUrl: row.image_url,
        isPrivate: Boolean(row.is_private),
        createdAt: isNaN(Number(row.created_at)) ? new Date(row.created_at) : new Date(Number(row.created_at) * 1000),
        role: row.role,
      }));
    }

    const result = await db
      .select({
        id: communities.id,
        name: communities.name,
        description: communities.description,
        slug: communities.slug,
        creatorId: communities.creatorId,
        imageUrl: communities.imageUrl,
        isPrivate: communities.isPrivate,
        createdAt: communities.createdAt,
        role: communityMembers.role,
      })
      .from(communityMembers)
      .innerJoin(communities, eq(communityMembers.communityId, communities.id))
      .where(and(eq(communityMembers.userId, userId), or(eq(communityMembers.role, "owner"), eq(communityMembers.role, "moderator"))));

    return result;
  }

  // Requests
  async addJoinRequest(communityId: number, userId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const createdAt = Math.floor(Date.now() / 1000);
      sqlite.prepare("INSERT INTO community_join_requests (community_id, user_id, status, created_at) VALUES (?, ?, 'pending', ?)").run(communityId, userId, createdAt);
      return;
    }
    await db.insert(communityJoinRequests).values({ communityId, userId, status: 'pending' });
  }

  async updateJoinRequestStatus(communityId: number, userId: number, status: string): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE community_join_requests SET status = ? WHERE community_id = ? AND user_id = ? AND status = 'pending'").run(status, communityId, userId);
      return;
    }
    await db.update(communityJoinRequests).set({ status }).where(and(eq(communityJoinRequests.communityId, communityId), eq(communityJoinRequests.userId, userId), eq(communityJoinRequests.status, "pending")));
  }

  async getJoinRequest(communityId: number, userId: number): Promise<any | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const row: any = sqlite.prepare("SELECT * FROM community_join_requests WHERE community_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1").get(communityId, userId);
      if (!row) return undefined;
      return {
        id: row.id,
        communityId: row.community_id,
        userId: row.user_id,
        status: row.status,
        createdAt: isNaN(Number(row.created_at)) ? new Date(row.created_at) : new Date(Number(row.created_at) * 1000),
      };
    }
    const [request] = await db.select().from(communityJoinRequests).where(and(eq(communityJoinRequests.communityId, communityId), eq(communityJoinRequests.userId, userId))).orderBy(desc(communityJoinRequests.createdAt)).limit(1);
    return request;
  }

  async getCommunityJoinRequests(communityId: number): Promise<any[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare(`
        SELECT r.*, u.username FROM community_join_requests r
        JOIN users u ON r.user_id = u.id
        WHERE r.community_id = ? AND r.status = 'pending'
        ORDER BY r.created_at DESC
      `).all(communityId);
      
      return rows.map((row: any) => ({
        id: row.id,
        communityId: row.community_id,
        userId: row.user_id,
        status: row.status,
        createdAt: isNaN(Number(row.created_at)) ? new Date(row.created_at) : new Date(Number(row.created_at) * 1000),
        user: { id: row.user_id, username: row.username }
      }));
    }
    const result = await db.select({
      id: communityJoinRequests.id,
      communityId: communityJoinRequests.communityId,
      userId: communityJoinRequests.userId,
      status: communityJoinRequests.status,
      createdAt: communityJoinRequests.createdAt,
      username: users.username,
    }).from(communityJoinRequests).innerJoin(users, eq(communityJoinRequests.userId, users.id)).where(and(eq(communityJoinRequests.communityId, communityId), eq(communityJoinRequests.status, "pending"))).orderBy(desc(communityJoinRequests.createdAt));

    return result.map(row => ({
      id: row.id,
      communityId: row.communityId,
      userId: row.userId,
      status: row.status,
      createdAt: row.createdAt,
      user: { id: row.userId, username: row.username }
    }));
  }

  // Bans
  async banUserFromCommunity(communityId: number, userId: number, reason?: string): Promise<CommunityBan> {
    await this.removeCommunityMember(communityId, userId);
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const bannedAt = Math.floor(Date.now() / 1000);
      const info = sqlite.prepare("INSERT INTO community_bans (community_id, user_id, reason, banned_at) VALUES (?, ?, ?, ?)").run(communityId, userId, reason || null, bannedAt);
      const ban = sqlite.prepare("SELECT * FROM community_bans WHERE id = ?").get(info.lastInsertRowid);
      return { ...ban, bannedAt: new Date(ban.banned_at * 1000) };
    }
    const [ban] = await db.insert(communityBans).values({ communityId, userId, reason }).returning();
    return ban;
  }

  async unbanUserFromCommunity(communityId: number, userId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM community_bans WHERE community_id = ? AND user_id = ?").run(communityId, userId);
      return;
    }
    await db.delete(communityBans).where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, userId)));
  }

  async isUserBannedFromCommunity(communityId: number, userId: number): Promise<boolean> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const ban = sqlite.prepare("SELECT 1 FROM community_bans WHERE community_id = ? AND user_id = ?").get(communityId, userId);
      return !!ban;
    }
    const [ban] = await db.select().from(communityBans).where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, userId)));
    return !!ban;
  }

  async getCommunityBans(communityId: number): Promise<(CommunityBan & { user: User })[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare(`
        SELECT cb.*, u.username, u.profile_picture_url
        FROM community_bans cb
        JOIN users u ON cb.user_id = u.id
        WHERE cb.community_id = ?
      `).all(communityId);
      return rows.map((row: any) => ({
        id: row.id,
        communityId: row.community_id,
        userId: row.user_id,
        reason: row.reason,
        bannedAt: new Date(Number(row.banned_at) * 1000),
        user: { id: row.user_id, username: row.username, profilePictureUrl: row.profile_picture_url } as User
      }));
    }
    const bans = await db.select({
      id: communityBans.id,
      communityId: communityBans.communityId,
      userId: communityBans.userId,
      reason: communityBans.reason,
      bannedAt: communityBans.bannedAt,
      username: users.username,
      profilePictureUrl: users.profilePictureUrl,
    }).from(communityBans).innerJoin(users, eq(communityBans.userId, users.id)).where(eq(communityBans.communityId, communityId));

    return bans.map(row => ({
      id: row.id,
      communityId: row.communityId,
      userId: row.userId,
      reason: row.reason,
      bannedAt: row.bannedAt,
      user: { id: row.userId, username: row.username, profilePictureUrl: row.profilePictureUrl } as User
    }));
  }

  async getCommunityReports(communityId: number): Promise<Report[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare(`
        SELECT r.* FROM reports r
        LEFT JOIN posts p ON r.post_id = p.id
        LEFT JOIN comments c ON r.comment_id = c.id
        LEFT JOIN posts pc ON c.post_id = pc.id
        WHERE (p.community_id = ? OR pc.community_id = ?)
        ORDER BY r.created_at DESC
      `).all(communityId, communityId);
      return rows.map((row: any) => ({
        id: row.id,
        reason: row.reason,
        reporterId: row.reporter_id,
        postId: row.post_id,
        commentId: row.comment_id,
        discussionId: row.discussion_id,
        ipAddress: row.ip_address,
        status: row.status,
        createdAt: new Date(row.created_at * 1000),
      }));
    }
    const communityPosts = await db.select({ id: posts.id }).from(posts).where(eq(posts.communityId, communityId));
    const postIds = communityPosts.map(p => p.id);
    const communityComments = await db.select({ id: comments.id }).from(comments).where(inArray(comments.postId, postIds.length > 0 ? postIds : [-1]));
    const commentIds = communityComments.map(c => c.id);
    return await db.select().from(reports).where(or(inArray(reports.postId, postIds.length > 0 ? postIds : [-1]), inArray(reports.commentId, commentIds.length > 0 ? commentIds : [-1]))).orderBy(desc(reports.createdAt));
  }
}
