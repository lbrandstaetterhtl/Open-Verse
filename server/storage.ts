import { User, Post, Comment, Report, InsertUser, Post as SelectPost, Comment as SelectComment, Report as SelectReport } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
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
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private posts: Map<number, Post>;
  private comments: Map<number, Comment>;
  private reports: Map<number, Report>;
  public sessionStore: session.Store;
  private currentIds: { [key: string]: number };

  constructor() {
    this.users = new Map();
    this.posts = new Map();
    this.comments = new Map();
    this.reports = new Map();
    this.sessionStore = new MemoryStore({ checkPeriod: 86400000 });
    this.currentIds = { users: 1, posts: 1, comments: 1, reports: 1 };
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentIds.users++;
    const user: User = {
      ...insertUser,
      id,
      karma: 5,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
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
      karma: 5,
      createdAt: new Date(),
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
}

export const storage = new MemStorage();
