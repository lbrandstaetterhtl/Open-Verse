import {
  User,
  Post,
  Comment,
  Report,
  InsertUser,
  InsertMediaPost,
  Notification,
  Message,
  followers,
  notifications,
  messages,
  verificationTokens,
  commentLikes,
  Theme,
  InsertTheme,
  themes,
  InsertCommunity,
  Community,
  CommunityMember,
  CommunityBan,
} from "@shared/schema";
import session from "express-session";
import { db, getSqlite } from "./db";
import { eq, and, or, desc, asc, sql, inArray } from "drizzle-orm";
import {
  users,
  posts,
  comments,
  reports,
  postLikes,
  communities,
  communityMembers,
  communityBans,
} from "@shared/schema";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserProfile(
    id: number,
    profile: Partial<{
      username: string;
      email: string;
      profilePictureUrl: string;
      isAdmin: boolean;
      role: string;
      emailVerified: boolean;
      verified: boolean;
      karma: number;
      bio: string;
    }>,
  ): Promise<User>;
  updateUserPassword(id: number, password: string): Promise<User>;
  updateUserKarma(id: number, karma: number): Promise<void>;

  createPost(post: Omit<Post, "id" | "createdAt" | "karma">): Promise<Post>;
  getPosts(category?: string): Promise<Post[]>;
  getPost(id: number): Promise<Post | undefined>;
  updatePostKarma(id: number, karma: number): Promise<Post>;

  createComment(comment: Omit<Comment, "id" | "createdAt" | "karma">): Promise<Comment>;
  getComments(postId: number): Promise<Comment[]>;
  updateCommentKarma(id: number, karma: number): Promise<Comment>;
  getComment(id: number): Promise<Comment | undefined>;
  deleteComment(id: number): Promise<void>;

  createReport(report: Omit<Report, "id" | "createdAt" | "status">): Promise<Report>;
  getReports(): Promise<Report[]>;
  getCommunityReports(communityId: number): Promise<Report[]>;
  updateReportStatus(id: number, status: string): Promise<Report>;

  sessionStore: session.Store;
  createVerificationToken(token: { token: string; userId: number; expiresAt: Date }): Promise<void>;

  getVerificationToken(token: string): Promise<
    | {
        token: string;
        userId: number;
        expiresAt: Date;
      }
    | undefined
  >;

  deleteVerificationToken(token: string): Promise<void>;
  verifyUserEmail(userId: number): Promise<void>;
  createPostLike(userId: number, postId: number, isLike: boolean): Promise<void>;
  removePostReaction(userId: number, postId: number): Promise<void>;
  getUserPostReaction(userId: number, postId: number): Promise<{ isLike: boolean } | null>;
  getPostReactions(postId: number): Promise<{ likes: number; dislikes: number }>;

  // Followers
  followUser(followerId: number, followingId: number): Promise<void>;
  unfollowUser(followerId: number, followingId: number): Promise<void>;
  getFollowers(userId: number): Promise<User[]>;
  getFollowing(userId: number): Promise<User[]>;
  isFollowing(followerId: number, followingId: number): Promise<boolean>;

  // Notifications
  createNotification(notification: {
    userId: number;
    type: string;
    fromUserId: number;
  }): Promise<Notification>;
  getNotifications(userId: number): Promise<Notification[]>;
  markNotificationAsRead(notificationId: number): Promise<void>;
  deleteNotification(notificationId: number): Promise<void>;

  // Messages
  createMessage(message: {
    senderId: number;
    receiverId: number;
    content: string;
  }): Promise<Message>;
  getMessages(userId1: number, userId2: number): Promise<Message[]>;
  getUnreadMessageCount(userId: number): Promise<number>;

  deleteComments(postId: number): Promise<void>;
  deleteUserPosts(userId: number): Promise<void>;
  deleteUserComments(userId: number): Promise<void>;
  deleteReports(postId: number): Promise<void>;
  deletePost(postId: number): Promise<void>;

  // Add new methods for admin features
  getUsers(): Promise<User[]>;
  getReport(id: number): Promise<Report | undefined>;
  deleteUser(id: number): Promise<void>;

  // Add new methods for comment likes
  likeComment(userId: number, commentId: number): Promise<void>;
  unlikeComment(userId: number, commentId: number): Promise<void>;
  getUserCommentLike(userId: number, commentId: number): Promise<boolean>;
  getCommentLikes(commentId: number): Promise<number>;

  // Add new method for active users count
  getActiveUsersCount(since: Date): Promise<number>;

  // Add methods for tracking deleted users
  getDeletedUsersCount(): number;
  incrementDeletedUsersCount(): void;

  // Themes
  createTheme(userId: number, theme: InsertTheme): Promise<Theme>;
  getThemes(userId: number): Promise<Theme[]>;
  deleteTheme(id: number): Promise<void>;
  updateTheme(id: number, theme: Partial<InsertTheme>): Promise<Theme>;

  // Communities
  createCommunity(
    community: InsertCommunity & { creatorId: number; slug: string },
  ): Promise<Community>;
  getCommunity(id: number): Promise<Community | undefined>;
  getCommunityBySlug(slug: string): Promise<Community | undefined>;
  getCommunities(): Promise<Community[]>;
  getCommunityFeedPosts(userId: number): Promise<Post[]>;

  // Community Members
  addCommunityMember(communityId: number, userId: number, role?: string): Promise<CommunityMember>;
  removeCommunityMember(communityId: number, userId: number): Promise<void>;
  getCommunityMember(communityId: number, userId: number): Promise<CommunityMember | undefined>;
  getCommunityMembers(communityId: number): Promise<(CommunityMember & { user: User })[]>;
  getUserCommunities(userId: number): Promise<(Community & { role: string })[]>;
  getModeratedCommunities(userId: number): Promise<Community[]>;

  // Community Bans
  banUserFromCommunity(communityId: number, userId: number, reason?: string): Promise<CommunityBan>;
  unbanUserFromCommunity(communityId: number, userId: number): Promise<void>;
  isUserBannedFromCommunity(communityId: number, userId: number): Promise<boolean>;
  getCommunityBans(communityId: number): Promise<(CommunityBan & { user: User })[]>;
}

// Helper to strip sensitive data

// Helper to strip sensitive data
export function sanitizeUser(user: any): User {
  const { password, ...safeUser } = user;
  return safeUser as User;
}

export class DatabaseStorage implements IStorage {
  public sessionStore: session.Store;
  private deletedUsersCount: number = 0;

  constructor() {
    if (process.env.USE_SQLITE === "true") {
      this.sessionStore = new session.MemoryStore();

      // Initialize stats table
      const sqlite = getSqlite();
      if (sqlite) {
        sqlite.exec(`
          CREATE TABLE IF NOT EXISTS global_stats (
            key TEXT PRIMARY KEY, 
            value INTEGER DEFAULT 0
          )
        `);
        // Ensure the counter row exists
        sqlite.exec(
          `INSERT OR IGNORE INTO global_stats (key, value) VALUES ('deleted_users_count', 0)`,
        );

        try {
          sqlite.exec("ALTER TABLE users ADD COLUMN bio TEXT");
        } catch (e) {
          // Column likely exists
        }

        try {
          sqlite.exec("ALTER TABLE reports ADD COLUMN ip_address TEXT");
        } catch (e) {
          // Column likely exists
        }

        try {
          sqlite.exec(
            "ALTER TABLE communities ADD COLUMN allowed_categories TEXT DEFAULT 'news,entertainment,discussion'",
          );
        } catch (e) {
          // Column likely exists
        }
      }
    } else {
      this.sessionStore = new PostgresSessionStore({
        pool: pool ?? undefined,
        createTableIfMissing: true,
      });
    }
  }

  async getUser(id: number): Promise<User | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const user = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(id);
      if (!user) return undefined;

      return {
        ...user,
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        createdAt: new Date(Number(user.created_at) * 1000),
      };
    }
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const user = sqlite.prepare("SELECT * FROM users WHERE username = ?").get(username);
      if (!user) return undefined;

      return {
        ...user,
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        createdAt: new Date(Number(user.created_at) * 1000),
      };
    }
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const user = sqlite.prepare("SELECT * FROM users WHERE email = ?").get(email);
      if (!user) return undefined;

      return {
        ...sanitizeUser(user),
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        createdAt: new Date(Number(user.created_at) * 1000),
      };
    }
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user ? sanitizeUser(user) : undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const stmt = sqlite.prepare(`
        INSERT INTO users (username, email, password, email_verified, is_admin, role, verified, created_at)
        VALUES (@username, @email, @password, @emailVerified, 0, 'user', 0, strftime('%s', 'now'))
      `);

      const info = stmt.run({
        username: insertUser.username,
        email: insertUser.email,
        password: insertUser.password,
        emailVerified: 0,
      });

      const user = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);

      // Convert SQLite integers (0/1) back to booleans for the app
      return {
        ...sanitizeUser(user),
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        createdAt: new Date(user.created_at * 1000),
      };
    }

    const [user] = await db.insert(users).values(insertUser).returning();
    return sanitizeUser(user);
  }

  async updateUserProfile(
    id: number,
    profile: Partial<{
      username: string;
      email: string;
      profilePictureUrl: string;
      isAdmin: boolean;
      role: string;
      emailVerified: boolean;
      verified: boolean;
      karma: number;
      bio: string;
    }>,
  ): Promise<User> {
    const updateData: Record<string, any> = {};
    if (profile.username) updateData.username = profile.username;
    if (profile.email) updateData.email = profile.email;
    if (profile.profilePictureUrl) updateData.profilePictureUrl = profile.profilePictureUrl;
    if (typeof profile.isAdmin !== "undefined") updateData.isAdmin = profile.isAdmin;
    if (typeof profile.karma !== "undefined") updateData.karma = profile.karma;
    if (profile.bio) updateData.bio = profile.bio;
    if (profile.role) {
      updateData.role = profile.role;
      // Ensure owner is always verified and email verified
      if (profile.role === "owner") {
        updateData.verified = true;
        updateData.emailVerified = true;
      }
    }
    if (typeof profile.emailVerified !== "undefined")
      updateData.emailVerified = profile.emailVerified;
    if (typeof profile.verified !== "undefined") updateData.verified = profile.verified;

    console.log("Updating user profile with data:", updateData); // Debug log

    if (Object.keys(updateData).length === 0) {
      return this.getUser(id) as Promise<User>;
    }

    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const sets: string[] = [];
      const params: any = { id };

      // Manual mapping of fields
      if (updateData.username) {
        sets.push("username = @username");
        params.username = updateData.username;
      }
      if (updateData.email) {
        sets.push("email = @email");
        params.email = updateData.email;
      }
      if (updateData.profilePictureUrl) {
        sets.push("profile_picture_url = @profilePictureUrl");
        params.profilePictureUrl = updateData.profilePictureUrl;
      }
      if (updateData.isAdmin !== undefined) {
        sets.push("is_admin = @isAdmin");
        params.isAdmin = updateData.isAdmin ? 1 : 0;
      }
      if (updateData.karma !== undefined) {
        sets.push("karma = @karma");
        params.karma = updateData.karma;
      }
      if (updateData.bio) {
        sets.push("bio = @bio");
        params.bio = updateData.bio;
      }
      if (updateData.role) {
        sets.push("role = @role");
        params.role = updateData.role;
      }
      if (updateData.emailVerified !== undefined) {
        sets.push("email_verified = @emailVerified");
        params.emailVerified = updateData.emailVerified ? 1 : 0;
      }
      if (updateData.verified !== undefined) {
        sets.push("verified = @verified");
        params.verified = updateData.verified ? 1 : 0;
      }

      const stmt = sqlite.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = @id`);
      stmt.run(params);

      const user = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(id);
      return {
        ...sanitizeUser(user),
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        createdAt: new Date(Number(user.created_at) * 1000),
      };
    }

    const [user] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();

    console.log("Updated user:", user); // Debug log
    console.log("Updated user:", user); // Debug log
    return sanitizeUser(user);
  }

  async updateUserPassword(id: number, password: string): Promise<User> {
    const [user] = await db.update(users).set({ password }).where(eq(users.id, id)).returning();
    return sanitizeUser(user);
  }

  async createPost(post: Omit<Post, "id" | "createdAt" | "karma">): Promise<Post> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const stmt = sqlite.prepare(`
        INSERT INTO posts (title, content, author_id, category, karma, media_url, media_type, community_id, created_at)
        VALUES (@title, @content, @authorId, @category, 0, @mediaUrl, @mediaType, @communityId, strftime('%s', 'now'))
      `);

      const info = stmt.run({
        title: post.title,
        content: post.content,
        authorId: post.authorId,
        category: post.category,
        mediaUrl: post.mediaUrl || null,
        mediaType: post.mediaType || null,
        communityId: post.communityId || null,
      });

      const newPost = sqlite.prepare("SELECT * FROM posts WHERE id = ?").get(info.lastInsertRowid);
      return {
        ...newPost,
        createdAt: new Date(Number(newPost.created_at) * 1000),
      };
    }

    const [newPost] = await db.insert(posts).values(post).returning();
    return newPost;
  }

  async getPosts(category?: string): Promise<Post[]> {
    console.log("Getting posts with category:", category);
    console.log("DEBUG: env.USE_SQLITE:", process.env.USE_SQLITE);
    const sqlite = getSqlite();
    console.log("DEBUG: sqlite instance:", sqlite ? "Present" : "Missing");

    if (process.env.USE_SQLITE === "true" && sqlite) {
      let query = "SELECT * FROM posts";
      const params: any[] = [];

      if (category) {
        if (category.includes(",")) {
          const categories = category.split(",").map((c) => c.trim());
          query += ` WHERE category IN (${categories.map(() => "?").join(",")})`;
          params.push(...categories);
        } else {
          query += " WHERE category = ?";
          params.push(category);
        }
      }

      query += " ORDER BY created_at DESC";

      const rows = sqlite.prepare(query).all(...params);
      if (rows.length > 0)
        console.log(
          "DEBUG: First row keys:",
          Object.keys(rows[0]),
          "Sample created_at:",
          rows[0].created_at,
        );

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
        createdAt: new Date(Number(row.created_at) * 1000),
      }));
    }

    if (category) {
      // Handle multiple categories separated by comma
      if (category.includes(",")) {
        const categories = category.split(",");
        console.log("Querying multiple categories:", categories);

        const result = await db
          .select()
          .from(posts)
          .where(or(...categories.map((cat) => eq(posts.category, cat.trim()))))
          .orderBy(desc(posts.createdAt));

        console.log("Found posts for categories:", result);
        return result;
      }

      // Single category
      console.log("Querying single category:", category);
      const result = await db
        .select()
        .from(posts)
        .where(eq(posts.category, category))
        .orderBy(desc(posts.createdAt));

      console.log("Found posts for category:", result);
      return result;
    }

    // No category filter
    const result = await db.select().from(posts).orderBy(desc(posts.createdAt));

    console.log("Found all posts:", result);
    return result;
  }

  async getPostsByUser(userId: number): Promise<Post[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const allPosts = sqlite
        .prepare("SELECT * FROM posts WHERE author_id = ? ORDER BY created_at DESC")
        .all(userId);

      return allPosts.map((row: any) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        authorId: row.author_id,
        category: row.category,
        karma: row.karma,
        mediaUrl: row.media_url,
        mediaType: row.media_type,
        communityId: row.community_id || null,
        createdAt: new Date(Number(row.created_at) * 1000),
      }));
    }

    return await db
      .select()
      .from(posts)
      .where(eq(posts.authorId, userId))
      .orderBy(desc(posts.createdAt));
  }

  async getPost(id: number): Promise<Post | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const row = sqlite.prepare("SELECT * FROM posts WHERE id = ?").get(id) as any;
      if (!row) return undefined;

      return {
        id: row.id,
        title: row.title,
        content: row.content,
        authorId: row.author_id,
        category: row.category,
        karma: row.karma,
        mediaUrl: row.media_url,
        mediaType: row.media_type,
        communityId: row.community_id || null,
        createdAt: new Date(Number(row.created_at) * 1000),
      };
    }
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post;
  }

  async updatePostKarma(id: number, karma: number): Promise<Post> {
    const [post] = await db.update(posts).set({ karma }).where(eq(posts.id, id)).returning();
    return post;
  }

  async createComment(comment: Omit<Comment, "id" | "createdAt" | "karma">): Promise<Comment> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const createdAt = Math.floor(Date.now() / 1000);
      const stmt = sqlite.prepare(
        "INSERT INTO comments (post_id, content, author_id, karma, created_at) VALUES (?, ?, ?, ?, ?)",
      );
      const result = stmt.run(comment.postId, comment.content, comment.authorId, 0, createdAt);

      return {
        id: result.lastInsertRowid as number,
        postId: comment.postId,
        content: comment.content,
        authorId: comment.authorId,
        karma: 0,
        createdAt: new Date(createdAt * 1000),
      };
    }
    const [newComment] = await db.insert(comments).values(comment).returning();
    return newComment;
  }

  async getComments(postId: number): Promise<Comment[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC")
        .all(postId);
      return rows.map((comment: any) => ({
        id: comment.id,
        postId: comment.post_id,
        content: comment.content,
        authorId: comment.author_id,
        karma: comment.karma,
        createdAt: new Date(Number(comment.created_at) * 1000),
      }));
    }
    return db.select().from(comments).where(eq(comments.postId, postId));
  }

  async updateCommentKarma(id: number, karma: number): Promise<Comment> {
    const [comment] = await db
      .update(comments)
      .set({ karma })
      .where(eq(comments.id, id))
      .returning();
    return comment;
  }

  async deleteUserPosts(userId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM posts WHERE author_id = ?").run(userId);
      return;
    }
    await db.delete(posts).where(eq(posts.authorId, userId));
  }

  async deleteUserComments(userId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM comments WHERE author_id = ?").run(userId);
      return;
    }
    await db.delete(comments).where(eq(comments.authorId, userId));
  }

  async getCommentsByUser(userId: number): Promise<Comment[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare("SELECT * FROM comments WHERE author_id = ? ORDER BY created_at DESC")
        .all(userId);
      return rows.map((comment: any) => ({
        id: comment.id,
        postId: comment.post_id,
        content: comment.content,
        authorId: comment.author_id,
        karma: comment.karma,
        createdAt: new Date(Number(comment.created_at) * 1000),
      }));
    }
    return db
      .select()
      .from(comments)
      .where(eq(comments.authorId, userId))
      .orderBy(desc(comments.createdAt));
  }

  async createReport(report: Omit<Report, "id" | "createdAt" | "status">): Promise<Report> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const { reporterId, postId, commentId, discussionId, reason, ipAddress } = report;
      const createdAt = Math.floor(Date.now() / 1000);
      const res = sqlite
        .prepare(
          "INSERT INTO reports (reporter_id, post_id, comment_id, discussion_id, ip_address, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          reporterId,
          postId || null,
          commentId || null,
          discussionId || null,
          ipAddress || null,
          reason,
          "pending",
          createdAt,
        );
      return {
        id: res.lastInsertRowid as number,
        reporterId,
        postId: postId || null,
        commentId: commentId || null,
        discussionId: discussionId || null,
        ipAddress: report.ipAddress || null,
        reason,
        status: "pending",
        createdAt: new Date(createdAt * 1000),
      };
    }

    console.log("Creating report with data:", report);
    const [newReport] = await db
      .insert(reports)
      .values({ ...report, status: "pending" })
      .returning();
    console.log("Created report:", newReport);
    return newReport;
  }

  async getReports(): Promise<Report[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      console.log("Fetching all reports (SQLite)");
      const rows = sqlite.prepare("SELECT * FROM reports ORDER BY created_at DESC").all();
      return rows.map((row: any) => {
        let createdAt;
        if (typeof row.created_at === "number") {
          createdAt = new Date(row.created_at * 1000);
        } else {
          createdAt = new Date(row.created_at);
        }
        return {
          id: row.id,
          reason: row.reason,
          status: row.status,
          createdAt: createdAt,
          reporterId: row.reporter_id,
          postId: row.post_id,
          commentId: row.comment_id,
          discussionId: row.discussion_id,
          ipAddress: row.ip_address,
        };
      });
    }

    console.log("Fetching all reports (Drizzle)");
    const result = await db.select().from(reports).orderBy(desc(reports.createdAt));
    return result;
  }

  async createVerificationToken(token: {
    token: string;
    userId: number;
    expiresAt: Date;
  }): Promise<void> {
    await db.insert(verificationTokens).values(token);
  }

  async getVerificationToken(token: string) {
    const [verificationToken] = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.token, token));
    return verificationToken;
  }

  async deleteVerificationToken(token: string): Promise<void> {
    await db.delete(verificationTokens).where(eq(verificationTokens.token, token));
  }

  async verifyUserEmail(userId: number): Promise<void> {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
  }

  // Followers
  async followUser(followerId: number, followingId: number): Promise<void> {
    await db.insert(followers).values({ followerId, followingId });
  }

  async unfollowUser(followerId: number, followingId: number): Promise<void> {
    await db
      .delete(followers)
      .where(and(eq(followers.followerId, followerId), eq(followers.followingId, followingId)));
  }

  async getFollowers(userId: number): Promise<User[]> {
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        karma: users.karma,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
      })
      .from(followers)
      .innerJoin(users, eq(followers.followerId, users.id))
      .where(eq(followers.followingId, userId));

    return result;
  }

  async getFollowing(userId: number): Promise<User[]> {
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        karma: users.karma,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
      })
      .from(followers)
      .innerJoin(users, eq(followers.followingId, users.id))
      .where(eq(followers.followerId, userId));

    return result;
  }

  async isFollowing(followerId: number, followingId: number): Promise<boolean> {
    const [result] = await db
      .select()
      .from(followers)
      .where(and(eq(followers.followerId, followerId), eq(followers.followingId, followingId)));

    return !!result;
  }

  async getNotifications(userId: number): Promise<Notification[]> {
    const result = await db
      .select({
        id: notifications.id,
        userId: notifications.userId,
        type: notifications.type,
        fromUserId: notifications.fromUserId,
        read: notifications.read,
        createdAt: notifications.createdAt,
        fromUser: {
          username: users.username,
        },
      })
      .from(notifications)
      .innerJoin(users, eq(users.id, notifications.fromUserId))
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));

    return result;
  }

  async markNotificationAsRead(notificationId: number): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, notificationId));
  }

  async deleteNotification(notificationId: number): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, notificationId));
  }

  // Messages

  async createMessage(message: {
    senderId: number;
    receiverId: number;
    content: string;
  }): Promise<Message> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      try {
        console.log("Attempting to create message (SQLite):", message);
        const createdAt = Math.floor(Date.now() / 1000);
        const stmt = sqlite.prepare(
          "INSERT INTO messages (sender_id, receiver_id, content, read, created_at) VALUES (?, ?, ?, 0, ?)",
        );
        const res = stmt.run(message.senderId, message.receiverId, message.content, createdAt);
        console.log("Message created, ID:", res.lastInsertRowid);

        // Create notification
        try {
          await this.createNotification({
            userId: message.receiverId,
            type: "new_message",
            fromUserId: message.senderId,
          });
        } catch (notifErr) {
          console.error("Failed to create message notification:", notifErr);
          // Don't fail the request if notification fails
        }

        return {
          id: res.lastInsertRowid as number,
          senderId: message.senderId,
          receiverId: message.receiverId,
          content: message.content,
          read: false,
          createdAt: new Date(createdAt * 1000),
        };
      } catch (err: any) {
        console.error("SQLite createMessage error:", err.message);
        throw err;
      }
    }

    console.log("Falling back to Drizzle implementation for createMessage");
    const [newMessage] = await db.insert(messages).values(message).returning();

    // Create notification
    try {
      await this.createNotification({
        userId: message.receiverId,
        type: "new_message",
        fromUserId: message.senderId,
      });
    } catch (notifErr) {
      console.error("Failed to create message notification:", notifErr);
    }

    return newMessage;
  }

  async getMessages(userId1: number, userId2: number): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(
        or(
          and(eq(messages.senderId, userId1), eq(messages.receiverId, userId2)),
          and(eq(messages.senderId, userId2), eq(messages.receiverId, userId1)),
        ),
      )
      .orderBy(asc(messages.createdAt));
  }

  async getUnreadMessageCount(userId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(and(eq(messages.receiverId, userId), eq(messages.read, false)));

    return result[0].count;
  }

  async deleteReportsForComment(commentId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM reports WHERE comment_id = ?").run(commentId);
      return;
    }
    await db.delete(reports).where(eq(reports.commentId, commentId));
  }

  async deleteComment(id: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM comment_likes WHERE comment_id = ?").run(id);
      sqlite.prepare("DELETE FROM reports WHERE comment_id = ?").run(id);
      sqlite.prepare("DELETE FROM comments WHERE id = ?").run(id);
      return;
    }

    await db.delete(commentLikes).where(eq(commentLikes.commentId, id));
    await this.deleteReportsForComment(id);
    await db.delete(comments).where(eq(comments.id, id));
  }

  async deleteComments(postId: number): Promise<void> {
    console.log("Deleting comments for post:", postId);
    try {
      // First get all comments
      const commentsToDelete = await db.select().from(comments).where(eq(comments.postId, postId));

      // Delete reports for each comment
      for (const comment of commentsToDelete) {
        await this.deleteReportsForComment(comment.id); //using new function
      }

      // Then delete all comments
      await db.delete(comments).where(eq(comments.postId, postId));
      console.log("Successfully deleted comments for post:", postId);
    } catch (error) {
      console.error("Error deleting comments:", error);
      throw error;
    }
  }

  async getComment(id: number): Promise<Comment | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const comment = sqlite.prepare("SELECT * FROM comments WHERE id = ?").get(id) as any;
      if (!comment) return undefined;
      return {
        id: comment.id,
        postId: comment.post_id,
        content: comment.content,
        authorId: comment.author_id,
        karma: comment.karma,
        createdAt: new Date(Number(comment.created_at) * 1000),
      };
    }
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    return comment;
  }

  async deletePostReactions(postId: number): Promise<void> {
    console.log("Deleting reactions for post:", postId);
    try {
      await db.delete(postLikes).where(eq(postLikes.postId, postId));
      console.log("Successfully deleted reactions for post:", postId);
    } catch (error) {
      console.error("Error deleting reactions:", error);
      throw error;
    }
  }

  async deleteReports(postId: number): Promise<void> {
    console.log("Deleting reports for post:", postId);
    try {
      await db
        .delete(reports)
        .where(or(eq(reports.postId, postId), eq(reports.discussionId, postId)));
      console.log("Successfully deleted reports for post:", postId);
    } catch (err: any) {
      console.error("SQLite createMessage error string:", err.message);
      throw err;
    }
  }

  async deletePost(postId: number): Promise<void> {
    console.log("Starting post deletion:", postId); // Debug log

    try {
      // First delete all comments (which will also handle comment reports)
      await this.deleteComments(postId);
      console.log("Deleted comments for post:", postId);

      // Then delete reactions
      await this.deletePostReactions(postId);
      console.log("Deleted reactions for post:", postId);

      // DO NOT delete reports - they should remain for historical tracking
      // Reports will show that content was deleted when admin resolves them

      // Finally delete the post itself
      await db.delete(posts).where(eq(posts.id, postId));
      console.log("Successfully deleted post:", postId);
    } catch (error) {
      console.error("Error during post deletion:", error);
      throw error; // Re-throw to handle in the route
    }
  }
  async getUsers(): Promise<User[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
      return rows.map((user: any) => ({
        ...user,
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        createdAt: new Date(Number(user.created_at) * 1000),
      }));
    }
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getReport(id: number): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report;
  }
  async deleteUser(id: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      console.log("Deleting user and all related data (SQLite):", id);
      sqlite.prepare("DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?").run(id, id);
      sqlite.prepare("DELETE FROM notifications WHERE user_id = ? OR from_user_id = ?").run(id, id);
      sqlite.prepare("DELETE FROM followers WHERE follower_id = ? OR following_id = ?").run(id, id);
      sqlite.prepare("DELETE FROM comment_likes WHERE user_id = ?").run(id);
      sqlite.prepare("DELETE FROM post_likes WHERE user_id = ?").run(id);
      sqlite.prepare("DELETE FROM comments WHERE author_id = ?").run(id);
      sqlite.prepare("DELETE FROM reports WHERE reporter_id = ?").run(id);
      sqlite.prepare("DELETE FROM posts WHERE author_id = ?").run(id);
      sqlite.prepare("DELETE FROM users WHERE id = ?").run(id);
      console.log("User deleted successfully:", id);

      // Increment deleted users counter
      this.incrementDeletedUsersCount();
      return;
    }

    // Drizzle: Delete all user-related data
    await db.delete(postLikes).where(eq(postLikes.userId, id));
    await db.delete(comments).where(eq(comments.authorId, id));
    await db.delete(posts).where(eq(posts.authorId, id));
    await db.delete(reports).where(eq(reports.reporterId, id));
    await db
      .delete(followers)
      .where(or(eq(followers.followerId, id), eq(followers.followingId, id)));
    await db.delete(users).where(eq(users.id, id));
  }

  // Themes
  async createTheme(userId: number, theme: InsertTheme): Promise<Theme> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const createdAt = Math.floor(Date.now() / 1000);
      const stmt = sqlite.prepare(
        "INSERT INTO themes (user_id, name, colors, created_at) VALUES (?, ?, ?, ?)",
      );
      const result = stmt.run(userId, theme.name, theme.colors, createdAt);

      return {
        id: result.lastInsertRowid as number,
        userId,
        name: theme.name,
        colors: theme.colors,
        createdAt: new Date(createdAt * 1000),
      };
    }

    const [newTheme] = await db
      .insert(themes)
      .values({ ...theme, userId })
      .returning();
    return newTheme;
  }

  async getThemes(userId: number): Promise<Theme[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare("SELECT * FROM themes WHERE user_id = ? ORDER BY created_at DESC")
        .all(userId);
      return rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        colors: row.colors,
        createdAt: new Date(Number(row.created_at) * 1000),
      }));
    }

    return db
      .select()
      .from(themes)
      .where(eq(themes.userId, userId))
      .orderBy(desc(themes.createdAt));
  }

  async deleteTheme(id: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM themes WHERE id = ?").run(id);
      return;
    }
    await db.delete(themes).where(eq(themes.id, id));
  }

  async updateTheme(id: number, theme: Partial<InsertTheme>): Promise<Theme> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const sets: string[] = [];
      const params: any[] = [];
      if (theme.name) {
        sets.push("name = ?");
        params.push(theme.name);
      }
      if (theme.colors) {
        sets.push("colors = ?");
        params.push(theme.colors);
      }

      params.push(id); // for WHERE id = ?

      sqlite.prepare(`UPDATE themes SET ${sets.join(", ")} WHERE id = ?`).run(...params);

      const updated = sqlite.prepare("SELECT * FROM themes WHERE id = ?").get(id) as any;
      return {
        id: updated.id,
        userId: updated.user_id,
        name: updated.name,
        colors: updated.colors,
        createdAt: new Date(Number(updated.created_at) * 1000),
      };
    }

    // Drizzle
    const [updated] = await db.update(themes).set(theme).where(eq(themes.id, id)).returning();
    return updated;
  }

  async updateAllReportsForContent(
    postId: number | null,
    commentId: number | null,
    discussionId: number | null,
    status: string,
  ): Promise<void> {
    const conditions = [];
    if (postId) conditions.push(eq(reports.postId, postId));
    if (commentId) conditions.push(eq(reports.commentId, commentId));
    if (discussionId) conditions.push(eq(reports.discussionId, discussionId));

    if (conditions.length > 0) {
      db.update(reports) // removed await as we don't necessarily need to wait or return
        .set({ status })
        .where(or(...conditions));
    }
  }

  async likeComment(userId: number, commentId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite
        .prepare("INSERT INTO comment_likes (user_id, comment_id, created_at) VALUES (?, ?, ?)")
        .run(userId, commentId, Math.floor(Date.now() / 1000));
      return;
    }
    await db.insert(commentLikes).values({ userId, commentId });
  }

  async unlikeComment(userId: number, commentId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite
        .prepare("DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?")
        .run(userId, commentId);
      return;
    }
    await db
      .delete(commentLikes)
      .where(and(eq(commentLikes.userId, userId), eq(commentLikes.commentId, commentId)));
  }

  async getUserCommentLike(userId: number, commentId: number): Promise<boolean> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const like = sqlite
        .prepare("SELECT * FROM comment_likes WHERE user_id = ? AND comment_id = ?")
        .get(userId, commentId);
      return !!like;
    }
    const [like] = await db
      .select()
      .from(commentLikes)
      .where(and(eq(commentLikes.userId, userId), eq(commentLikes.commentId, commentId)));
    return !!like;
  }

  async getCommentLikes(commentId: number): Promise<number> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const result = sqlite
        .prepare("SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?")
        .get(commentId) as { count: number };
      return result.count;
    }
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(commentLikes)
      .where(eq(commentLikes.commentId, commentId));
    return result[0].count;
  }

  async updateUserKarma(userId: number, points: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE users SET karma = karma + ? WHERE id = ?").run(points, userId);
      return;
    }
    await db.execute(sql`
      UPDATE users 
      SET karma = karma + ${points} 
      WHERE id = ${userId}
    `);
  }
  async getActiveUsersCount(since: Date): Promise<number> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const timestamp = Math.floor(since.getTime() / 1000);
      const rows = sqlite
        .prepare(
          `
        SELECT author_id FROM posts WHERE created_at >= ?
        UNION
        SELECT author_id FROM comments WHERE created_at >= ?
      `,
        )
        .all(timestamp, timestamp);
      return rows.length;
    }

    // Get active users from posts
    const postsActivity = await db
      .select({ userId: posts.authorId })
      .from(posts)
      .where(sql`${posts.createdAt} >= ${since}`);

    // Get active users from comments
    const commentsActivity = await db
      .select({ userId: comments.authorId })
      .from(comments)
      .where(sql`${comments.createdAt} >= ${since}`);

    // Combine both results into a Set to avoid duplicates
    const activeUserIds = new Set<number>();
    postsActivity.forEach((record: { userId: number }) => activeUserIds.add(record.userId));
    commentsActivity.forEach((record: { userId: number }) => activeUserIds.add(record.userId));

    return activeUserIds.size;
  }

  async createPostLike(userId: number, postId: number, isLike: boolean): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite
        .prepare(
          "INSERT INTO post_likes (user_id, post_id, is_like, created_at) VALUES (?, ?, ?, ?)",
        )
        .run(userId, postId, isLike ? 1 : 0, Math.floor(Date.now() / 1000));
      return;
    }
    await db.insert(postLikes).values({ userId, postId, isLike });
  }

  async removePostReaction(userId: number, postId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite
        .prepare("DELETE FROM post_likes WHERE user_id = ? AND post_id = ?")
        .run(userId, postId);
      return;
    }
    await db
      .delete(postLikes)
      .where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId)));
  }

  async getUserPostReaction(userId: number, postId: number): Promise<{ isLike: boolean } | null> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const reaction = sqlite
        .prepare("SELECT is_like as isLike FROM post_likes WHERE user_id = ? AND post_id = ?")
        .get(userId, postId) as { isLike: number } | undefined;
      return reaction ? { isLike: !!reaction.isLike } : null;
    }
    const [reaction] = await db
      .select()
      .from(postLikes)
      .where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId)));
    return reaction ? { isLike: reaction.isLike } : null;
  }

  async getPostReactions(postId: number): Promise<{ likes: number; dislikes: number }> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const likes = sqlite
        .prepare("SELECT COUNT(*) as count FROM post_likes WHERE post_id = ? AND is_like = 1")
        .get(postId) as { count: number };
      const dislikes = sqlite
        .prepare("SELECT COUNT(*) as count FROM post_likes WHERE post_id = ? AND is_like = 0")
        .get(postId) as { count: number };
      return { likes: likes.count, dislikes: dislikes.count };
    }
    const likes = await db
      .select({ count: sql<number>`count(*)` })
      .from(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.isLike, true)));
    const dislikes = await db
      .select({ count: sql<number>`count(*)` })
      .from(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.isLike, false)));
    return { likes: likes[0].count, dislikes: dislikes[0].count };
  }

  async updateReportStatus(id: number, status: string): Promise<Report> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE reports SET status = ? WHERE id = ?").run(status, id);
      const report = sqlite.prepare("SELECT * FROM reports WHERE id = ?").get(id) as any;

      let createdAt;
      if (typeof report.created_at === "number") {
        createdAt = new Date(report.created_at * 1000);
      } else {
        createdAt = new Date(report.created_at);
      }

      return {
        id: report.id,
        reason: report.reason,
        status: report.status,
        createdAt: createdAt,
        reporterId: report.reporter_id,
        postId: report.post_id,
        commentId: report.comment_id,
        discussionId: report.discussion_id,
        ipAddress: report.ip_address,
      };
    }
    const [report] = await db.update(reports).set({ status }).where(eq(reports.id, id)).returning();
    return report;
  }

  async createNotification(notification: any): Promise<Notification> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const { userId, type, fromUserId } = notification;
      const createdAt = Math.floor(Date.now() / 1000);
      const res = sqlite
        .prepare(
          "INSERT INTO notifications (user_id, type, from_user_id, read, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(userId, type, fromUserId, 0, createdAt);
      return {
        id: res.lastInsertRowid as number,
        userId,
        type,
        fromUserId,
        read: false,
        createdAt: new Date(createdAt * 1000),
      };
    }
    const [newNotification] = await db
      .insert(notifications)
      .values({ ...notification, read: false })
      .returning();
    return newNotification;
  }

  getDeletedUsersCount(): number {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const row = sqlite
        .prepare("SELECT value FROM global_stats WHERE key = 'deleted_users_count'")
        .get() as { value: number };
      return row ? row.value : 0;
    }
    return this.deletedUsersCount;
  }

  incrementDeletedUsersCount(): void {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite
        .prepare("UPDATE global_stats SET value = value + 1 WHERE key = 'deleted_users_count'")
        .run();
    }
    this.deletedUsersCount++;
  }

  public fixInvalidTimestamps(): void {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      try {
        const users = sqlite.prepare("SELECT id, username, created_at FROM users").all() as any[];
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const invalidUsers = users.filter((u: any) => u.created_at < 1577836800); // Before Jan 1, 2020

        if (invalidUsers.length > 0) {
          console.log(`🔧 Fixing ${invalidUsers.length} invalid user timestamp(s)...`);
          const stmt = sqlite.prepare("UPDATE users SET created_at = ? WHERE id = ?");

          for (const user of invalidUsers) {
            stmt.run(currentTimestamp, user.id);
            console.log(`  ✅ Fixed timestamp for user: ${user.username} (ID: ${user.id})`);
          }

          console.log(
            `✅ Updated ${invalidUsers.length} user timestamp(s) to ${new Date(currentTimestamp * 1000).toISOString()}`,
          );
        }
      } catch (error) {
        console.error("Error fixing timestamps:", error);
      }
    }
  }
  // Communities
  async createCommunity(
    community: InsertCommunity & { creatorId: number; slug: string },
  ): Promise<Community> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const createdAt = Math.floor(Date.now() / 1000);
      const stmt = sqlite.prepare(`
        INSERT INTO communities (name, description, slug, creator_id, image_url, allowed_categories, created_at)
        VALUES (@name, @description, @slug, @creatorId, @imageUrl, @allowedCategories, @createdAt)
      `);

      const info = stmt.run({
        ...community,
        allowedCategories: community.allowedCategories || "news,entertainment,discussion",
        createdAt,
      });

      const newCommunity = sqlite
        .prepare("SELECT * FROM communities WHERE id = ?")
        .get(info.lastInsertRowid) as any;

      // Auto-add creator as owner
      await this.addCommunityMember(newCommunity.id, community.creatorId, "owner");

      return {
        id: newCommunity.id,
        name: newCommunity.name,
        slug: newCommunity.slug,
        description: newCommunity.description,
        creatorId: newCommunity.creator_id,
        imageUrl: newCommunity.image_url,
        allowedCategories: newCommunity.allowed_categories,
        createdAt: new Date(newCommunity.created_at * 1000),
      };
    }

    const [newCommunity] = await db.insert(communities).values(community).returning();
    // Auto-add creator as owner
    await this.addCommunityMember(newCommunity.id, community.creatorId, "owner");
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
        createdAt: new Date(community.created_at * 1000),
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
        createdAt: new Date(row.created_at * 1000),
      };
    }
    const [community] = await db.select().from(communities).where(eq(communities.slug, slug));
    return community;
  }

  async getCommunities(): Promise<Community[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare("SELECT * FROM communities ORDER BY created_at DESC").all();
      return rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        creatorId: row.creator_id,
        imageUrl: row.image_url,
        allowedCategories: row.allowed_categories || "news,entertainment,discussion",
        createdAt: new Date(row.created_at * 1000),
      }));
    }
    return await db.select().from(communities).orderBy(desc(communities.createdAt));
  }

  async getCommunityFeedPosts(userId: number): Promise<Post[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      // Get all community IDs the user is a member of
      const memberRows = sqlite
        .prepare("SELECT community_id FROM community_members WHERE user_id = ?")
        .all(userId) as { community_id: number }[];
      const communityIds = memberRows.map((r) => r.community_id);

      if (communityIds.length === 0) {
        return [];
      }

      // Fetch posts from these communities
      const placeholders = communityIds.map(() => "?").join(",");
      const rows = sqlite
        .prepare(
          `
        SELECT * FROM posts 
        WHERE community_id IN (${placeholders}) 
        ORDER BY created_at DESC
      `,
        )
        .all(...communityIds);

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
        createdAt: new Date(row.created_at * 1000),
      }));
    }

    // Postgres implementation
    const memberCommunities = await db
      .select({ id: communityMembers.communityId })
      .from(communityMembers)
      .where(eq(communityMembers.userId, userId));

    const communityIds = memberCommunities.map((c: { id: number }) => c.id);

    if (communityIds.length === 0) {
      return [];
    }

    return await db
      .select()
      .from(posts)
      .where(inArray(posts.communityId, communityIds))
      .orderBy(desc(posts.createdAt));
  }

  // Community Members
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
      .values({
        communityId,
        userId,
        role,
      })
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
      .where(
        and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)),
      );
  }

  async getCommunityMember(
    communityId: number,
    userId: number,
  ): Promise<CommunityMember | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const member = sqlite
        .prepare("SELECT * FROM community_members WHERE community_id = ? AND user_id = ?")
        .get(communityId, userId);
      if (!member) return undefined;
      return {
        ...member,
        joinedAt: new Date(member.joined_at * 1000),
      };
    }

    const [member] = await db
      .select()
      .from(communityMembers)
      .where(
        and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)),
      );
    return member;
  }

  async getCommunityMembers(communityId: number): Promise<(CommunityMember & { user: User })[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare(
          `
        SELECT cm.*, u.* 
        FROM community_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.community_id = ?
      `,
        )
        .all(communityId);

      return rows.map((row: any) => ({
        id: row.id,
        communityId: row.community_id,
        userId: row.user_id,
        role: row.role,
        joinedAt: new Date(row.joined_at * 1000),
        user: {
          id: row.user_id, // maps to u.id
          username: row.username,
          email: row.email,
          createdAt: new Date(row.created_at * 1000),
          emailVerified: Boolean(row.email_verified),
          isAdmin: Boolean(row.is_admin),
          role: row.role, // this overwrites existing role, need to be careful. The user role is hidden by community role in this specific select? No, unique column names in join?
          // SQLite returns mixed columns. Let's sanitize carefully.
          verified: Boolean(row.verified),
          karma: row.karma,
          bio: row.bio,
        },
      }));
    }

    const members = await db
      .select()
      .from(communityMembers)
      .innerJoin(users, eq(communityMembers.userId, users.id))
      .where(eq(communityMembers.communityId, communityId));

    return members.map(
      ({ community_members, users }: { community_members: CommunityMember; users: User }) => ({
        ...community_members,
        user: sanitizeUser(users),
      }),
    );
  }

  async getUserCommunities(userId: number): Promise<(Community & { role: string })[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare(
          `
        SELECT c.*, cm.role
        FROM community_members cm
        JOIN communities c ON cm.community_id = c.id
        WHERE cm.user_id = ?
      `,
        )
        .all(userId);

      return rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        slug: row.slug,
        creatorId: row.creator_id,
        imageUrl: row.image_url,
        createdAt: new Date(row.created_at * 1000),
        role: row.role,
      }));
    }

    const result = await db
      .select()
      .from(communityMembers)
      .innerJoin(communities, eq(communityMembers.communityId, communities.id))
      .where(eq(communityMembers.userId, userId));

    return result.map(
      ({
        community_members,
        communities,
      }: {
        community_members: CommunityMember;
        communities: Community;
      }) => ({
        ...communities,
        role: community_members.role,
      }),
    );
  }

  async getModeratedCommunities(userId: number): Promise<Community[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare(
          `
        SELECT c.*
        FROM community_members cm
        JOIN communities c ON cm.community_id = c.id
        WHERE cm.user_id = ? AND (cm.role = 'owner' OR cm.role = 'moderator')
      `,
        )
        .all(userId);

      return rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        slug: row.slug,
        creatorId: row.creator_id,
        imageUrl: row.image_url,
        createdAt: new Date(row.created_at * 1000),
      }));
    }

    const result = await db
      .select()
      .from(communityMembers)
      .innerJoin(communities, eq(communityMembers.communityId, communities.id))
      .where(
        and(
          eq(communityMembers.userId, userId),
          or(eq(communityMembers.role, "owner"), eq(communityMembers.role, "moderator")),
        ),
      );

    return result.map((r: { communities: Community }) => r.communities);
  }

  // Community Bans
  async banUserFromCommunity(
    communityId: number,
    userId: number,
    reason?: string,
  ): Promise<CommunityBan> {
    // First remove them from members if they are one
    await this.removeCommunityMember(communityId, userId);

    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const bannedAt = Math.floor(Date.now() / 1000);
      const stmt = sqlite.prepare(`
        INSERT INTO community_bans (community_id, user_id, reason, banned_at)
        VALUES (?, ?, ?, ?)
      `);

      const info = stmt.run(communityId, userId, reason || null, bannedAt);
      const ban = sqlite
        .prepare("SELECT * FROM community_bans WHERE id = ?")
        .get(info.lastInsertRowid);

      return {
        ...ban,
        bannedAt: new Date(ban.banned_at * 1000),
      };
    }

    const [ban] = await db
      .insert(communityBans)
      .values({
        communityId,
        userId,
        reason,
      })
      .returning();
    return ban;
  }

  async unbanUserFromCommunity(communityId: number, userId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite
        .prepare("DELETE FROM community_bans WHERE community_id = ? AND user_id = ?")
        .run(communityId, userId);
      return;
    }
    await db
      .delete(communityBans)
      .where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, userId)));
  }

  async isUserBannedFromCommunity(communityId: number, userId: number): Promise<boolean> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const ban = sqlite
        .prepare("SELECT * FROM community_bans WHERE community_id = ? AND user_id = ?")
        .get(communityId, userId);
      return !!ban;
    }

    const [ban] = await db
      .select()
      .from(communityBans)
      .where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, userId)));
    return !!ban;
  }

  async getCommunityBans(communityId: number): Promise<(CommunityBan & { user: User })[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      // similar join logic as getCommunityMembers
      const rows = sqlite
        .prepare(
          `
        SELECT cb.*, u.*
        FROM community_bans cb
        JOIN users u ON cb.user_id = u.id
        WHERE cb.community_id = ?
      `,
        )
        .all(communityId);

      return rows.map((row: any) => ({
        id: row.id,
        communityId: row.community_id,
        userId: row.user_id,
        reason: row.reason,
        bannedAt: new Date(row.banned_at * 1000),
        user: {
          id: row.user_id,
          username: row.username,
          email: row.email,
          createdAt: new Date(row.created_at * 1000),
          emailVerified: Boolean(row.email_verified),
          isAdmin: Boolean(row.is_admin),
          role: row.role, // user role
          verified: Boolean(row.verified),
          karma: row.karma,
          bio: row.bio,
        },
      }));
    }

    const bans = await db
      .select()
      .from(communityBans)
      .innerJoin(users, eq(communityBans.userId, users.id))
      .where(eq(communityBans.communityId, communityId));

    return bans.map(({ community_bans, users }: { community_bans: CommunityBan; users: User }) => ({
      ...community_bans,
      user: sanitizeUser(users),
    }));
  }

  async getCommunityReports(communityId: number): Promise<Report[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare(
          `
        SELECT r.* 
        FROM reports r
        LEFT JOIN posts p ON r.post_id = p.id
        LEFT JOIN comments c ON r.comment_id = c.id
        LEFT JOIN posts pc ON c.post_id = pc.id
        WHERE (p.community_id = ? OR pc.community_id = ?)
        ORDER BY r.created_at DESC
      `,
        )
        .all(communityId, communityId);

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
    return [];
  }
}

export const storage = new DatabaseStorage();
