import { pgTable, text, serial, integer, timestamp, boolean, unique, index, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// APE-FIX [SCHEMA-001]: Universal Integer Schema (PG-Core with SQLite Compatibility)
// Using integer for booleans (0/1) and timestamps (Unix) to ensure cross-DB compatibility.

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  karma: integer("karma").notNull().default(0),
  emailVerified: integer("email_verified").notNull().default(0),
  isAdmin: integer("is_admin").notNull().default(0),
  role: text("role").notNull().default("user"),
  verified: integer("verified").notNull().default(0),
  bio: text("bio"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  profilePictureUrl: text("profile_picture_url"), // Compatibility field
  coverUrl: text("cover_url"),
  location: text("location"),
  website: text("website"),
  isPrivate: integer("is_private").notNull().default(0),
  isFrozen: integer("is_frozen").default(0),
  isShadowBanned: integer("is_shadow_banned").default(0),
  frozenUntil: integer("frozen_until"),
  freezeReason: text("freeze_reason"),
  createdAt: integer("created_at").notNull(), 
});

export const verificationTokens = pgTable("verification_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: integer("user_id").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  authorId: integer("author_id").notNull(),
  category: text("category").notNull(),
  karma: integer("karma").notNull().default(0),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  communityId: integer("community_id"),
  createdAt: integer("created_at").notNull(),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  authorId: integer("author_id").notNull(),
  postId: integer("post_id").notNull(),
  karma: integer("karma").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  reason: text("reason").notNull(),
  reporterId: integer("reporter_id").notNull(),
  postId: integer("post_id"),
  commentId: integer("comment_id"),
  discussionId: integer("discussion_id"),
  status: text("status").notNull().default("pending"),
  ipAddress: text("ip_address"),
  createdAt: integer("created_at").notNull(),
  resolvedBy: integer("resolved_by"),
  resolvedAt: integer("resolved_at"),
  resolutionTimeSeconds: integer("resolution_time_seconds"),
});

export const followers = pgTable("followers", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull(),
  followingId: integer("following_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  actorId: integer("actor_id"),
  type: text("type").notNull(),
  postId: integer("post_id"),
  commentId: integer("comment_id"),
  communityId: integer("community_id"),
  title: text("title"),
  message: text("message"),
  preview: text("preview"),
  actionUrl: text("action_url"),
  read: integer("read").notNull().default(0),
  seen: integer("seen").notNull().default(0),
  archived: integer("archived").notNull().default(0),
  groupKey: text("group_key"),
  createdAt: integer("created_at").notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id").notNull(),
  content: text("content").notNull(),
  read: integer("read").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const postLikes = pgTable("post_likes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  postId: integer("post_id").notNull(),
  isLike: integer("is_like").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});

export const commentLikes = pgTable("comment_likes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  commentId: integer("comment_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const communities = pgTable("communities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  imageUrl: text("image_url"),
  creatorId: integer("creator_id").notNull(),
  allowedCategories: text("allowed_categories").notNull().default('news,entertainment,discussion'),
  isPrivate: integer("is_private").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const communityMembers = pgTable("community_members", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull().default('member'),
  joinedAt: integer("joined_at").notNull(),
});

export const communityBans = pgTable("community_bans", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull(),
  userId: integer("user_id").notNull(),
  reason: text("reason"),
  bannedAt: integer("banned_at").notNull(),
});

export const communityJoinRequests = pgTable("community_join_requests", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull(),
  userId: integer("user_id").notNull(),
  status: text("status").notNull().default('pending'),
  createdAt: integer("created_at").notNull(),
});

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  userEmail: text("user_email"),
  userRole: text("user_role"),
  userUsername: text("user_username"),
  action: text("action").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  targetType: text("target_type"),
  targetId: text("target_id"),
  targetLabel: text("target_label"),
  description: text("description").notNull(),
  metadata: text("metadata").default("{}"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  ipAddress: text("ip_address"),
  ipCountry: text("ip_country"),
  ipCity: text("ip_city"),
  userAgent: text("user_agent"),
  deviceType: text("device_type"),
  deviceOs: text("device_os"),
  deviceBrowser: text("device_browser"),
  sessionId: text("session_id"),
  deviceFingerprint: text("device_fingerprint"),
  status: text("status").notNull().default("success"),
  severity: text("severity").notNull().default("info"),
  isAnomaly: integer("is_anomaly").default(0),
  anomalyType: text("anomaly_type"),
  anomalyScore: real("anomaly_score"),
  createdAt: integer("created_at").notNull(),
});

export const anomalyEvents = pgTable("anomaly_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  anomalyType: text("anomaly_type").notNull(),
  severity: text("severity").notNull().default("warning"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  evidence: text("evidence").default("{}"),
  triggerValue: real("trigger_value"),
  thresholdValue: real("threshold_value"),
  status: text("status").default("open"),
  resolvedBy: integer("resolved_by"),
  resolvedAt: integer("resolved_at"),
  resolutionNote: text("resolution_note"),
  autoAction: text("auto_action"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const bans = pgTable("bans", {
  id: serial("id").primaryKey(),
  banType: text("ban_type").notNull(), 
  userId: integer("user_id"),
  ipAddress: text("ip_address"),
  ipRange: text("ip_range"),
  deviceFingerprint: text("device_fingerprint"),
  reason: text("reason").notNull(),
  severity: text("severity").notNull().default("medium"),
  isPermanent: integer("is_permanent").default(0),
  expiresAt: integer("expires_at"),
  isShadow: integer("is_shadow").default(0),
  createdBy: integer("created_by"),
  createdByType: text("created_by_type").default("admin"), 
  anomalyId: integer("anomaly_id"),
  isActive: integer("is_active").default(1),
  revokedBy: integer("revoked_by"),
  revokedAt: integer("revoked_at"),
  revokeReason: text("revoke_reason"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const autoPunishmentRules = pgTable("auto_punishment_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: integer("is_active").default(1),
  anomalyType: text("anomaly_type").notNull(),
  severityThreshold: text("severity_threshold").notNull().default("high"),
  action: text("action").notNull(),
  actionDurationHours: integer("action_duration_hours"),
  actionReason: text("action_reason").notNull(),
  escalateAfterCount: integer("escalate_after_count").default(1),
  escalationWindowHours: integer("escalation_window_hours").default(24),
  cooldownHours: integer("cooldown_hours").default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const autoPunishmentExecutions = pgTable("auto_punishment_executions", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id"),
  ruleName: text("rule_name").notNull(),
  anomalyId: integer("anomaly_id"),
  userId: integer("user_id"),
  banId: integer("ban_id"),
  actionTaken: text("action_taken").notNull(),
  actionDetail: text("action_detail"),
  success: integer("success").default(1),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").notNull(),
});

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  ticketNumber: text("ticket_number").notNull().unique(),
  createdBy: integer("created_by").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const systemMetrics = pgTable("system_metrics", {
  id: serial("id").primaryKey(),
  metricName: text("metric_name").notNull(),
  metricValue: real("metric_value").notNull(),
  metricUnit: text("metric_unit"),
  dimensions: text("dimensions").default("{}"),
  periodStart: integer("period_start").notNull(),
  periodEnd: integer("period_end").notNull(),
  granularity: text("granularity").default("minute"),
  createdAt: integer("created_at").notNull(),
});

export const alertRules = pgTable("alert_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  metric: text("metric").notNull(),
  condition: text("condition").notNull(),
  threshold: real("threshold").notNull(),
  windowSeconds: integer("window_seconds").default(300),
  severity: text("severity").notNull().default("warning"),
  isActive: integer("is_active").default(1),
  createdAt: integer("created_at").notNull(),
});

export const alertHistory = pgTable("alert_history", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id"),
  ruleName: text("rule_name").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  metricValue: real("metric_value"),
  thresholdValue: real("threshold_value"),
  status: text("status").default("firing"),
  acknowledgedBy: integer("acknowledged_by"),
  acknowledgedAt: integer("acknowledged_at"),
  resolvedAt: integer("resolved_at"),
  createdAt: integer("created_at").notNull(),
});

export const bulkActionLogs = pgTable("bulk_action_logs", {
  id: serial("id").primaryKey(),
  performedBy: integer("performed_by").notNull(),
  actionType: text("action_type").notNull(),
  targetType: text("target_type").notNull(),
  targetIds: text("target_ids").notNull(),
  targetCount: integer("target_count").notNull(),
  successCount: integer("success_count").default(0),
  failCount: integer("fail_count").default(0),
  reason: text("reason"),
  metadata: text("metadata").default("{}"),
  createdAt: integer("created_at").notNull(),
});

export const notificationPreferences = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  communityPost: integer("community_post").notNull().default(1),
  postMilestone: integer("post_milestone").notNull().default(1),
  systemAnnouncement: integer("system_announcement").notNull().default(1),
  browserNotifications: integer("browser_notifications").notNull().default(1),
  updatedAt: integer("updated_at"),
});

export const themes = pgTable("themes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  colors: text("colors").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const adminSettings = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  value: text("value"),
  valueType: text("value_type").notNull().default("string"),
  isSensitive: integer("is_sensitive").default(0),
  isReadonly: integer("is_readonly").default(0),
  updatedBy: integer("updated_by"),
  updatedAt: integer("updated_at"),
});

export const creatorAnalytics = pgTable("creator_analytics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  snapshotDate: text("snapshot_date").notNull(),
  newPosts: integer("new_posts").default(0),
  totalPosts: integer("total_posts").default(0),
  newFollowers: integer("new_followers").default(0),
  totalFollowers: integer("total_followers").default(0),
  postLikesReceived: integer("post_likes_received").default(0),
  postCommentsReceived: integer("post_comments_received").default(0),
  totalReach: integer("total_reach").default(0),
  engagementScore: real("engagement_score").default(0),
  createdAt: integer("created_at").notNull(),
});

export const communityAnalytics = pgTable("community_analytics", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull(),
  snapshotDate: text("snapshot_date").notNull(),
  newMembers: integer("new_members").default(0),
  totalMembers: integer("total_members").default(0),
  newPosts: integer("new_posts").default(0),
  totalPosts: integer("total_posts").default(0),
  activeMembers: integer("active_members").default(0),
  engagementScore: real("engagement_score").default(0),
  createdAt: integer("created_at").notNull(),
});

export const analyticsSnapshots = pgTable("analytics_snapshots", {
  id: serial("id").primaryKey(),
  snapshotDate: text("snapshot_date").notNull(),
  snapshotHour: integer("snapshot_hour"),
  granularity: text("granularity").notNull().default('day'),
  newUsers: integer("new_users").default(0),
  totalUsers: integer("total_users").default(0),
  activeUsersDay: integer("active_users_day").default(0),
  activeUsersWeek: integer("active_users_week").default(0),
  activeUsersMonth: integer("active_users_month").default(0),
  newPosts: integer("new_posts").default(0),
  newComments: integer("new_comments").default(0),
  newLikes: integer("new_likes").default(0),
  newFollows: integer("new_follows").default(0),
  newCommunities: integer("new_communities").default(0),
  engagementRate: real("engagement_rate").default(0),
  d1Retention: real("d1_retention").default(0),
  createdAt: integer("created_at").notNull(),
});

// Zod schemas
export const insertUserSchema = createInsertSchema(users).pick({ username: true, email: true, password: true });
export const insertCommunitySchema = createInsertSchema(communities);
export const insertCommentSchema = createInsertSchema(comments);
export const insertReportSchema = createInsertSchema(reports);
export const insertThemeSchema = createInsertSchema(themes);
export const insertAutoPunishmentRuleSchema = createInsertSchema(autoPunishmentRules);
export const adminUpdateUserSchema = createInsertSchema(users).partial();
export const adminUpdateReportSchema = createInsertSchema(reports).partial();
export const updateProfileSchema = createInsertSchema(users).partial();
export const updatePasswordSchema = z.object({ password: z.string().min(1) });
export const messageSchema = createInsertSchema(messages);
export const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

// Specialized Post Schemas for the Frontend
export const insertMediaPostSchema = createInsertSchema(posts).extend({
  mediaFile: z.any().optional(),
});

export const insertDiscussionPostSchema = createInsertSchema(posts);

// Types
export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type AnomalyEvent = typeof anomalyEvents.$inferSelect;
export type Ban = typeof bans.$inferSelect;
export type AutoPunishmentRule = typeof autoPunishmentRules.$inferSelect;
export type AutoPunishmentExecution = typeof autoPunishmentExecutions.$inferSelect;
export type Theme = typeof themes.$inferSelect;
export type InsertTheme = typeof themes.$inferInsert;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type AdminSetting = typeof adminSettings.$inferSelect;
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type CreatorAnalytics = typeof creatorAnalytics.$inferSelect;
export type CommunityAnalytics = typeof communityAnalytics.$inferSelect;
