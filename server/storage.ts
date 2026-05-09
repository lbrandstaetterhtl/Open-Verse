import session from "express-session";
import type {
  User,
  Post,
  Comment,
  InsertUser,
  Theme,
  InsertTheme,
  Community,
  CommunityMember,
  CommunityBan} from "@shared/schema";
import {
  InsertCommunity
} from "@shared/schema";
import { pool, getSqlite } from "./db";
import connectPg from "connect-pg-simple";
import sqliteStoreFactory from "better-sqlite3-session-store";

// Domain Storage Modules
import { UserStorage } from "./storage/user-storage";
import { ContentStorage } from "./storage/content-storage";
import { CommunityStorage } from "./storage/community-storage";
import { NotificationStorage } from "./storage/notification-storage";
import { SupportStorage } from "./storage/support-storage";
import { MessageStorage } from "./storage/message-storage";
import { ThemeStorage } from "./storage/theme-storage";
import { SecurityStorage } from "./storage/security-storage";

const PostgresSessionStore = connectPg(session);
const SqliteSessionStore = sqliteStoreFactory(session);

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByIds(ids: number[]): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUserProfile(id: number, profile: any): Promise<User>;
  updateUserPassword(id: number, password: string): Promise<User>;
  updateUserKarma(id: number, karma: number): Promise<void>;
  deleteUser(id: number): Promise<void>;
  searchUsers(query: string): Promise<User[]>;

  // Content
  createPost(post: Omit<Post, "id" | "createdAt" | "karma">): Promise<Post>;
  getPosts(options?: { category?: string; communityId?: number; limit?: number; offset?: number }): Promise<Post[]>;
  getPost(id: number): Promise<Post | undefined>;
  getPostsByUser(userId: number): Promise<Post[]>;
  getLikedPostsByUser(userId: number): Promise<Post[]>;
  updatePostKarma(id: number, karma: number): Promise<Post>;
  deletePost(id: number): Promise<void>;
  createComment(comment: Omit<Comment, "id" | "createdAt" | "karma">): Promise<Comment>;
  getComments(postId: number): Promise<Comment[]>;
  getComment(id: number): Promise<Comment | undefined>;
  updateCommentKarma(id: number, karma: number): Promise<Comment>;
  deleteComment(id: number): Promise<void>;

  // Notifications
  getNotifications(userId: number, options?: { limit?: number; offset?: number; unreadOnly?: boolean; type?: string[] }): Promise<any[]>;
  getNotificationCounts(userId: number): Promise<{ unread: number; unseen: number }>;
  markNotificationsAsSeen(userId: number): Promise<void>;
  markAllNotificationsAsRead(userId: number): Promise<void>;
  markNotificationAsRead(id: number): Promise<void>;
  deleteNotification(id: number): Promise<void>;
  getNotificationPreferences(userId: number): Promise<any>;
  updateNotificationPreferences(userId: number, update: any): Promise<any>;

  // Transactions / Interactions
  createPostLike(userId: number, postId: number, isLike: boolean): Promise<void>;
  removePostReaction(userId: number, postId: number): Promise<void>;
  getUserPostReaction(userId: number, postId: number): Promise<{ isLike: boolean } | null>;
  getPostReactions(postId: number): Promise<{ likes: number; dislikes: number }>;
  getBatchPostReactions(postIds: number[]): Promise<Map<number, { likes: number; dislikes: number }>>;
  
  likeComment(userId: number, commentId: number): Promise<void>;
  unlikeComment(userId: number, commentId: number): Promise<void>;
  getUserCommentLike(userId: number, commentId: number): Promise<boolean>;
  getCommentLikes(commentId: number): Promise<number>;

  // Verification
  createVerificationToken(token: any): Promise<void>;
  getVerificationToken(token: string): Promise<any>;
  deleteVerificationToken(token: string): Promise<void>;
  verifyUserEmail(userId: number): Promise<void>;

  // Social
  isFollowing(followerId: number, followingId: number): Promise<boolean>;
  followUser(followerId: number, followingId: number): Promise<void>;
  unfollowUser(followerId: number, followingId: number): Promise<void>;
  getMutualFollowers(userId1: number, userId2: number): Promise<User[]>;

  // Communities
  createCommunity(community: InsertCommunity & { creatorId: number; slug: string }): Promise<Community>;
  getCommunity(id: number): Promise<Community | undefined>;
  getCommunityBySlug(slug: string): Promise<Community | undefined>;
  getCommunities(options?: { limit?: number; offset?: number }): Promise<Community[]>;
  getCommunityFeedPosts(userId: number, options?: { limit?: number; offset?: number }): Promise<Post[]>;
  addCommunityMember(communityId: number, userId: number, role?: string): Promise<CommunityMember>;
  removeCommunityMember(communityId: number, userId: number): Promise<void>;
  getCommunityMember(communityId: number, userId: number): Promise<CommunityMember | undefined>;
  getCommunityMembers(communityId: number): Promise<(CommunityMember & { user: User })[]>;
  getUserCommunities(userId: number): Promise<(Community & { role: string })[]>;
  getModeratedCommunities(userId: number): Promise<(Community & { role: string })[]>;
  banUserFromCommunity(communityId: number, userId: number, reason?: string): Promise<CommunityBan>;
  unbanUserFromCommunity(communityId: number, userId: number): Promise<void>;
  isUserBannedFromCommunity(communityId: number, userId: number): Promise<boolean>;
  getCommunityBans(communityId: number): Promise<(CommunityBan & { user: User })[]>;

  // Themes
  createTheme(userId: number, theme: InsertTheme): Promise<Theme>;
  getThemes(userId: number): Promise<Theme[]>;
  deleteTheme(id: number): Promise<void>;
  updateTheme(id: number, theme: Partial<InsertTheme>): Promise<Theme>;

  // Global Session Store
  sessionStore: session.Store;

  // Domain Store Getters
  getUserStore(): UserStorage;
  getContentStore(): ContentStorage;
  getCommunityStore(): CommunityStorage;
  getNotificationStore(): NotificationStorage;
  getSupportStore(): SupportStorage;
  getMessageStore(): MessageStorage;
  getThemeStore(): ThemeStorage;
  getSecurityStore(): SecurityStorage;
}

export function sanitizeUser(user: any): User {
  if (!user) return user;
  const { password: _, ...safeUser } = user;
  return safeUser as User;
}

export class DatabaseStorage implements IStorage {
  public sessionStore: session.Store;
  
  private userStore: UserStorage;
  private contentStore: ContentStorage;
  private communityStore: CommunityStorage;
  private notificationStore: NotificationStorage;
  private supportStore: SupportStorage;
  private messageStore: MessageStorage;
  private themeStore: ThemeStorage;
  private securityStore: SecurityStorage;

  constructor() {
    this.userStore = new UserStorage();
    this.contentStore = new ContentStorage();
    this.communityStore = new CommunityStorage();
    this.notificationStore = new NotificationStorage();
    this.supportStore = new SupportStorage();
    this.messageStore = new MessageStorage();
    this.themeStore = new ThemeStorage();
    this.securityStore = new SecurityStorage();

    if (process.env.USE_SQLITE === "true") {
      this.sessionStore = new SqliteSessionStore({
        client: getSqlite()!,
        expired: { clear: true, intervalMs: 900000 }
      });
    } else {
      this.sessionStore = new PostgresSessionStore({
        pool: pool ?? undefined,
        createTableIfMissing: true,
      });
    }
  }

  // Domain Store Getters
  getUserStore() { return this.userStore; }
  getContentStore() { return this.contentStore; }
  getCommunityStore() { return this.communityStore; }
  getNotificationStore() { return this.notificationStore; }
  getSupportStore() { return this.supportStore; }
  getMessageStore() { return this.messageStore; }
  getThemeStore() { return this.themeStore; }
  getSecurityStore() { return this.securityStore; }

  // User Proxy
  async getUser(id: number) { return this.userStore.getUser(id); }
  async getUserByUsername(u: string) { return this.userStore.getUserByUsername(u); }
  async getUserByEmail(e: string) { return this.userStore.getUserByEmail(e); }
  async getUsersByIds(ids: number[]) { return this.userStore.getUsersByIds(ids); }
  async createUser(u: InsertUser) { return this.userStore.createUser(u); }
  async updateUserProfile(id: number, p: any) { return this.userStore.updateUserProfile(id, p); }
  async updateUserPassword(id: number, p: string) { return this.userStore.updateUserPassword(id, p); }
  async updateUserKarma(id: number, k: number) { return this.userStore.updateUserKarma(id, k); }
  async deleteUser(id: number) { return this.userStore.deleteUser(id); }
  async searchUsers(query: string) { return this.userStore.searchUsers(query); }

  // Content Proxy
  async createPost(p: Omit<Post, "id" | "createdAt" | "karma">) { return this.contentStore.createPost(p); }
  async getPosts(o?: { category?: string; communityId?: number; limit?: number; offset?: number }) { return this.contentStore.getPosts(o); }
  async getPost(id: number) { return this.contentStore.getPost(id); }
  async getPostsByUser(id: number) { return this.contentStore.getPostsByUser(id); }
  async getLikedPostsByUser(id: number) { return this.contentStore.getLikedPostsByUser(id); }
  async updatePostKarma(id: number, k: number) { return this.contentStore.updatePostKarma(id, k); }
  async deletePost(id: number) { return this.contentStore.deletePost(id); }
  async createComment(c: Omit<Comment, "id" | "createdAt" | "karma">) { return this.contentStore.createComment(c); }
  async getComments(id: number) { return this.contentStore.getComments(id); }
  async getComment(id: number) { return this.contentStore.getComment(id); }
  async updateCommentKarma(id: number, k: number) { return this.contentStore.updateCommentKarma(id, k); }
  async deleteComment(id: number) { return this.contentStore.deleteComment(id); }

  // Interactions Proxy
  async createPostLike(uId: number, pId: number, isLike: boolean) { return this.contentStore.createPostLike(uId, pId, isLike); }
  async removePostReaction(uId: number, pId: number) { return this.contentStore.removePostReaction(uId, pId); }
  async getUserPostReaction(uId: number, pId: number) { return this.contentStore.getUserPostReaction(uId, pId); }
  async getPostReactions(pId: number) { return this.contentStore.getPostReactions(pId); }
  async getBatchPostReactions(ids: number[]) { return this.contentStore.getBatchPostReactions(ids); }
  async likeComment(uId: number, cId: number) { return this.contentStore.likeComment(uId, cId); }
  async unlikeComment(uId: number, cId: number) { return this.contentStore.unlikeComment(uId, cId); }
  async getUserCommentLike(uId: number, cId: number) { return this.contentStore.getUserCommentLike(uId, cId); }
  async getCommentLikes(cId: number) { return this.contentStore.getCommentLikes(cId); }

  // Verification Proxy
  async createVerificationToken(t: any) { return this.userStore.createVerificationToken(t); }
  async getVerificationToken(t: string) { return this.userStore.getVerificationToken(t); }
  async deleteVerificationToken(t: string) { return this.userStore.deleteVerificationToken(t); }
  async verifyUserEmail(id: number) { return this.userStore.verifyUserEmail(id); }

  // Social Proxy
  async isFollowing(fId: number, tId: number) { return this.userStore.isFollowing(fId, tId); }
  async followUser(fId: number, tId: number) { return this.userStore.followUser(fId, tId); }
  async unfollowUser(fId: number, tId: number) { return this.userStore.unfollowUser(fId, tId); }
  async getMutualFollowers(uId1: number, uId2: number) { return this.userStore.getMutualFollowers(uId1, uId2); }
  async getFollowers(uId: number) { return this.userStore.getFollowers(uId); }
  async getFollowing(uId: number) { return this.userStore.getFollowing(uId); }
  async getFollowerCount(uId: number) { return this.userStore.getFollowerCount(uId); }
  async getFollowingCount(uId: number) { return this.userStore.getFollowingCount(uId); }

  // Content Proxy (additional)
  async getCommentsByUser(uId: number) { return this.contentStore.getCommentsByUser(uId); }

  // Community Proxy
  async createCommunity(c: InsertCommunity & { creatorId: number; slug: string }) { return this.communityStore.createCommunity(c); }
  async getCommunity(id: number) { return this.communityStore.getCommunity(id); }
  async getCommunityBySlug(s: string) { return this.communityStore.getCommunityBySlug(s); }
  async getCommunities(o?: { limit?: number; offset?: number }) { return this.communityStore.getCommunities(o); }
  async getCommunityFeedPosts(uId: number, o?: { limit?: number; offset?: number }) { return this.communityStore.getCommunityFeedPosts(uId, o); }
  async addCommunityMember(cId: number, uId: number, r?: string) { return this.communityStore.addCommunityMember(cId, uId, r); }
  async removeCommunityMember(cId: number, uId: number) { return this.communityStore.removeCommunityMember(cId, uId); }
  async getCommunityMember(cId: number, uId: number) { return this.communityStore.getCommunityMember(cId, uId); }
  async getCommunityMembers(cId: number) { return this.communityStore.getCommunityMembers(cId); }
  async getUserCommunities(uId: number) { return this.communityStore.getUserCommunities(uId); }
  async getModeratedCommunities(uId: number) { return this.communityStore.getModeratedCommunities(uId); }
  async banUserFromCommunity(cId: number, uId: number, r?: string) { return this.communityStore.banUserFromCommunity(cId, uId, r); }
  async unbanUserFromCommunity(cId: number, uId: number) { return this.communityStore.unbanUserFromCommunity(cId, uId); }
  async isUserBannedFromCommunity(cId: number, uId: number) { return this.communityStore.isUserBannedFromCommunity(cId, uId); }
  async getCommunityBans(cId: number) { return this.communityStore.getCommunityBans(cId); }

  // Themes Proxy
  async createTheme(uId: number, t: InsertTheme) { return this.themeStore.createTheme(uId, t); }
  async getThemes(uId: number) { return this.themeStore.getThemes(uId); }
  async deleteTheme(id: number) { return this.themeStore.deleteTheme(id); }
  async updateTheme(id: number, t: Partial<InsertTheme>) { return this.themeStore.updateTheme(id, t); }

  // Notifications Proxy
  async getNotifications(userId: number, options?: any) { return this.notificationStore.getNotifications(userId, options); }
  async getNotificationCounts(userId: number) { return this.notificationStore.getNotificationCounts(userId); }
  async markNotificationsAsSeen(userId: number) { return this.notificationStore.markNotificationsAsSeen(userId); }
  async markAllNotificationsAsRead(userId: number) { return this.notificationStore.markAllNotificationsAsRead(userId); }
  async markNotificationAsRead(id: number) { return this.notificationStore.markNotificationAsRead(id); }
  async deleteNotification(id: number) { return this.notificationStore.deleteNotification(id); }
  async getNotificationPreferences(userId: number) { return this.notificationStore.getNotificationPreferences(userId); }
  async updateNotificationPreferences(userId: number, update: any) { return this.notificationStore.updateNotificationPreferences(userId, update); }
}

export const storage = new DatabaseStorage();
