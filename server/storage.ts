import { User, Post, Comment, Report, InsertUser, InsertDiscussionPost, InsertMediaPost } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

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
  createPostLike(userId: number, postId: number): Promise<void>;
  removePostLike(userId: number, postId: number): Promise<void>;
  hasUserLikedPost(userId: number, postId: number): Promise<boolean>;
  getPostLikes(postId: number): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private posts: Map<number, Post>;
  private comments: Map<number, Comment>;
  private reports: Map<number, Report>;
  private postLikes: Map<string, {id:number, userId: number, postId: number, createdAt: Date}>;
  public sessionStore: session.Store;
  private currentIds: { [key: string]: number };
  private verificationTokens: Map<string, {
    token: string;
    userId: number;
    expiresAt: Date;
  }>;

  constructor() {
    this.users = new Map();
    this.posts = new Map();
    this.comments = new Map();
    this.reports = new Map();
    this.postLikes = new Map();
    this.sessionStore = new MemoryStore({ checkPeriod: 86400000 });
    this.currentIds = { users: 1, posts: 1, comments: 1, reports: 1, postLikes: 1 };
    this.verificationTokens = new Map();
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentIds.users++;
    const user: User = {
      ...insertUser,
      id,
      karma: 5,
      createdAt: new Date(),
      emailVerified: false,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserProfile(id: number, profile: Partial<{ username: string; email: string }>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");

    const updated = { ...user, ...profile };
    this.users.set(id, updated);
    return updated;
  }

  async updateUserPassword(id: number, password: string): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");

    const updated = { ...user, password };
    this.users.set(id, updated);
    return updated;
  }

  async updateUserKarma(id: number, karma: number): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    const updated = { ...user, karma };
    this.users.set(id, updated);
    return updated;
  }

  async createPost(post: Omit<Post, "id" | "createdAt" | "karma">): Promise<Post> {
    const id = this.currentIds.posts++;
    const newPost: Post = {
      ...post,
      id,
      karma: 0,
      createdAt: new Date(),
      mediaUrl: post.mediaUrl || null,
      mediaType: post.mediaType || null,
    };
    this.posts.set(id, newPost);
    return newPost;
  }

  async getPosts(category?: string): Promise<Post[]> {
    const posts = Array.from(this.posts.values());
    return category ? posts.filter(p => p.category === category) : posts;
  }

  async getPost(id: number): Promise<Post | undefined> {
    return this.posts.get(id);
  }

  async updatePostKarma(id: number, karma: number): Promise<Post> {
    const post = this.posts.get(id);
    if (!post) throw new Error("Post not found");
    const updated = { ...post, karma };
    this.posts.set(id, updated);
    return updated;
  }

  async createComment(comment: Omit<Comment, "id" | "createdAt" | "karma">): Promise<Comment> {
    const id = this.currentIds.comments++;
    const newComment: Comment = {
      ...comment,
      id,
      karma: 5,
      createdAt: new Date(),
    };
    this.comments.set(id, newComment);
    return newComment;
  }

  async getComments(postId: number): Promise<Comment[]> {
    return Array.from(this.comments.values()).filter(c => c.postId === postId);
  }

  async updateCommentKarma(id: number, karma: number): Promise<Comment> {
    const comment = this.comments.get(id);
    if (!comment) throw new Error("Comment not found");
    const updated = { ...comment, karma };
    this.comments.set(id, updated);
    return updated;
  }

  async createReport(report: Omit<Report, "id" | "createdAt" | "status">): Promise<Report> {
    const id = this.currentIds.reports++;
    const newReport: Report = {
      ...report,
      id,
      status: "pending",
      createdAt: new Date(),
    };
    this.reports.set(id, newReport);
    return newReport;
  }

  async getReports(): Promise<Report[]> {
    return Array.from(this.reports.values());
  }

  async updateReportStatus(id: number, status: string): Promise<Report> {
    const report = this.reports.get(id);
    if (!report) throw new Error("Report not found");
    const updated = { ...report, status };
    this.reports.set(id, updated);
    return updated;
  }

  async createVerificationToken(token: {
    token: string;
    userId: number;
    expiresAt: Date;
  }): Promise<void> {
    this.verificationTokens.set(token.token, token);
  }

  async getVerificationToken(token: string) {
    return this.verificationTokens.get(token);
  }

  async deleteVerificationToken(token: string): Promise<void> {
    this.verificationTokens.delete(token);
  }

  async verifyUserEmail(userId: number): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    const updatedUser = { ...user, emailVerified: true };
    this.users.set(userId, updatedUser);
  }
  async createPostLike(userId: number, postId: number): Promise<void> {
    const key = `${userId}-${postId}`;
    const id = this.currentIds.postLikes++;
    this.postLikes.set(key, {
      id,
      userId,
      postId,
      createdAt: new Date(),
    });

    // Update post karma
    const post = await this.getPost(postId);
    if (post) {
      await this.updatePostKarma(postId, post.karma + 1);
    }
  }

  async removePostLike(userId: number, postId: number): Promise<void> {
    const key = `${userId}-${postId}`;
    this.postLikes.delete(key);

    // Update post karma
    const post = await this.getPost(postId);
    if (post) {
      await this.updatePostKarma(postId, post.karma - 1);
    }
  }

  async hasUserLikedPost(userId: number, postId: number): Promise<boolean> {
    const key = `${userId}-${postId}`;
    return this.postLikes.has(key);
  }

  async getPostLikes(postId: number): Promise<number> {
    return Array.from(this.postLikes.values()).filter(like => like.postId === postId).length;
  }
}

export const storage = new MemStorage();