import { User, Post, Comment, Report, InsertUser, InsertDiscussionPost, InsertMediaPost } from "@shared/schema";
import session from "express-session";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users, posts, comments, reports, postLikes, verificationTokens } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import connectPg from "connect-pg-simple";

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

// Initialize postgres client with proper SSL configuration
const queryClient = postgres(process.env.DATABASE_URL!, {
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idle_timeout: 30
});

const db = drizzle(queryClient);

export class DatabaseStorage implements IStorage {
  public sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      conObject: {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false
        }
      },
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.id, id));
      return result[0];
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.username, username));
      return result[0];
    } catch (error) {
      console.error('Error getting user by username:', error);
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.email, email));
      return result[0];
    } catch (error) {
      console.error('Error getting user by email:', error);
      throw error;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const result = await db.insert(users).values(insertUser).returning();
      return result[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async updateUserProfile(id: number, profile: Partial<{ username: string; email: string }>): Promise<User> {
    try {
      const result = await db.update(users).set(profile).where(eq(users.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }

  async updateUserPassword(id: number, password: string): Promise<User> {
    try {
      const result = await db.update(users).set({ password }).where(eq(users.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error('Error updating user password:', error);
      throw error;
    }
  }

  async updateUserKarma(id: number, karma: number): Promise<User> {
    try {
      const result = await db.update(users).set({ karma }).where(eq(users.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error('Error updating user karma:', error);
      throw error;
    }
  }

  async createPost(post: Omit<Post, "id" | "createdAt" | "karma">): Promise<Post> {
    try {
      const result = await db.insert(posts).values(post).returning();
      return result[0];
    } catch (error) {
      console.error('Error creating post:', error);
      throw error;
    }
  }

  async getPosts(category?: string): Promise<Post[]> {
    try {
      if (category) {
        return db.select().from(posts).where(eq(posts.category, category));
      }
      return db.select().from(posts);
    } catch (error) {
      console.error('Error getting posts:', error);
      throw error;
    }
  }

  async getPost(id: number): Promise<Post | undefined> {
    try {
      const result = await db.select().from(posts).where(eq(posts.id, id));
      return result[0];
    } catch (error) {
      console.error('Error getting post:', error);
      throw error;
    }
  }

  async updatePostKarma(id: number, karma: number): Promise<Post> {
    try {
      const result = await db.update(posts).set({ karma }).where(eq(posts.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error('Error updating post karma:', error);
      throw error;
    }
  }

  async createComment(comment: Omit<Comment, "id" | "createdAt" | "karma">): Promise<Comment> {
    try {
      const result = await db.insert(comments).values(comment).returning();
      return result[0];
    } catch (error) {
      console.error('Error creating comment:', error);
      throw error;
    }
  }

  async getComments(postId: number): Promise<Comment[]> {
    try {
      return db.select().from(comments).where(eq(comments.postId, postId));
    } catch (error) {
      console.error('Error getting comments:', error);
      throw error;
    }
  }

  async updateCommentKarma(id: number, karma: number): Promise<Comment> {
    try {
      const result = await db.update(comments).set({ karma }).where(eq(comments.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error('Error updating comment karma:', error);
      throw error;
    }
  }

  async createReport(report: Omit<Report, "id" | "createdAt" | "status">): Promise<Report> {
    try {
      const result = await db.insert(reports).values(report).returning();
      return result[0];
    } catch (error) {
      console.error('Error creating report:', error);
      throw error;
    }
  }

  async getReports(): Promise<Report[]> {
    try {
      return db.select().from(reports);
    } catch (error) {
      console.error('Error getting reports:', error);
      throw error;
    }
  }

  async updateReportStatus(id: number, status: string): Promise<Report> {
    try {
      const result = await db.update(reports).set({ status }).where(eq(reports.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error('Error updating report status:', error);
      throw error;
    }
  }

  async createVerificationToken(token: { token: string; userId: number; expiresAt: Date }): Promise<void> {
    try {
      await db.insert(verificationTokens).values(token);
    } catch (error) {
      console.error('Error creating verification token:', error);
      throw error;
    }
  }

  async getVerificationToken(token: string) {
    try {
      const result = await db.select().from(verificationTokens).where(eq(verificationTokens.token, token));
      return result[0];
    } catch (error) {
      console.error('Error getting verification token:', error);
      throw error;
    }
  }

  async deleteVerificationToken(token: string): Promise<void> {
    try {
      await db.delete(verificationTokens).where(eq(verificationTokens.token, token));
    } catch (error) {
      console.error('Error deleting verification token:', error);
      throw error;
    }
  }

  async verifyUserEmail(userId: number): Promise<void> {
    try {
      await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
    } catch (error) {
      console.error('Error verifying user email:', error);
      throw error;
    }
  }

  async createPostLike(userId: number, postId: number, isLike: boolean): Promise<void> {
    try {
      await db.insert(postLikes).values({ userId, postId, isLike });
    } catch (error) {
      console.error('Error creating post like:', error);
      throw error;
    }
  }

  async removePostReaction(userId: number, postId: number): Promise<void> {
    try {
      await db.delete(postLikes).where(
        and(
          eq(postLikes.userId, userId),
          eq(postLikes.postId, postId)
        )
      );
    } catch (error) {
      console.error('Error removing post reaction:', error);
      throw error;
    }
  }

  async getUserPostReaction(userId: number, postId: number): Promise<{ isLike: boolean } | null> {
    try {
      const result = await db.select().from(postLikes).where(
        and(
          eq(postLikes.userId, userId),
          eq(postLikes.postId, postId)
        )
      );
      return result[0] ? { isLike: result[0].isLike } : null;
    } catch (error) {
      console.error('Error getting user post reaction:', error);
      throw error;
    }
  }

  async getPostReactions(postId: number): Promise<{ likes: number; dislikes: number }> {
    try {
      const reactions = await db.select().from(postLikes).where(eq(postLikes.postId, postId));
      return {
        likes: reactions.filter(r => r.isLike).length,
        dislikes: reactions.filter(r => !r.isLike).length
      };
    } catch (error) {
      console.error('Error getting post reactions:', error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();