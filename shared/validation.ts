/**
 * Request validation rules (zod) shared by the server and the browser.
 *
 * This module must stay free of drizzle / table definitions: the client imports it, and everything it imports
 * ends up in the public JavaScript bundle. shared/schema.ts re-exports it, so the server keeps importing the
 * same schemas from "@shared/schema" and the rules are identical on both sides.
 */
import { z } from "zod";
import { isCommonPassword } from "./common-passwords";

// Zod schemas
// Public registration may only set these fields; role, karma, verification etc. stay at their defaults.
// Account field rules, shared by registration and the profile edit
export const usernameField = z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_.-]+$/, "Only letters, numbers, '.', '_' and '-' are allowed");
export const emailField = z.string().trim().max(254).email();
export const newPasswordField = z.string().min(8).max(128)
  .refine((p) => !isCommonPassword(p), "This password is too common. Please choose another one.");
export const insertUserSchema = z.object({
  username: usernameField,
  email: emailField,
  password: newPasswordField,
});
// Request schemas (the admin ones are in schema.ts, server only): only client-editable fields, trimmed text with length limits, no NUL
// characters (Postgres rejects them), 0/1 flags only (int columns).
export const reqText = (max: number, min = 0) =>
  z.string().trim().min(min).max(max).refine((s) => !s.includes("\u0000"), { message: "Invalid characters" });
export const reqFlag = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => (v === true || v === 1 ? 1 : 0));
export const reqInt = (min: number, max: number) => z.number().int().min(min).max(max);

// Community creation: only these fields are accepted (id, createdAt etc. are dropped); creatorId and slug are set by the server.
const noNul = (s: string) => !s.includes("\u0000");
const HAS_LETTER_OR_DIGIT = new RegExp("[\\p{L}\\p{N}]", "u"); // any script, not only ASCII
// Comma list of post categories (same names as POST_CATEGORIES in server/routes/posts.ts)
const COMMUNITY_CATEGORIES = /^(news|entertainment|discussion|general)(,(news|entertainment|discussion|general)){0,3}$/;
export const insertCommunitySchema = z.object({
  name: z.string().trim().min(3).max(100)
    .refine(noNul, "Invalid characters")
    .refine((s) => HAS_LETTER_OR_DIGIT.test(s), "The name must contain letters or digits"),
  description: z.string().trim().max(1000).refine(noNul, "Invalid characters").nullable().optional(),
  imageUrl: z.union([
    z.literal(""),
    z.string().trim().max(2048).url().refine((u) => /^https?:\/\//i.test(u), "Only http(s) image URLs are allowed"),
    z.string().regex(/^\/uploads\/[\w.-]+$/).refine((u) => !u.includes(".."), "Invalid image URL"),
  ]).nullable().optional(),
  allowedCategories: z.union([z.literal(""), z.string().regex(COMMUNITY_CATEGORIES)]).optional(),
  isPrivate: z.boolean().optional().default(false),
  creatorId: z.number().nullable().optional(),
  slug: z.string().nullable().optional(),
});
// Themes: the owner comes from the session; id/createdAt are never taken from the request.
export const insertThemeSchema = z.object({
  name: reqText(60, 1),
  // JSON object with the theme tokens (see client/src/lib/theme-utils.ts)
  colors: reqText(20000, 1).refine((s) => {
    try {
      const v = JSON.parse(s);
      return !!v && typeof v === "object" && !Array.isArray(v);
    } catch {
      return false;
    }
  }, { message: "Invalid format" }),
});
// Self-service profile edits are limited to cosmetic fields so users cannot change their own role or karma.
const profileText = (max: number) =>
  z.string().trim().max(max).refine((v) => !v.includes("\u0000"), "Invalid characters").nullable().optional();
// Website: empty, or an http(s) URL; a bare domain ("example.com") gets https:// in front.
const websiteField = z.string().trim().max(200)
  .transform((v) => (v === "" || /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    if (v === "") return true;
    if (/[\s<>"\u0000]/.test(v)) return false;
    try {
      const u = new URL(v);
      return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Website must be an http(s) URL")
  .nullable()
  .optional();
export const updateProfileSchema = z.object({
  username: usernameField.optional(),
  email: emailField.optional(),
  displayName: profileText(100),
  bio: profileText(500),
  location: profileText(100),
  website: websiteField,
  avatarUrl: profileText(500),
  coverUrl: profileText(500),
  profilePictureUrl: profileText(500),
  // 0/1 or true/false only (any other number used to be stored as is)
  isPrivate: z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => (v === true || v === 1 ? 1 : 0)).optional(),
});
export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: newPasswordField,
});
// Direct messages: the sender is the logged-in user; other body fields (senderId, read, id) are dropped.
export const messageSchema = z.object({
  receiverId: z.number().int().positive().max(2147483647),
  content: z.string().trim().min(1).max(5000).refine((s) => !s.includes("\u0000"), "Invalid characters"),
});
export const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

// Post forms in the client (news / entertainment / discussion). Same shape drizzle-zod's createInsertSchema(posts)
// produced, written out so this module needs no table definitions (it is bundled into the browser).
const postFormBase = z.object({
  id: z.number().int().optional(),
  title: z.string(),
  content: z.string(),
  authorId: z.number().optional(),
  category: z.string().optional(),
  karma: z.number().int().optional(),
  mediaUrl: z.string().nullable().optional(),
  mediaType: z.string().nullable().optional(),
  communityId: z.number().int().nullable().optional(),
  createdAt: z.date().optional(),
});
export const insertMediaPostSchema = postFormBase.extend({
  mediaFile: z.any().optional(),
});

export const insertDiscussionPostSchema = postFormBase;

export const insertCommentSchema = z.object({
  content: z.string().trim().min(1).max(10000).refine((s) => !s.includes("\u0000"), "Invalid characters"),
  postId: z.number().int().positive().max(2147483647),
});

const reportTargetId = z.number().int().positive().max(2147483647).optional().nullable();
export const insertReportSchema = z
  .object({
    reason: z.string().trim().min(1).max(1000).refine((s) => !s.includes("\u0000"), "Invalid characters"),
    postId: reportTargetId,
    commentId: reportTargetId,
    discussionId: reportTargetId,
  })
  // Exactly one target: a report about nothing, or about two things at once, cannot be handled (CONTENT-7)
  .refine((r) => [r.postId, r.commentId, r.discussionId].filter((v) => v != null).length === 1, {
    message: "Exactly one of postId, commentId or discussionId is required",
    path: ["postId"],
  });

export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type LoginCredentials = z.infer<typeof loginSchema>;
