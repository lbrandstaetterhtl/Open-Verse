import { User, Post, Comment, Report, InsertUser, InsertMediaPost, Notification, Message, followers, notifications, messages, verificationTokens } from "@shared/schema";
import session from "express-session";
import { db } from "./db";
import { eq, and, or, desc, asc, sql } from "drizzle-orm";
import { users, posts, comments, reports, postLikes } from "@shared/schema";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserProfile(id: number, profile: Partial<{ username: string; email: string; profilePictureUrl: string; isAdmin: boolean; role: string; emailVerified: boolean }>): Promise<User>;
  updateUserPassword(id: number, password: string): Promise<User>;
  updateUserKarma(id: number, karma: number): Promise<User>;

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
  updateReportStatus(id: number, status: string): Promise<Report>;

  sessionStore: session.Store;
  createVerificationToken(token: {
    token: string;
    userId: number;
    expiresAt: Date;
  }): Promise<void>;

  getVerificationToken(token: string): Promise<{
    token: string;
    userId: number;
    expiresAt: Date;
  } | undefined>;

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

  // Messages
  createMessage(message: {
    senderId: number;
    receiverId: number;
    content: string;
  }): Promise<Message>;
  getMessages(userId1: number, userId2: number): Promise<Message[]>;
  getUnreadMessageCount(userId: number): Promise<number>;

  deleteComments(postId: number): Promise<void>;
  deletePostReactions(postId: number): Promise<void>;
  deleteReports(postId: number): Promise<void>;
  deletePost(postId: number): Promise<void>;

  // Add new methods for admin features
  getUsers(): Promise<User[]>;
  getReport(id: number): Promise<Report | undefined>;
  deleteUser(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  public sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserProfile(id: number, profile: Partial<{ username: string; email: string; profilePictureUrl: string; isAdmin: boolean; role: string; emailVerified: boolean }>): Promise<User> {
    const updateData: Record<string, any> = {};
    if (profile.username) updateData.username = profile.username;
    if (profile.email) updateData.email = profile.email;
    if (profile.profilePictureUrl) updateData.profilePictureUrl = profile.profilePictureUrl;
    if (typeof profile.isAdmin !== 'undefined') updateData.isAdmin = profile.isAdmin;
    if (profile.role) updateData.role = profile.role;
    if (typeof profile.emailVerified !== 'undefined') updateData.emailVerified = profile.emailVerified;

    if (Object.keys(updateData).length === 0) {
      return this.getUser(id) as Promise<User>;
    }

    const [user] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserPassword(id: number, password: string): Promise<User> {
    const [user] = await db.update(users).set({ password }).where(eq(users.id, id)).returning();
    return user;
  }

  async updateUserKarma(id: number, karma: number): Promise<User> {
    const [user] = await db.update(users).set({ karma }).where(eq(users.id, id)).returning();
    return user;
  }

  async createPost(post: Omit<Post, "id" | "createdAt" | "karma">): Promise<Post> {
    const [newPost] = await db.insert(posts).values(post).returning();
    return newPost;
  }

  async getPosts(category?: string): Promise<Post[]> {
    console.log("Getting posts with category:", category);

    if (category) {
      // Handle multiple categories separated by comma
      if (category.includes(',')) {
        const categories = category.split(',');
        console.log("Querying multiple categories:", categories);

        const result = await db
          .select()
          .from(posts)
          .where(
            or(
              ...categories.map(cat => eq(posts.category, cat.trim()))
            )
          )
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
    const result = await db
      .select()
      .from(posts)
      .orderBy(desc(posts.createdAt));

    console.log("Found all posts:", result);
    return result;
  }

  async getPost(id: number): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post;
  }

  async updatePostKarma(id: number, karma: number): Promise<Post> {
    const [post] = await db.update(posts).set({ karma }).where(eq(posts.id, id)).returning();
    return post;
  }

  async createComment(comment: Omit<Comment, "id" | "createdAt" | "karma">): Promise<Comment> {
    const [newComment] = await db.insert(comments).values(comment).returning();
    return newComment;
  }

  async getComments(postId: number): Promise<Comment[]> {
    return db.select().from(comments).where(eq(comments.postId, postId));
  }

  async updateCommentKarma(id: number, karma: number): Promise<Comment> {
    const [comment] = await db.update(comments).set({ karma }).where(eq(comments.id, id)).returning();
    return comment;
  }

  async getComment(id: number): Promise<Comment | undefined> {
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    return comment;
  }

  async deleteComment(id: number): Promise<void> {
    await db.delete(comments).where(eq(comments.id, id));
  }

  async createReport(report: Omit<Report, "id" | "createdAt" | "status">): Promise<Report> {
    console.log("Creating report with data:", report); // Debug log
    const [newReport] = await db.insert(reports)
      .values({ ...report, status: "pending" })
      .returning();
    console.log("Created report:", newReport); // Debug log
    return newReport;
  }

  async getReports(): Promise<Report[]> {
    console.log("Fetching all reports"); // Debug log
    const result = await db
      .select()
      .from(reports)
      .orderBy(desc(reports.createdAt));
    console.log("Found reports:", result); // Debug log
    return result;
  }

  async updateReportStatus(id: number, status: string): Promise<Report> {
    const [report] = await db.update(reports)
      .set({ status })
      .where(eq(reports.id, id))
      .returning();
    return report;
  }

  async createVerificationToken(token: { token: string; userId: number; expiresAt: Date }): Promise<void> {
    await db.insert(verificationTokens).values(token);
  }

  async getVerificationToken(token: string) {
    const [verificationToken] = await db.select().from(verificationTokens).where(eq(verificationTokens.token, token));
    return verificationToken;
  }

  async deleteVerificationToken(token: string): Promise<void> {
    await db.delete(verificationTokens).where(eq(verificationTokens.token, token));
  }

  async verifyUserEmail(userId: number): Promise<void> {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
  }

  async createPostLike(userId: number, postId: number, isLike: boolean): Promise<void> {
    await db.insert(postLikes).values({ userId, postId, isLike });
  }

  async removePostReaction(userId: number, postId: number): Promise<void> {
    await db.delete(postLikes).where(
      and(
        eq(postLikes.userId, userId),
        eq(postLikes.postId, postId)
      )
    );
  }

  async getUserPostReaction(userId: number, postId: number): Promise<{ isLike: boolean } | null> {
    const [reaction] = await db.select().from(postLikes).where(
      and(
        eq(postLikes.userId, userId),
        eq(postLikes.postId, postId)
      )
    );
    return reaction ? { isLike: reaction.isLike } : null;
  }

  async getPostReactions(postId: number): Promise<{ likes: number; dislikes: number }> {
    const reactions = await db.select().from(postLikes).where(eq(postLikes.postId, postId));
    return {
      likes: reactions.filter(r => r.isLike).length,
      dislikes: reactions.filter(r => !r.isLike).length
    };
  }

  // Followers
  async followUser(followerId: number, followingId: number): Promise<void> {
    await db.insert(followers).values({ followerId, followingId });
  }

  async unfollowUser(followerId: number, followingId: number): Promise<void> {
    await db.delete(followers)
      .where(and(
        eq(followers.followerId, followerId),
        eq(followers.followingId, followingId)
      ));
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
      .where(and(
        eq(followers.followerId, followerId),
        eq(followers.followingId, followingId)
      ));

    return !!result;
  }

  // Notifications
  async createNotification(notification: {
    userId: number;
    type: string;
    fromUserId: number;
  }): Promise<Notification> {
    const [result] = await db
      .insert(notifications)
      .values(notification)
      .returning();

    return result;
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
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, notificationId));
  }

  // Messages
  async createMessage(message: {
    senderId: number;
    receiverId: number;
    content: string;
  }): Promise<Message> {
    const [result] = await db
      .insert(messages)
      .values(message)
      .returning();

    return result;
  }

  async getMessages(userId1: number, userId2: number): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(
        or(
          and(
            eq(messages.senderId, userId1),
            eq(messages.receiverId, userId2)
          ),
          and(
            eq(messages.senderId, userId2),
            eq(messages.receiverId, userId1)
          )
        )
      )
      .orderBy(asc(messages.createdAt));
  }

  async getUnreadMessageCount(userId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(and(
        eq(messages.receiverId, userId),
        eq(messages.read, false)
      ));

    return result[0].count;
  }

  async deleteComments(postId: number): Promise<void> {
    console.log('Deleting comments for post:', postId);
    try {
      // First get all comments
      const commentsToDelete = await db.select().from(comments).where(eq(comments.postId, postId));

      // Delete reports for each comment
      for (const comment of commentsToDelete) {
        await this.deleteReportsForComment(comment.id); //using new function
      }

      // Then delete all comments
      await db.delete(comments).where(eq(comments.postId, postId));
      console.log('Successfully deleted comments for post:', postId);
    } catch (error) {
      console.error('Error deleting comments:', error);
      throw error;
    }
  }

  async deletePostReactions(postId: number): Promise<void> {
    console.log('Deleting reactions for post:', postId);
    try {
      await db.delete(postLikes).where(eq(postLikes.postId, postId));
      console.log('Successfully deleted reactions for post:', postId);
    } catch (error) {
      console.error('Error deleting reactions:', error);
      throw error;
    }
  }

  async deleteReports(postId: number): Promise<void> {
    console.log('Deleting reports for post:', postId);
    try {
      await db.delete(reports).where(
        or(
          eq(reports.postId, postId),
          eq(reports.discussionId, postId)
        )
      );
      console.log('Successfully deleted reports for post:', postId);
    } catch (error) {
      console.error('Error deleting reports:', error);
      throw error;
    }
  }

  async deletePost(postId: number): Promise<void> {
    console.log('Starting post deletion:', postId); // Debug log

    try {
      // First delete all comments (which will also handle comment reports)
      await this.deleteComments(postId);
      console.log('Deleted comments for post:', postId);

      // Then delete reactions
      await this.deletePostReactions(postId);
      console.log('Deleted reactions for post:', postId);

      // Delete all reports for this post
      await this.deleteReports(postId);
      console.log('Deleted reports for post:', postId);

      // Finally delete the post itself
      await db.delete(posts).where(eq(posts.id, postId));
      console.log('Successfully deleted post:', postId);
    } catch (error) {
      console.error('Error during post deletion:', error);
      throw error; // Re-throw to handle in the route
    }
  }
  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getReport(id: number): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report;
  }
  async deleteUser(id: number): Promise<void> {
    // Delete all user-related data
    await db.delete(postLikes).where(eq(postLikes.userId, id));
    await db.delete(comments).where(eq(comments.authorId, id));
    await db.delete(posts).where(eq(posts.authorId, id));
    await db.delete(reports).where(eq(reports.reporterId, id));
    await db.delete(followers).where(
      or(
        eq(followers.followerId, id),
        eq(followers.followingId, id)
      )
    );
    await db.delete(notifications).where(
      or(
        eq(notifications.userId, id),
        eq(notifications.fromUserId, id)
      )
    );
    await db.delete(messages).where(
      or(
        eq(messages.senderId, id),
        eq(messages.receiverId, id)
      )
    );
    // Finally delete the user
    await db.delete(users).where(eq(users.id, id));
  }
  async updateAllReportsForContent(postId: number | null, commentId: number | null, discussionId: number | null, status: string): Promise<void> {
    const conditions = [];
    if (postId) conditions.push(eq(reports.postId, postId));
    if (commentId) conditions.push(eq(reports.commentId, commentId));
    if (discussionId) conditions.push(eq(reports.discussionId, discussionId));

    if (conditions.length > 0) {
      await db.update(reports)
        .set({ status })
        .where(or(...conditions));
    }
  }
  async deleteReportsForComment(commentId: number):Promise<void>{
    console.log('Deleting reports for comment:', commentId);
    try {
      await db.delete(reports).where(eq(reports.commentId, commentId));
      console.log('Successfully deleted reports for comment:', commentId);
    } catch (error) {
      console.error('Error deleting reports for comment:', error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();