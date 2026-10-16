import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { storage, sanitizeUser } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { notificationService } from "../services/notification-service";
import { activityLogger } from "../services/activity-logger";
import { profileUpload, checkFileSignature, processProfileImage, PROFILE_IMAGE_MAX_BYTES } from "../utils/file-upload";
import fs from "node:fs";
import { getPostExtras, DELETED_AUTHOR } from "../utils/post-extras";

const router = Router();

router.post("/follow/:userId", isAuthenticated, async (req, res) => {
    try {
        const followingId = parseInt(req.params.userId);
        const followerId = (req.user as any).id;

        if (followerId === followingId) {
            return res.status(400).send("Cannot follow yourself");
        }

        const targetUser = await storage.getUser(followingId);
        if (!targetUser) {
            return res.status(404).send("User not found");
        }

        const isAlreadyFollowing = await storage.isFollowing(followerId, followingId);
        if (isAlreadyFollowing) {
            return res.status(400).send("Already following this user");
        }

        await storage.followUser(followerId, followingId);

        await notificationService.notify({
            userId: followingId,
            actorId: followerId,
            type: "new_follower",
            actionUrl: `/profile/${(req.user as any).username}`
        });

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
        res.status(500).send("Failed to follow user");
    }
});

router.delete("/follow/:userId", isAuthenticated, async (req, res) => {
    try {
        const followingId = parseInt(req.params.userId);
        const followerId = (req.user as any).id;

        const targetUser = await storage.getUser(followingId);
        if (!targetUser) {
            return res.status(404).send("User not found");
        }

        const isFollowing = await storage.isFollowing(followerId, followingId);
        if (!isFollowing) {
            return res.status(400).send("Not following this user");
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
        res.status(500).send("Failed to unfollow user");
    }
});

router.get("/followers", isAuthenticated, async (req, res) => {
    try {
        const followers = await storage.getFollowers((req.user as any).id);
        res.json(followers.map(({ password: _password, email: _email, ...u }) => u));
    } catch (error) {
        console.error("Error getting followers:", error);
        res.status(500).send("Failed to get followers");
    }
});

router.get("/following", isAuthenticated, async (req, res) => {
    try {
        const following = await storage.getFollowing((req.user as any).id);
        res.json(following.map(({ password: _password, email: _email, ...u }) => u));
    } catch (error) {
        console.error("Error getting following:", error);
        res.status(500).send("Failed to get following");
    }
});

router.get("/:username/posts", async (req, res) => {
    try {
        const user = await storage.getUserByUsername(req.params.username);
        if (!user) {
            return res.status(404).send("User not found");
        }
        const posts = await storage.getPostsByUser(user.id);
        
        // Enrich posts with author and reaction details
        const postIds = posts.map(p => p.id);
        const batchReactions = await storage.getBatchPostReactions(postIds);
        const currentUserId = (req.user as any)?.id;
        const extras = await getPostExtras(postIds, currentUserId);

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
        res.status(500).send("Failed to fetch user posts");
    }
});

router.get("/:username/comments", async (req, res) => {
    try {
        const user = await storage.getUserByUsername(req.params.username);
        if (!user) {
            return res.status(404).send("User not found");
        }
        const comments = await storage.getCommentsByUser(user.id);

        const enrichedComments = await Promise.all(
            comments.map(async (comment) => {
                const post = await storage.getPost(comment.postId);
                return {
                    ...comment,
                    post: post ? { id: post.id, title: post.title } : null,
                };
            }),
        );

        res.json(enrichedComments);
    } catch (error) {
        console.error("Error fetching user comments:", error);
        res.status(500).send("Failed to fetch user comments");
    }
});

/** Adds author, reactions, saved state and comment count to posts written by various users. */
async function enrichPosts(posts: Awaited<ReturnType<typeof storage.getLikedPostsByUser>>, currentUserId?: number) {
    const authorIds = [...new Set(posts.map(p => p.authorId))];
    const authors = await storage.getUsersByIds(authorIds);
    const authorsMap = new Map(authors.map(u => [u.id, u]));
    const postIds = posts.map(p => p.id);
    const batchReactions = await storage.getBatchPostReactions(postIds);
    const extras = await getPostExtras(postIds, currentUserId);

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

router.get("/:username/liked", async (req, res) => {
    try {
        const user = await storage.getUserByUsername(req.params.username);
        if (!user) {
            return res.status(404).send("User not found");
        }
        const posts = await storage.getLikedPostsByUser(user.id);
        res.json(await enrichPosts(posts, (req.user as any)?.id));
    } catch (error) {
        console.error("Error getting liked posts:", error);
        res.status(500).send("Failed to get liked posts");
    }
});

// Saved posts ("Merken") are private: only the user themselves can list them.
router.get("/:username/saved", isAuthenticated, async (req, res) => {
    try {
        const user = await storage.getUserByUsername(req.params.username);
        if (!user) {
            return res.status(404).send("User not found");
        }
        if ((req.user as any).id !== user.id) {
            return res.status(403).send("Saved posts are private");
        }
        const posts = await storage.getSavedPostsByUser(user.id);
        res.json(await enrichPosts(posts, user.id));
    } catch (error) {
        console.error("Error getting saved posts:", error);
        res.status(500).send("Failed to get saved posts");
    }
});

router.get("/communities", isAuthenticated, async (req, res) => {
    try {
        const communities = await storage.getUserCommunities((req.user as any).id);
        res.json(communities);
    } catch (error) {
        console.error("Error getting user communities:", error);
        res.status(500).send("Failed to get user communities");
    }
});

router.get("/moderated-communities", isAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any).id;
        const communities = await storage.getModeratedCommunities(userId);
        res.json(communities);
    } catch (error) {
        console.error("Error getting moderated communities:", error);
        res.status(500).send("Failed to get moderated communities");
    }
});

router.get("/search", isAuthenticated, async (req, res) => {
    try {
        const query = req.query.q as string;
        if (!query) return res.json([]);
        const users = await storage.searchUsers(query);
        res.json(users.map(u => sanitizeUser(u)));
    } catch (error) {
        console.error("Error searching users:", error);
        res.status(500).send("Failed to search users");
    }
});

router.get("/:username", async (req, res) => {
    try {
        const user = await storage.getUserByUsername(req.params.username);
        if (!user) {
            return res.status(404).send("User not found");
        }

        const [followersCount, followingCount, posts] = await Promise.all([
            storage.getFollowerCount(user.id),
            storage.getFollowingCount(user.id),
            storage.getPostsByUser(user.id)
        ]);

        let isFollowing = false;
        let isFollowingBack = false;
        let mutualFollowers: any[] = [];

        if (req.isAuthenticated()) {
            const currentUserId = (req.user as any).id;
            const targetUserId = user.id;

            if (currentUserId !== targetUserId) {
                [isFollowing, isFollowingBack, mutualFollowers] = await Promise.all([
                    storage.isFollowing(currentUserId, targetUserId),
                    storage.isFollowing(targetUserId, currentUserId),
                    storage.getMutualFollowers(currentUserId, targetUserId)
                ]);
            }
        }

        const { password: _password, email, ...publicUser } = user;
        const isSelf = req.isAuthenticated() && (req.user as any).id === user.id;

        res.json({
            ...publicUser,
            ...(isSelf ? { email } : {}),
            stats: {
                followers: followersCount,
                following: followingCount,
                posts: posts.length
            },
            isFollowing,
            isFollowingBack,
            mutualFollowers: mutualFollowers.slice(0, 3) // Only return first 3 for preview
        });
    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).send("Failed to fetch user profile");
    }
});

// Runs multer and turns its errors (file too large, wrong type, ...) into clear 400 answers
// instead of letting them fall through to the generic 500 handler.
function receiveProfileImage(req: Request, res: Response, next: NextFunction) {
    profileUpload.single("image")(req, res, (err: unknown) => {
        if (!err) return next();
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({ error: `Datei zu groß (max. ${PROFILE_IMAGE_MAX_BYTES / 1024 / 1024} MB)`, code: "FILE_TOO_LARGE" });
            }
            return res.status(400).json({ error: "Ungültiger Upload", code: err.code });
        }
        return res.status(400).json({ error: "Nur JPG, PNG oder WebP erlaubt", code: "INVALID_TYPE" });
    });
}

// Uploads an avatar or cover image and returns its URL. The profile itself is only changed
// when the user saves the edit dialog (PATCH /api/profile), so "Cancel" really cancels.
router.post("/profile-upload", isAuthenticated, receiveProfileImage, async (req, res) => {
    const file = req.file;
    try {
        if (!file) {
            return res.status(400).json({ error: "Keine Bilddatei erhalten (JPG, PNG oder WebP)", code: "NO_FILE" });
        }

        const type = req.body.type as "avatar" | "cover";
        if (!type || !["avatar", "cover"].includes(type)) {
            fs.unlink(file.path, () => { });
            return res.status(400).json({ error: "Ungültiger Typ. Erlaubt: 'avatar' oder 'cover'.", code: "INVALID_KIND" });
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
            return res.status(400).json({ error: "Die Datei ist kein gültiges Bild", code: "INVALID_SIGNATURE" });
        }

        // SEC-003: strip metadata, fix orientation, shrink to a sensible size, store as WebP
        let filename: string;
        try {
            filename = await processProfileImage(file.path, type);
        } catch (error) {
            console.error(`[Upload] Processing profile image failed: ${error}`);
            return res.status(400).json({ error: "Das Bild konnte nicht verarbeitet werden", code: "UNREADABLE_IMAGE" });
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
        res.status(500).json({ error: "Bild-Upload fehlgeschlagen" });
    }
});

export default router;
