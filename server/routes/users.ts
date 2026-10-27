import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { notificationService } from "../services/notification-service";
import { activityLogger } from "../services/activity-logger";
import { profileUpload, checkFileSignature, processProfileImage } from "../utils/file-upload";
import fs from "node:fs";
import { getPostExtras, DELETED_AUTHOR } from "../utils/post-extras";
import { toPublicUser, toSelfUser } from "../utils/public-user";
import { validateIdParams } from "../utils/params";
import { hiddenCommunityIds, shadowCountScope } from "../utils/community-access";
import { sendInternalError } from "../utils/http-errors";
import type { User } from "@shared/schema";

const router = Router();

/**
 * This router is also mounted at /api (legacy short paths like /api/follow/:id, /api/search) and /api/user.
 * Its /:username routes only exist under /api/users: elsewhere an unknown path like /api/nope would
 * otherwise be answered as a username ("User not found") instead of the generic API 404.
 */
const onUsersMount = (req: Request) => req.baseUrl === "/api/users";
const usersMountOnly = (req: Request, _res: Response, next: NextFunction) => (onUsersMount(req) ? next() : next("route"));

// Malformed ids answer 404 before any handler runs (no NaN / int4 overflow reaching the database).
validateIdParams(router, ["userId"]);
// Usernames never contain control characters (NUL makes Postgres fail) and are short.
router.param("username", (req, res, next, value: string) => {
    if (!onUsersMount(req)) return next();
    if (typeof value !== "string" || value.length > 100 || /[\u0000-\u001f\u007f]/.test(value)) {
        return res.status(404).json({ error: "User not found", code: "NOT_FOUND" });
    }
    next();
});

/** Plain JSON error answer (never text/html). */
const fail = (res: Response, status: number, error: string, code?: string) =>
    res.status(status).json(code ? { error, code } : { error });

const viewerOf = (req: Request): any => (req.isAuthenticated?.() ? req.user : undefined);
const isViewerShadowBanned = (req: Request) => (req as any).isShadowBanned === true || !!viewerOf(req)?.isShadowBanned;

/**
 * "Private account: only members can see your content" — posts, comments and likes of a private
 * profile are shown to logged-in members (and the owner), not to anonymous visitors.
 */
const canSeeContentOf = (req: Request, user: User) => !user.isPrivate || !!viewerOf(req);

/** Like the feed: a shadow-banned user's content is hidden from everyone but themselves (and other shadow-banned users). */
const hidesShadowBanned = (req: Request, authorId: number, authorShadowBanned: unknown) =>
    !!authorShadowBanned && viewerOf(req)?.id !== authorId && !isViewerShadowBanned(req);

router.post("/follow/:userId", isAuthenticated, async (req, res) => {
    try {
        const followingId = Number(req.params.userId);
        const followerId = (req.user as any).id;

        if (followerId === followingId) {
            return fail(res, 400, "Cannot follow yourself");
        }

        const targetUser = await storage.getUser(followingId);
        if (!targetUser) {
            return fail(res, 404, "User not found");
        }

        const isAlreadyFollowing = await storage.isFollowing(followerId, followingId);
        if (isAlreadyFollowing) {
            return fail(res, 400, "Already following this user");
        }

        await storage.followUser(followerId, followingId);

        // Follow / unfollow / follow again must not flood the target: one open notification per follower.
        if (!(await storage.getNotificationStore().hasActiveNotification(followingId, followerId, "new_follower"))) {
            await notificationService.notify({
                userId: followingId,
                actorId: followerId,
                type: "new_follower",
                actionUrl: `/profile/${(req.user as any).username}`
            });
        }

        activityLogger.logFromRequest(req, {
            action: 'follow.add',
            category: 'social',
            description: `Folgt nun User ${targetUser.username}`,
            targetType: 'User',
            targetId: String(followingId),
            severity: 'info'
        }).catch(err => console.error('[Monitor] follow.add failed:', err));

        res.sendStatus(200);
    } catch (error) {
        console.error("Error following user:", error);
        fail(res, 500, "Failed to follow user");
    }
});

router.delete("/follow/:userId", isAuthenticated, async (req, res) => {
    try {
        const followingId = Number(req.params.userId);
        const followerId = (req.user as any).id;

        const targetUser = await storage.getUser(followingId);
        if (!targetUser) {
            return fail(res, 404, "User not found");
        }

        const isFollowing = await storage.isFollowing(followerId, followingId);
        if (!isFollowing) {
            return fail(res, 400, "Not following this user");
        }

        await storage.unfollowUser(followerId, followingId);

        activityLogger.logFromRequest(req, {
            action: 'follow.remove',
            category: 'social',
            description: `Ist User ${targetUser.username} entfolgt`,
            targetType: 'User',
            targetId: String(followingId),
            severity: 'info'
        }).catch(err => console.error('[Monitor] follow.remove failed:', err));

        res.sendStatus(200);
    } catch (error) {
        console.error("Error unfollowing user:", error);
        fail(res, 500, "Failed to unfollow user");
    }
});

router.get("/followers", isAuthenticated, async (req, res) => {
    try {
        // Shadow-banned followers are not listed (the shadow-banned user's own lists stay complete)
        const followers = await storage.getUserStore().getFollowers((req.user as any).id, shadowCountScope(req));
        res.json(followers.map((u) => toPublicUser(u)));
    } catch (error) {
        console.error("Error getting followers:", error);
        fail(res, 500, "Failed to get followers");
    }
});

router.get("/following", isAuthenticated, async (req, res) => {
    try {
        const following = await storage.getUserStore().getFollowing((req.user as any).id, shadowCountScope(req));
        res.json(following.map((u) => toPublicUser(u)));
    } catch (error) {
        console.error("Error getting following:", error);
        fail(res, 500, "Failed to get following");
    }
});

/** The posts of `user` that the current viewer may see (shadow ban, private communities). */
async function visiblePostsOf(req: Request, user: User) {
    if (hidesShadowBanned(req, user.id, user.isShadowBanned)) return [];
    const [posts, hidden] = await Promise.all([storage.getPostsByUser(user.id), hiddenCommunityIds(viewerOf(req))]);
    return posts.filter((p) => !p.communityId || !hidden.has(p.communityId));
}

router.get("/:username/posts", usersMountOnly, async (req, res) => {
    try {
        const user = await storage.getUserByUsername(req.params.username);
        if (!user) {
            return fail(res, 404, "User not found");
        }
        if (!canSeeContentOf(req, user)) {
            return fail(res, 403, "This account is private", "PRIVATE_PROFILE");
        }
        const posts = await visiblePostsOf(req, user);

        // Enrich posts with author and reaction details
        const postIds = posts.map(p => p.id);
        const scope = shadowCountScope(req);
        const batchReactions = await storage.getContentStore().getBatchPostReactions(postIds, scope);
        const currentUserId = viewerOf(req)?.id;
        const extras = await getPostExtras(postIds, currentUserId, scope);

        const postsWithDetails = await Promise.all(posts.map(async (post) => {
            const isFollowing = currentUserId ? await storage.isFollowing(currentUserId, post.authorId) : false;
            const reactions = batchReactions.get(post.id) || { likes: 0, dislikes: 0 };
            const userReaction = currentUserId ? await storage.getUserPostReaction(currentUserId, post.id) : null;

            return {
                ...post,
                author: {
                    id: user.id,
                    username: user.username,
                    verified: user.verified || false,
                    isFollowing,
                    role: user.role || 'member'
                },
                reactions,
                userReaction,
                comments: [], // Posts already have comments in the detailed view if needed
                ...extras(post.id)
            };
        }));

        res.json(postsWithDetails);
    } catch (error) {
        console.error("Error fetching user posts:", error);
        fail(res, 500, "Failed to fetch user posts");
    }
});

router.get("/:username/comments", usersMountOnly, async (req, res) => {
    try {
        const user = await storage.getUserByUsername(req.params.username);
        if (!user) {
            return fail(res, 404, "User not found");
        }
        if (!canSeeContentOf(req, user)) {
            return fail(res, 403, "This account is private", "PRIVATE_PROFILE");
        }
        if (hidesShadowBanned(req, user.id, user.isShadowBanned)) return res.json([]);
        const [comments, hidden] = await Promise.all([storage.getCommentsByUser(user.id), hiddenCommunityIds(viewerOf(req))]);

        const enrichedComments = await Promise.all(
            comments.map(async (comment) => {
                const post = await storage.getPost(comment.postId);
                if (post?.communityId && hidden.has(post.communityId)) return null;
                return {
                    ...comment,
                    post: post ? { id: post.id, title: post.title } : null,
                };
            }),
        );

        res.json(enrichedComments.filter(Boolean));
    } catch (error) {
        console.error("Error fetching user comments:", error);
        fail(res, 500, "Failed to fetch user comments");
    }
});

/** Adds author, reactions, saved state and comment count to posts written by various users. */
async function enrichPosts(req: Request, posts: Awaited<ReturnType<typeof storage.getLikedPostsByUser>>, currentUserId?: number) {
    const authorIds = [...new Set(posts.map(p => p.authorId))];
    const [authors, hidden] = await Promise.all([storage.getUsersByIds(authorIds), hiddenCommunityIds(viewerOf(req))]);
    const authorsMap = new Map(authors.map(u => [u.id, u]));
    posts = posts.filter((p) => {
        if (p.communityId && hidden.has(p.communityId)) return false;
        const author = authorsMap.get(p.authorId);
        return !author || !hidesShadowBanned(req, author.id, author.isShadowBanned);
    });
    const postIds = posts.map(p => p.id);
    const scope = shadowCountScope(req);
    const batchReactions = await storage.getContentStore().getBatchPostReactions(postIds, scope);
    const extras = await getPostExtras(postIds, currentUserId, scope);

    return Promise.all(posts.map(async (post) => {
        const author = authorsMap.get(post.authorId);
        const isFollowing = currentUserId ? await storage.isFollowing(currentUserId, post.authorId) : false;
        const reactions = batchReactions.get(post.id) || { likes: 0, dislikes: 0 };
        const userReaction = currentUserId ? await storage.getUserPostReaction(currentUserId, post.id) : null;
        return {
            ...post,
            author: author
                ? { id: author.id, username: author.username, verified: author.verified || false, isFollowing, role: author.role || 'member' }
                : DELETED_AUTHOR,
            reactions,
            userReaction,
            comments: [],
            ...extras(post.id)
        };
    }));
}

router.get("/:username/liked", usersMountOnly, async (req, res) => {
    try {
        const user = await storage.getUserByUsername(req.params.username);
        if (!user) {
            return fail(res, 404, "User not found");
        }
        if (!canSeeContentOf(req, user)) {
            return fail(res, 403, "This account is private", "PRIVATE_PROFILE");
        }
        if (hidesShadowBanned(req, user.id, user.isShadowBanned)) return res.json([]);
        const posts = await storage.getLikedPostsByUser(user.id);
        res.json(await enrichPosts(req, posts, viewerOf(req)?.id));
    } catch (error) {
        console.error("Error getting liked posts:", error);
        fail(res, 500, "Failed to get liked posts");
    }
});

// Saved posts ("Merken") are private: only the user themselves can list them.
router.get("/:username/saved", usersMountOnly, isAuthenticated, async (req, res) => {
    try {
        const user = await storage.getUserByUsername(req.params.username);
        if (!user) {
            return fail(res, 404, "User not found");
        }
        if ((req.user as any).id !== user.id) {
            return fail(res, 403, "Saved posts are private");
        }
        const posts = await storage.getSavedPostsByUser(user.id);
        res.json(await enrichPosts(req, posts, user.id));
    } catch (error) {
        console.error("Error getting saved posts:", error);
        fail(res, 500, "Failed to get saved posts");
    }
});

router.get("/communities", isAuthenticated, async (req, res) => {
    try {
        const communities = await storage.getUserCommunities((req.user as any).id);
        res.json(communities);
    } catch (error) {
        console.error("Error getting user communities:", error);
        fail(res, 500, "Failed to get user communities");
    }
});

router.get("/moderated-communities", isAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any).id;
        const communities = await storage.getModeratedCommunities(userId);
        res.json(communities);
    } catch (error) {
        console.error("Error getting moderated communities:", error);
        fail(res, 500, "Failed to get moderated communities");
    }
});

router.get("/search", isAuthenticated, async (req, res) => {
    try {
        // Only a plain string is a search term (?q[]=a or ?q[$ne]=x are ignored).
        const query = typeof req.query.q === "string" ? req.query.q : "";
        if (!query.trim()) return res.json([]);
        const users = await storage.searchUsers(query);
        res.json(users.map(u => toPublicUser(u)));
    } catch (error) {
        sendInternalError(res, error, "Error searching users");
    }
});

router.get("/:username", usersMountOnly, async (req, res) => {
    try {
        const user = await storage.getUserByUsername(req.params.username);
        if (!user) {
            return fail(res, 404, "User not found");
        }

        const viewer = viewerOf(req);
        const isSelf = !!viewer && viewer.id === user.id;
        // Counts leave out shadow-banned accounts, like the lists (unless the viewer may see them)
        const scope = shadowCountScope(req);
        const [followersCount, followingCount, posts] = await Promise.all([
            storage.getUserStore().getFollowerCount(user.id, scope),
            storage.getUserStore().getFollowingCount(user.id, scope),
            canSeeContentOf(req, user) ? visiblePostsOf(req, user) : Promise.resolve([]),
        ]);

        let isFollowing = false;
        let isFollowingBack = false;
        let mutualFollowers: any[] = [];

        if (viewer && !isSelf) {
            [isFollowing, isFollowingBack, mutualFollowers] = await Promise.all([
                storage.isFollowing(viewer.id, user.id),
                storage.isFollowing(user.id, viewer.id),
                storage.getUserStore().getMutualFollowers(viewer.id, user.id, scope)
            ]);
        }

        // Explicit allow-list: no email (except for the owner), hash, moderation state or admin group.
        res.json({
            ...(isSelf ? toSelfUser(user) : toPublicUser(user)),
            stats: {
                followers: followersCount,
                following: followingCount,
                posts: posts.length
            },
            isFollowing,
            isFollowingBack,
            mutualFollowers: mutualFollowers.slice(0, 3).map((u) => toPublicUser(u)) // Only return first 3 for preview
        });
    } catch (error) {
        console.error("Error fetching user profile:", error);
        fail(res, 500, "Failed to fetch user profile");
    }
});

// Runs multer and turns its errors (file too large, wrong type, ...) into clear 400 answers
// instead of letting them fall through to the generic 500 handler.
function receiveProfileImage(req: Request, res: Response, next: NextFunction) {
    profileUpload.single("image")(req, res, (err: unknown) => {
        if (!err) return next();
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                // Literal text (keep "10 MB" in sync with PROFILE_IMAGE_MAX_BYTES in utils/file-upload.ts): the client translates known messages.
                return res.status(413).json({ error: "File too large (max. 10 MB)", code: "FILE_TOO_LARGE" });
            }
            return res.status(400).json({ error: "Invalid upload", code: err.code });
        }
        return res.status(400).json({ error: "Only JPG, PNG or WebP images are allowed", code: "INVALID_TYPE" });
    });
}

// Uploads an avatar or cover image and returns its URL. The profile itself is only changed
// when the user saves the edit dialog (PATCH /api/profile), so "Cancel" really cancels.
router.post("/profile-upload", isAuthenticated, receiveProfileImage, async (req, res) => {
    const file = req.file;
    try {
        if (!file) {
            return res.status(400).json({ error: "No image received (JPG, PNG or WebP)", code: "NO_FILE" });
        }

        const type = req.body.type as "avatar" | "cover";
        if (!type || !["avatar", "cover"].includes(type)) {
            fs.unlink(file.path, () => { });
            return res.status(400).json({ error: "Invalid type. Allowed: 'avatar' or 'cover'.", code: "INVALID_KIND" });
        }

        // SEC-002: Verify file signature
        const isValidSignature = await checkFileSignature(file.path, file.mimetype);
        if (!isValidSignature) {
            fs.unlink(file.path, () => { });
            activityLogger.logFromRequest(req, {
                action: 'user.upload_rejected',
                category: 'security',
                description: `Upload rejected: Invalid file signature for ${type}`,
                severity: 'warning'
            }).catch(e => console.error(e));
            return res.status(400).json({ error: "The file is not a valid image", code: "INVALID_SIGNATURE" });
        }

        // SEC-003: strip metadata, fix orientation, shrink to a sensible size, store as WebP
        let filename: string;
        try {
            filename = await processProfileImage(file.path, type);
        } catch (error) {
            console.error(`[Upload] Processing profile image failed: ${error}`);
            return res.status(400).json({ error: "The image could not be processed", code: "UNREADABLE_IMAGE" });
        }

        const imageUrl = `/uploads/${filename}`;
        activityLogger.logFromRequest(req, {
            action: `user.upload_${type}`,
            category: 'profile',
            description: `Hat ein neues ${type}-Bild hochgeladen`,
            targetType: 'User',
            targetId: String((req.user as any).id),
            severity: 'info'
        }).catch(err => console.error('[Monitor] profile-upload failed:', err));

        res.json({ url: imageUrl });
    } catch (error) {
        console.error("Error uploading profile image:", error);
        if (file) fs.unlink(file.path, () => { });
        res.status(500).json({ error: "Image upload failed" });
    }
});

export default router;
