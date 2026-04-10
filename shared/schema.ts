import { pgTable, text, serial, integer, timestamp, boolean, unique, index, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  karma: integer("karma").notNull().default(0),
  emailVerified: boolean("email_verified").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  role: text("role").notNull().default("user"),
  verified: boolean("verified").notNull().default(false),
  bio: text("bio"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const verificationTokens = pgTable("verification_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
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
  communityId: integer("community_id"), // Optional: if belongs to a community
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  authorIdx: index("posts_author_idx").on(t.authorId),
  communityIdx: index("posts_community_idx").on(t.communityId),
  categoryIdx: index("posts_category_idx").on(t.category),
}));

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  authorId: integer("author_id").notNull(),
  postId: integer("post_id").notNull(),
  karma: integer("karma").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  postIdIdx: index("comments_post_idx").on(t.postId),
  authorIdIdx: index("comments_author_idx").on(t.authorId),
}));

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  reason: text("reason").notNull(),
  reporterId: integer("reporter_id").notNull(),
  postId: integer("post_id"),
  commentId: integer("comment_id"),
  discussionId: integer("discussion_id"),
  ipAddress: text("ip_address"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const followers = pgTable(
  "followers",
  {
    id: serial("id").primaryKey(),
    followerId: integer("follower_id").notNull(),
    followingId: integer("following_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueFollow: unique().on(t.followerId, t.followingId),
  }),
);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  actorId: integer("actor_id"), // User who triggered the action
  type: text("type").notNull(),
  
  // References for navigation
  postId: integer("post_id"),
  commentId: integer("comment_id"),
  communityId: integer("community_id"),
  
  // Content
  title: text("title"),
  message: text("message"),
  preview: text("preview"),
  actionUrl: text("action_url"),
  
  // Status
  read: boolean("read").notNull().default(false),
  seen: boolean("seen").notNull().default(false), // For badge clearing
  archived: boolean("archived").notNull().default(false),
  
  // Grouping
  groupKey: text("group_key"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notificationPreferences = pgTable("notification_preferences", {
  userId: integer("user_id").primaryKey(),
  
  // Toggle switches for different types
  likePost: boolean("like_post").notNull().default(true),
  likeComment: boolean("like_comment").notNull().default(true),
  commentPost: boolean("comment_post").notNull().default(true),
  replyComment: boolean("reply_comment").notNull().default(true),
  mentionPost: boolean("mention_post").notNull().default(true),
  mentionComment: boolean("mention_comment").notNull().default(true),
  newFollower: boolean("new_follower").notNull().default(true),
  communityInvite: boolean("community_invite").notNull().default(true),
  communityPost: boolean("community_post").notNull().default(false),
  postMilestone: boolean("post_milestone").notNull().default(true),
  systemAnnouncement: boolean("system_announcement").notNull().default(true),
  
  // Delivery channels
  browserNotifications: boolean("browser_notifications").notNull().default(false),
  
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id").notNull(),
  content: text("content").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const postLikes = pgTable(
  "post_likes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    postId: integer("post_id").notNull(),
    isLike: boolean("is_like").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueLike: unique().on(t.userId, t.postId),
  }),
);

export const commentLikes = pgTable(
  "comment_likes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    commentId: integer("comment_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueLike: unique().on(t.userId, t.commentId),
  }),
);

// Community Tables
export const communities = pgTable("communities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  slug: text("slug").notNull().unique(),
  creatorId: integer("creator_id").notNull(),
  imageUrl: text("image_url"),
  allowedCategories: text("allowed_categories").notNull().default("news,entertainment,discussion"),
  isPrivate: boolean("is_private").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const communityMembers = pgTable("community_members", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull().default("member"), // 'owner', 'moderator', 'member'
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const communityBans = pgTable("community_bans", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull(),
  userId: integer("user_id").notNull(),
  reason: text("reason"),
  bannedAt: timestamp("banned_at").notNull().defaultNow(),
});

export const communityJoinRequests = pgTable("community_join_requests", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull(),
  userId: integer("user_id").notNull(),
  status: text("status", { enum: ["pending", "approved", "declined"] }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const themes = pgTable("themes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  colors: text("colors").notNull(), // JSON string of the theme configuration
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// FEATURE [AL-001]: Activity Logs Table (V2 - Full Monitoring)
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
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
  status: text("status").notNull().default("success"),
  severity: text("severity").notNull().default("info"),
  isAnomaly: integer("is_anomaly").default(0),
  anomalyType: text("anomaly_type"),
  anomalyScore: real("anomaly_score"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const anomalyEvents = pgTable("anomaly_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  anomalyType: text("anomaly_type").notNull(),
  severity: text("severity").notNull().default("warning"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  evidence: text("evidence").default("{}"),
  triggerValue: real("trigger_value"),
  thresholdValue: real("threshold_value"),
  status: text("status").default("open"),
  resolvedBy: integer("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
  autoAction: text("auto_action"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const systemMetrics = pgTable("system_metrics", {
  id: serial("id").primaryKey(),
  metricName: text("metric_name").notNull(),
  metricValue: real("metric_value").notNull(),
  metricUnit: text("metric_unit"),
  dimensions: text("dimensions").default("{}"),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  granularity: text("granularity").default("minute"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const alertHistory = pgTable("alert_history", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").references(() => alertRules.id),
  ruleName: text("rule_name").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  metricValue: real("metric_value"),
  thresholdValue: real("threshold_value"),
  status: text("status").default("firing"),
  acknowledgedBy: integer("acknowledged_by").references(() => users.id, { onDelete: "set null" }),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// FEATURE [AS-001]: Admin Settings Table
export const adminSettings = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  key: text("key").notNull(),
  value: text("value"),
  valueType: text("value_type", { enum: ["string", "integer", "boolean", "json", "text"] }).notNull().default("string"),
  label: text("label").notNull(),
  description: text("description"),
  defaultValue: text("default_value"),
  isSensitive: boolean("is_sensitive").notNull().default(false),
  isReadonly: boolean("is_readonly").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: integer("updated_by"),
}, (t) => ({
  uniqueSetting: unique().on(t.category, t.key),
}));

const basePostSchema = createInsertSchema(posts).pick({
  title: true,
  content: true,
  category: true,
});

// Schemas for Communities
export const insertCommunitySchema = createInsertSchema(communities)
  .pick({
    name: true,
    description: true,
    imageUrl: true,
    allowedCategories: true,
    isPrivate: true,
  })
  .extend({
    name: z
      .string()
      .min(3, "Name must be at least 3 characters")
      .max(50, "Name must be less than 50 characters"),
    description: z.string().min(10, "Description must be at least 10 characters"),
    imageUrl: z.string().optional(),
    allowedCategories: z.string().default("news,entertainment,discussion"),
    isPrivate: z.boolean().default(false).optional(),
  });

export const insertDiscussionPostSchema = basePostSchema.extend({
  category: z.literal("discussion"),
  communityId: z.number().optional(),
});

export const insertMediaPostSchema = basePostSchema.extend({
  category: z.enum(["news", "entertainment"]),
  mediaFile: z.any().optional(),
  mediaType: z.enum(["image", "video"]).optional(),
  communityId: z.number().optional(),
});

export const insertCommentSchema = createInsertSchema(comments).pick({
  content: true,
  postId: true,
}).extend({
  content: z.string().min(1, "Comment cannot be empty").max(10000, "Comment too long"),
});

export const insertReportSchema = createInsertSchema(reports).pick({
  reason: true,
  postId: true,
  commentId: true,
  discussionId: true,
});

export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    email: true,
    password: true,
    emailVerified: true,
  })
  .extend({
    email: z.string().email("Please enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  });

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z
  .object({
    username: z.string().min(1, "Username is required"),
    email: z.string().email("Please enter a valid email address"),
    bio: z.string().optional(),
  })
  .partial();

export const updatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters long")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const followUserSchema = z.object({
  userId: z.number(),
});

export const messageSchema = z.object({
  receiverId: z.number(),
  content: z.string().min(1, "Message cannot be empty").max(5000, "Message too long"),
});

export const adminUpdateUserSchema = z.object({
  username: z.string().min(1, "Username is required").optional(),
  email: z.string().email("Please enter a valid email address").optional(),
  isAdmin: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  verified: z.boolean().optional(),
  role: z.string().optional(),
  karma: z.number().optional(),
});

export const adminUpdateReportSchema = z.object({
  status: z.enum(["pending", "resolved", "rejected"]),
  resolution: z.string().optional(),
});

export const insertThemeSchema = createInsertSchema(themes).pick({
  name: true,
  colors: true,
});

export type LoginCredentials = z.infer<typeof loginSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertDiscussionPost = z.infer<typeof insertDiscussionPostSchema>;
export type InsertMediaPost = z.infer<typeof insertMediaPostSchema>;
export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type UpdatePassword = z.infer<typeof updatePasswordSchema>;
export type PostLike = typeof postLikes.$inferSelect;
export type Follower = typeof followers.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof messageSchema>;
export type AdminUpdateUser = z.infer<typeof adminUpdateUserSchema>;
export type AdminUpdateReport = z.infer<typeof adminUpdateReportSchema>;
export type Theme = typeof themes.$inferSelect;
export type InsertTheme = z.infer<typeof insertThemeSchema>;

// Community Types
export type Community = typeof communities.$inferSelect;
export type CommunityMember = typeof communityMembers.$inferSelect;
export type CommunityBan = typeof communityBans.$inferSelect;
export type CommunityJoinRequest = typeof communityJoinRequests.$inferSelect;
export type InsertCommunity = z.infer<typeof insertCommunitySchema>;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type AdminSetting = typeof adminSettings.$inferSelect;
export type AnomalyEvent = typeof anomalyEvents.$inferSelect;
export type SystemMetric = typeof systemMetrics.$inferSelect;
export type AlertRule = typeof alertRules.$inferSelect;
export type AlertHistoryItem = typeof alertHistory.$inferSelect;

export const insertActivityLogSchema = createInsertSchema(activityLogs);
export const insertAnomalyEventSchema = createInsertSchema(anomalyEvents);
export const insertSystemMetricSchema = createInsertSchema(systemMetrics);
export const insertAlertRuleSchema = createInsertSchema(alertRules);
export const insertAlertHistorySchema = createInsertSchema(alertHistory);
export const insertAdminSettingSchema = createInsertSchema(adminSettings);
export const updateAdminSettingSchema = insertAdminSettingSchema.pick({ value: true });

// ==========================================
// TICKET SYSTEM
// ==========================================

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  ticketNumber: text("ticket_number").notNull().unique(),
  createdBy: integer("created_by").notNull(),
  assignedTo: integer("assigned_to"),
  type: text("type").notNull().default("other"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  relatedUserId: integer("related_user_id"),
  relatedPostId: integer("related_post_id"),
  relatedUrl: text("related_url"),
  attachments: text("attachments").default("[]"),
  tags: text("tags").default("[]"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  createdByIdx: index("idx_tickets_created_by").on(t.createdBy),
  assignedToIdx: index("idx_tickets_assigned_to").on(t.assignedTo),
  statusIdx: index("idx_tickets_status").on(t.status),
  priorityIdx: index("idx_tickets_priority").on(t.priority),
}));

export const ticketComments = pgTable("ticket_comments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  authorId: integer("author_id").notNull(),
  content: text("content").notNull(),
  isInternal: integer("is_internal").notNull().default(0),
  isSystem: integer("is_system").notNull().default(0),
  changeType: text("change_type"),
  changeFrom: text("change_from"),
  changeTo: text("change_to"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  ticketIdIdx: index("idx_ticket_comments_ticket_id").on(t.ticketId),
  authorIdIdx: index("idx_ticket_comments_author_id").on(t.authorId),
}));

export const ticketStatusHistory = pgTable("ticket_status_history", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  changedBy: integer("changed_by").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  ticketIdIdx: index("idx_ticket_history_ticket_id").on(t.ticketId),
}));

export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = typeof tickets.$inferInsert;
export type TicketComment = typeof ticketComments.$inferSelect;
export type InsertTicketComment = typeof ticketComments.$inferInsert;
export type TicketStatusHistory = typeof ticketStatusHistory.$inferSelect;
export type InsertTicketStatusHistory = typeof ticketStatusHistory.$inferInsert;

export const insertTicketSchema = createInsertSchema(tickets).pick({
  title: true,
  description: true,
  type: true,
  priority: true,
  relatedUserId: true,
  relatedPostId: true,
  relatedUrl: true,
  tags: true,
  attachments: true,
});
