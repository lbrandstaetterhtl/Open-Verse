import { User, Post, Comment, Report, InsertUser, InsertDiscussionPost, InsertMediaPost } from "@shared/schema";
import session from "express-session";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { users, posts, comments, reports, postLikes } from "@shared/schema";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserProfile(id: number, profile: Partial<{ username: string; email: string }>): Promise<User>;
  updateUserPassword(id: number, password: string): Promise<User>;
  updateUserKarma(id: number, karma: number): Promise<User>;

  createPost(post: Omit<Post, "id" | "createdAt" | "karma">): Promise<Post>;
  getPosts(category?: string): Promise<Post[]>;
  getPost(id: number): Promise<Post | undefined>;
  updatePostKarma(id: number, karma: number): Promise<Post>;

  createComment(comment: Omit<Comment, "id" | "createdAt" | "karma">): Promise<Comment>;
  getComments(postId: number): Promise<Comment[]>;
  updateCommentKarma(id: number, karma: number): Promise<Comment>;

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

  async updateUserProfile(id: number, profile: Partial<{ username: string; email: string }>): Promise<User> {
    const [user] = await db.update(users).set(profile).where(eq(users.id, id)).returning();
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
    if (category) {
      return db.select().from(posts).where(eq(posts.category, category));
    }
    return db.select().from(posts);
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

  async createReport(report: Omit<Report, "id" | "createdAt" | "status">): Promise<Report> {
    const [newReport] = await db.insert(reports).values({ ...report, status: "pending" }).returning();
    return newReport;
  }

  async getReports(): Promise<Report[]> {
    return db.select().from(reports);
  }

  async updateReportStatus(id: number, status: string): Promise<Report> {
    const [report] = await db.update(reports).set({ status }).where(eq(reports.id, id)).returning();
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
}

export const storage = new DatabaseStorage();