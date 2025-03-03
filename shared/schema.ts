import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  karma: integer("karma").notNull().default(5),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  authorId: integer("author_id").notNull(),
  category: text("category").notNull(), // 'discussion', 'news', 'entertainment'
  karma: integer("karma").notNull().default(5),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"), // 'image' or 'video'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  authorId: integer("author_id").notNull(),
  postId: integer("post_id").notNull(),
  karma: integer("karma").notNull().default(5),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  reason: text("reason").notNull(),
  reporterId: integer("reporter_id").notNull(),
  postId: integer("post_id"),
  commentId: integer("comment_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Base post schema
const basePostSchema = createInsertSchema(posts).pick({
  title: true,
  content: true,
  category: true,
});

// Discussion post schema (text only)
export const insertDiscussionPostSchema = basePostSchema.extend({
  category: z.literal("discussion"),
});

// News and entertainment post schema (with media)
export const insertMediaPostSchema = basePostSchema.extend({
  category: z.enum(["news", "entertainment"]),
  mediaFile: z.any().optional(), // File input field
  mediaType: z.enum(["image", "video"]).optional(),
});

export const insertCommentSchema = createInsertSchema(comments).pick({
  content: true,
  postId: true,
});

export const insertReportSchema = createInsertSchema(reports).pick({
  reason: true,
  postId: true,
  commentId: true,
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertDiscussionPost = z.infer<typeof insertDiscussionPostSchema>;
export type InsertMediaPost = z.infer<typeof insertMediaPostSchema>;
export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Report = typeof reports.$inferSelect;