import { Router, type Request, type Response, type NextFunction } from "express";
import fs from "node:fs";
import multer from "multer";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import {
    postUpload,
    checkFileSignature,
    sanitizeImage,
    ImageRejectedError,
    UploadTypeError,
} from "../utils/file-upload";
import { checkContent } from "../services/moderation";
import { logSecurityEvent } from "../utils/logger";
import { notificationService } from "../services/notification-service";
import { SettingsService } from "../services/settings";
import { activityLogger } from "../services/activity-logger";
import { parsePagination } from "../utils/pagination";
import { getPostExtras, DELETED_AUTHOR } from "../utils/post-extras";
import { parseId, validateIdParams } from "../utils/params";
import { toPublicUser } from "../utils/public-user";
import { sendValidationError, sendInternalError } from "../utils/http-errors";
import { canDeleteContent } from "../utils/permissions";
import {
    isStaff,
    canViewCommunity,
    canViewPost,
    canInteractWithPost,
    filterVisiblePosts,
    filterShadowHidden,
    broadcastAboutPost,
} from "../utils/community-access";

const router = Router();
// Malformed ids ("abc", "1.5", "-1", > int4) answer 404 before any handler runs (CONTENT-10, AUTHZ-12).
validateIdParams(router, ["id", "postId"]);

export const POST_CATEGORIES = ["news", "entertainment", "discussion", "general"] as const;
export const POST_TITLE_MAX = 300;
export const POST_CONTENT_MAX = 20_000;
const IMAGE_LIMIT = 10 * 1024 * 1024; // 10 MB for images; videos may use the full 50 MB upload limit
const MAX_OFFSET = 1_000_000;

const noNul = (s: string) => !s.includes("\u0000");
const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

// Body of POST /api/posts (JSON or multipart). Unknown fields (authorId, karma, mediaUrl, mediaType …) are dropped.
const createPostSchema = z.object({
    title: z.preprocess(emptyToUndefined, z.string().trim().max(POST_TITLE_MAX).refine(noNul, "Invalid characters").optional()),
    content: z.preprocess(emptyToUndefined, z.string().max(POST_CONTENT_MAX).refine(noNul, "Invalid characters").optional()),
    category: z.preprocess(emptyToUndefined, z.enum(POST_CATEGORIES).optional()),
    // Forms send the id as a string: only plain positive integers are accepted ("abc", "1.5", true → 400).
    communityId: z.preprocess(
        (v) => (v === "" || v === null || v === undefined ? undefined : parseId(v) ?? v),
        z.number().int().positive().max(2_147_483_647).optional(),
    ),
});

const notFound = (res: Response) => res.status(404).json({ error: "Post not found", code: "NOT_FOUND" });
const bannedFromCommunity = (res: Response) =>
    res.status(403).json({ error: "You are banned from this community.", code: "COMMUNITY_BANNED" });

/** Deletes every file multer stored for this request (rejected posts must not leave orphans, ATK-UPLOAD-4). */
function removeUploadedFiles(req: Request) {
    const files = Array.isArray(req.files) ? req.files : [];
    for (const f of files) fs.promises.unlink(f.path).catch(() => {});
}

// Runs multer and turns its errors into clear 4xx answers instead of the generic 500 handler (CONTENT-13/16).
function receivePostMedia(req: Request, res: Response, next: NextFunction) {
    postUpload.any()(req, res, (err: unknown) => {
        if (!err) return next();
        removeUploadedFiles(req);
        if (err instanceof UploadTypeError) {
            logSecurityEvent({ type: "FILE_UPLOAD_REJECTED", details: { reason: "Type not allowed (Post)", mime: err.mimetype } });
            return res.status(400).json({ error: "Only JPG, PNG, GIF, MP4 or WebM files are allowed", code: "INVALID_TYPE" });
        }
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ error: "File too large (max. 50 MB)", code: "FILE_TOO_LARGE" });
        }
        // Other multer limits (several files, too many fields) and broken multipart bodies (busboy errors).
        return res.status(400).json({ error: "Invalid upload", code: "INVALID_UPLOAD" });
    });
}

/** Rejects array/object query values (?category[$ne]=x) with 400 instead of passing them to the database. */
function nonStringQuery(req: Request, res: Response, names: string[]): boolean {
    for (const name of names) {
        const v = req.query[name];
        if (v !== undefined && typeof v !== "string") {
            res.status(400).json({ error: "Invalid input", code: "VALIDATION_ERROR", issues: [{ path: name, code: "invalid_type" }] });
            return true;
        }
    }
    return false;
}

// Create post with optional media upload
router.post("/", isAuthenticated, receivePostMedia, async (req, res) => {
    let keepFiles = false;
    try {
        const user = req.user as any;
        const parsed = createPostSchema.safeParse(req.body ?? {});
        if (!parsed.success) return sendValidationError(res, parsed.error);
        const { title, communityId } = parsed.data;
        const content = parsed.data.content ?? "";
        const category = parsed.data.category ?? "general";

        const files = Array.isArray(req.files) ? req.files : [];
        const uploadedFile = files[0];

        // multer always sets req.files = [] for multipart bodies, so check the length (UI-4, CONTENT-9).
        if (!content.trim() && !uploadedFile) {
            return res.status(400).json({ error: "Content or media is required", code: "CONTENT_REQUIRED" });
        }

        // Community rules: it must exist and be visible, the author must be a member and not banned (CONTENT-3/5).
        if (communityId) {
            const community = await storage.getCommunity(communityId);
            if (!community || !(await canViewCommunity(user, communityId))) {
                return res.status(404).json({ error: "Community not found", code: "NOT_FOUND" });
            }
            if (!isStaff(user)) {
                if (await storage.isUserBannedFromCommunity(communityId, user.id)) return bannedFromCommunity(res);
                if (!(await storage.getCommunityMember(communityId, user.id))) {
                    return res.status(403).json({ error: "Not a member", code: "NOT_A_MEMBER" });
                }
            }
            const allowed = community.allowedCategories.split(",").map((c: string) => c.trim());
            if (!allowed.includes(category)) {
                return res.status(400).json({
                    error: "This category is not allowed in this community",
                    code: "CATEGORY_NOT_ALLOWED",
                    params: { category, allowed: allowed.join(", ") },
                });
            }
        }

        // Moderation Check
        const moderationResult = await checkContent(content + " " + (title || ""));
        if (!moderationResult.allowed) {
            // checkContent only ever reports this one reason; keep the text fixed so the client can translate it
            return res.status(400).json({ error: "Content violates community guidelines.", code: "CONTENT_BLOCKED" });
        }

        const postData: any = {
            authorId: user.id,
            content,
            category,
            communityId: communityId ?? undefined,
            // Default title from the content or a placeholder
            title: title || (content ? (content.length > 50 ? content.slice(0, 47) + "..." : content) : "New Post"),
        };

        if (uploadedFile) {
            const isImage = uploadedFile.mimetype.startsWith("image/");
            if (isImage && uploadedFile.size > IMAGE_LIMIT) {
                return res.status(400).json({ error: "Image size exceeds 10MB limit.", code: "FILE_TOO_LARGE" });
            }

            // SEC-002: Verify file signature
            if (!(await checkFileSignature(uploadedFile.path, uploadedFile.mimetype))) {
                logSecurityEvent({ type: 'FILE_UPLOAD_REJECTED', details: { reason: 'Invalid Magic Bytes', originalName: uploadedFile.originalname, mime: uploadedFile.mimetype } });
                return res.status(400).json({ error: "File content does not match extension.", code: "INVALID_TYPE" });
            }

            // SEC-003: decode and re-encode images (strips metadata and appended payloads, rejects pixel bombs)
            if (isImage) {
                try {
                    await sanitizeImage(uploadedFile.path);
                } catch (error) {
                    if (error instanceof ImageRejectedError && error.code === "IMAGE_TOO_LARGE") {
                        return res.status(400).json({ error: "The image dimensions are too large", code: "IMAGE_TOO_LARGE" });
                    }
                    return res.status(400).json({ error: "The file is not a valid image", code: "INVALID_IMAGE" });
                }
            }

            postData.mediaUrl = uploadedFile.filename;
            // Always derived from the verified MIME type, never from the body (CONTENT-17).
            postData.mediaType = isImage ? "image" : "video";
        }

        // FEATURE [SEC-010]: Post cooldown, checked atomically with the insert (CONTENT-11)
        let cooldownSeconds = 30;
        try {
            cooldownSeconds = Number(await SettingsService.get("content", "post_cooldown_seconds", 30)) || 0;
        } catch (error) {
            console.error("Error reading post cooldown:", error);
        }
        const created = await storage.getContentStore().createPostWithCooldown(postData, cooldownSeconds);
        if ("remainingSeconds" in created) {
            const remaining = created.remainingSeconds;
            return res.status(429).json({
                error: "Please wait before posting again",
                code: "POST_COOLDOWN",
                params: { seconds: remaining },
                remainingSeconds: remaining,
            });
        }
        const post = created.post;
        keepFiles = true;

        // Ids only; members-only for private communities
        broadcastAboutPost(post, JSON.stringify({ type: 'new_post', postId: post.id })).catch((err) =>
            console.error("[WS] new_post broadcast failed:", err),
        );

        activityLogger.logFromRequest(req, {
            action: 'post.create',
            category: 'content',
            description: `Neuer Post in ${post.category}: "${post.title}"`,
            targetType: 'Post',
            targetId: String(post.id),
            targetLabel: post.title,
            severity: 'info',
            newValue: { id: post.id, title: post.title, category: post.category },
            metadata: { hasMedia: !!post.mediaUrl, mediaType: post.mediaType }
        }).catch(err => console.error('[Monitor] post.create failed:', err));

        // Phase 2: Handle mentions in post
        await notificationService.notifyMentions(post.content + " " + (post.title || ""), user.id, { postId: post.id });

        res.status(201).json(post);
    } catch (error) {
        sendInternalError(res, error, "POST /api/posts");
    } finally {
        if (!keepFiles) removeUploadedFiles(req);
    }
});

router.get("/:id", async (req, res) => {
    try {
        const id = parseId(req.params.id)!;
        const post = await storage.getPost(id);

        // Private community posts and posts of shadow-banned authors look like missing posts (CONTENT-2).
        if (!post || !(await canViewPost(req, post))) return notFound(res);

        const currentUserId = (req.user as any)?.id;
        const [author, allComments, reactions] = await Promise.all([
            storage.getUser(post.authorId),
            storage.getComments(post.id),
            storage.getPostReactions(post.id)
        ]);

        const comments = await filterShadowHidden(req, allComments);
        const commentIds = comments.map(c => c.id);
        const commentAuthors = await storage.getUsersByIds(Array.from(new Set(comments.map(c => c.authorId))));
        const authorsMap = new Map(commentAuthors.map(u => [u.id, u]));
        const [likeCounts, likedIds] = await Promise.all([
            storage.getContentStore().getBatchCommentLikes(commentIds),
            currentUserId ? storage.getContentStore().getUserCommentLikeIds(currentUserId, commentIds) : Promise.resolve(new Set<number>()),
        ]);

        const userReaction = currentUserId ? await storage.getUserPostReaction(currentUserId, post.id) : null;
        const isFollowing = currentUserId ? await storage.isFollowing(currentUserId, post.authorId) : false;

        res.json({
            ...post,
            // Other users' accounts: public fields only, no email or moderation state (CONTENT-4)
            author: author ? toPublicUser(author) : DELETED_AUTHOR,
            comments: comments.map(comment => {
                const commentAuthor = authorsMap.get(comment.authorId);
                return {
                    ...comment,
                    author: commentAuthor
                        ? { id: commentAuthor.id, username: commentAuthor.username, role: commentAuthor.role || 'user', verified: commentAuthor.verified || false }
                        : DELETED_AUTHOR,
                    likes: likeCounts.get(comment.id) ?? 0,
                    isLiked: likedIds.has(comment.id),
                };
            }),
            likes: reactions.likes - reactions.dislikes,
            userVote: userReaction,
            isFollowing,
            isSaved: currentUserId ? (await storage.getSavedPostIds(currentUserId, [post.id])).has(post.id) : false
        });
    } catch (error) {
        sendInternalError(res, error, "GET /api/posts/:id");
    }
});

router.get("/", async (req, res) => {
    try {
        if (nonStringQuery(req, res, ["category", "communityId", "limit", "offset"])) return;
        const rawCategory = req.query.category as string | undefined;
        const rawCommunity = req.query.communityId as string | undefined;

        let communityId: number | undefined;
        if (rawCommunity) {
            const parsed = parseId(rawCommunity);
            if (parsed === null) {
                return res.status(400).json({ error: "Invalid input", code: "VALIDATION_ERROR", issues: [{ path: "communityId", code: "invalid_type" }] });
            }
            communityId = parsed;
            // A private community the viewer is not in has no visible posts (CONTENT-2).
            if (!(await canViewCommunity(req.user, communityId))) return res.json([]);
        }

        // Only known categories reach the query; a filter without any known category matches nothing.
        let category: string | undefined;
        if (rawCategory) {
            const wanted = rawCategory.split(",").map((c) => c.trim()).filter((c) => (POST_CATEGORIES as readonly string[]).includes(c));
            if (wanted.length === 0) return res.json([]);
            category = wanted.join(",");
        }

        const pagination = parsePagination(req.query);
        const limit = pagination.limit;
        const offset = Math.min(pagination.offset, MAX_OFFSET);

        // PERF-FIX [ROUTES-005]: Filtering and Pagination moved to DB level
        // PHASE 4: shadow-banned authors are hidden from everyone but themselves (and other shadow-banned users)
        const filteredPosts = await filterVisiblePosts(req, await storage.getPosts({ category, communityId, limit, offset }));

        // PERF-FIX [ROUTES-003]: Optimized batch lookup for feed page
        const authorIds = Array.from(new Set(filteredPosts.map(p => p.authorId)));
        const authors = await storage.getUsersByIds(authorIds);
        const authorsMap = new Map(authors.map(u => [u.id, u]));

        // PERF-FIX [OPT-002]: Batch fetch reactions (Prevents N+1)
        const postIds = filteredPosts.map(p => p.id);
        const batchReactions = await storage.getBatchPostReactions(postIds);
        const currentUserId = (req.user as any)?.id;
        const extras = await getPostExtras(postIds, currentUserId);

        const postsWithDetails = await Promise.all(filteredPosts.map(async (post) => {
            const author = authorsMap.get(post.authorId);
            const isFollowing = currentUserId ? await storage.isFollowing(currentUserId, post.authorId) : false;

            const reactions = batchReactions.get(post.id) || { likes: 0, dislikes: 0 };
            const userReaction = currentUserId ? await storage.getUserPostReaction(currentUserId, post.id) : null;

            return {
                ...post,
                author: author
                    ? { id: author.id, username: author.username, verified: author.verified || false, isFollowing }
                    : DELETED_AUTHOR,
                reactions,
                userReaction,
                ...extras(post.id)
            };
        }));

        res.json(postsWithDetails);
    } catch (error) {
        sendInternalError(res, error, "GET /api/posts");
    }
});

router.delete("/:id", isAuthenticated, async (req, res) => {
    try {
        const id = parseId(req.params.id)!;
        const post = await storage.getPost(id);
        const user = req.user as any;

        if (!post || !(await canViewPost(req, post))) return notFound(res);

        // Same rule as for comments: author, owner, or an admin for content not written by an owner (AUTHZ-14)
        const author = post.authorId ? await storage.getUser(post.authorId) : undefined;
        if (!canDeleteContent(user, post.authorId, author?.role ?? "user")) {
            return res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
        }

        await storage.deletePost(id);

        activityLogger.logFromRequest(req, {
            action: 'post.delete',
            category: 'content',
            description: `Post gelöscht${post.authorId !== user.id ? ` (durch Admin/Moderator)` : ''}: "${post.title}"`,
            targetType: 'Post',
            targetId: String(id),
            targetLabel: post.title,
            severity: 'warning',
            oldValue: post,
            metadata: { deletedByRole: user.role }
        }).catch(err => console.error('[Monitor] post.delete failed:', err));

        res.sendStatus(204);
    } catch (error) {
        sendInternalError(res, error, "DELETE /api/posts/:id");
    }
});

// Bookmarks ("Merken"): POST saves, DELETE removes. Both are idempotent.
router.post("/:id/save", isAuthenticated, async (req, res) => {
    try {
        const postId = parseId(req.params.id)!;
        const post = await storage.getPost(postId);
        if (!post || !(await canViewPost(req, post))) return notFound(res);
        await storage.savePost((req.user as any).id, postId);
        res.json({ saved: true });
    } catch (error) {
        sendInternalError(res, error, "POST /api/posts/:id/save");
    }
});

router.delete("/:id/save", isAuthenticated, async (req, res) => {
    try {
        await storage.unsavePost((req.user as any).id, parseId(req.params.id)!);
        res.json({ saved: false });
    } catch (error) {
        sendInternalError(res, error, "DELETE /api/posts/:id/save");
    }
});

router.post("/:id/react", isAuthenticated, async (req, res) => {
    try {
        const postId = parseId(req.params.id)!;
        const userId = (req.user as any).id;
        const isLike = req.body?.isLike;

        if (typeof isLike !== 'boolean') {
            return res.status(400).json({ error: "Invalid reaction type", code: "VALIDATION_ERROR" });
        }

        const post = await storage.getPost(postId);
        if (!post) return notFound(res);
        const access = await canInteractWithPost(req, post);
        if (access === "not_found") return notFound(res);
        if (access === "banned") return bannedFromCommunity(res);

        // Posts of deleted users keep author_id 0; they can still be liked, nobody gets karma or a notification.
        const postAuthor = post.authorId ? await storage.getUser(post.authorId) : undefined;

        // Reaction rows and the author's karma change in one locked transaction (CONTENT-22)
        const { action } = await storage.getContentStore().togglePostReaction(userId, postId, isLike, postAuthor?.id ?? null);

        if (action !== "removed") {
            activityLogger.logFromRequest(req, {
                action: isLike ? 'like.add' : 'like.remove',
                category: 'social',
                description: `${isLike ? 'Like gegeben' : 'Like entfernt'} für Post "${post.title}" von ${postAuthor?.username ?? "gelöschtem Nutzer"}`,
                targetType: 'Post',
                targetId: String(post.id),
                targetLabel: post.title,
                severity: 'info',
                newValue: { action: isLike ? 'like' : 'unlike' }
            }).catch(err => console.error('[Monitor] post.react failed:', err));

            // Phase 2: Notify author if it's a LIKE and not the author themselves
            if (isLike && postAuthor && post.authorId !== userId) {
                await notificationService.notify({
                    userId: post.authorId,
                    actorId: userId,
                    type: "like_post",
                    postId: post.id,
                    title: post.title,
                    actionUrl: `/posts/${post.id}`
                });
            }
        }

        const reactions = await storage.getPostReactions(postId);
        const userReaction = await storage.getUserPostReaction(userId, postId);

        res.json({ ...post, reactions, userReaction });
    } catch (error) {
        sendInternalError(res, error, "POST /api/posts/:id/react");
    }
});

// Comments of a post, oldest first: /api/posts/:postId/comments?limit=&offset= (default and maximum: 1000)
router.get("/:postId/comments", async (req, res) => {
    try {
        const post = await storage.getPost(parseId(req.params.postId)!);
        if (!post || !(await canViewPost(req, post))) return notFound(res);

        const pagination = parsePagination(req.query, { defaultLimit: 1000, maxLimit: 1000 });
        const comments = await filterShadowHidden(
            req,
            await storage.getContentStore().getComments(post.id, { limit: pagination.limit, offset: Math.min(pagination.offset, MAX_OFFSET) }),
        );

        // SECURITY-FIX [SEC-003]: Batch fetch authors to prevent N+1 queries
        const authorIds = Array.from(new Set(comments.map(c => c.authorId)));
        const authors = await storage.getUsersByIds(authorIds);
        const authorsMap = new Map(authors.map(u => [u.id, u]));

        res.json(comments.map(comment => {
            const author = authorsMap.get(comment.authorId);
            return {
                ...comment,
                author: author ? { id: author.id, username: author.username } : DELETED_AUTHOR
            };
        }));
    } catch (error) {
        sendInternalError(res, error, "GET /api/posts/:postId/comments");
    }
});

export default router;
