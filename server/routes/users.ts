import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { notificationService } from "../services/notification-service";
import { activityLogger } from "../services/activity-logger";
import { profileUpload, checkFileSignature, sanitizeImage } from "../utils/file-upload";
import fs from "node:fs";
import path from "node:path";

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
        res.json(followers);
    } catch (error) {
        console.error("Error getting followers:", error);
        res.status(500).send("Failed to get followers");
    }
});

router.get("/following", isAuthenticated, async (req, res) => {
    try {
        const following = await storage.getFollowing((req.user as any).id);
        res.json(following);
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
                comments: [] // Posts already have comments in the detailed view if needed
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

router.get("/:username/liked", async (req, res) => {
    try {
        const user = await storage.getUserByUsername(req.params.username);
        if (!user) {
            return res.status(404).send("User not found");
        }

        const posts = await storage.getLikedPostsByUser(user.id);
        
        // Enrich posts
        const authorIds = [...new Set(posts.map(p => p.authorId))];
        const authors = await storage.getUsersByIds(authorIds);
        const authorsMap = new Map(authors.map(u => [u.id, u]));

        const postIds = posts.map(p => p.id);
        const batchReactions = await storage.getBatchPostReactions(postIds);
        const currentUserId = (req.user as any)?.id;

        const postsWithDetails = await Promise.all(posts.map(async (post) => {
            const author = authorsMap.get(post.authorId);
            const isFollowing = currentUserId ? await storage.isFollowing(currentUserId, post.authorId) : false;
            const reactions = batchReactions.get(post.id) || { likes: 0, dislikes: 0 };
            const userReaction = currentUserId ? await storage.getUserPostReaction(currentUserId, post.id) : null;

            return {
                ...post,
                author: {
                    id: author?.id,
                    username: author?.username || 'Unknown',
                    verified: author?.verified || false,
                    isFollowing,
                    role: author?.role || 'member'
                },
                reactions,
                userReaction,
                comments: []
            };
        }));

        res.json(postsWithDetails);
    } catch (error) {
        console.error("Error getting liked posts:", error);
        res.status(500).send("Failed to get liked posts");
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

        res.json({
            ...user,
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

router.get("/search", isAuthenticated, async (req, res) => {
    try {
        const query = req.query.q as string;
        if (!query) return res.json([]);
        const users = await storage.searchUsers(query);
        res.json(users.map(u => storage.sanitizeUser(u)));
    } catch (error) {
        console.error("Error searching users:", error);
        res.status(500).send("Failed to search users");
    }
});

router.post("/profile-upload", isAuthenticated, profileUpload.single("image"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded or invalid file type" });
        }

        const type = req.body.type as "avatar" | "cover";
        if (!type || !["avatar", "cover"].includes(type)) {
            // Remove the uploaded file if type is invalid
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: "Invalid upload type. Must be 'avatar' or 'cover'." });
        }

        // SEC-002: Verify file signature
        const isValidSignature = await checkFileSignature(req.file.path, req.file.mimetype);
        if (!isValidSignature) {
            fs.unlinkSync(req.file.path);
            activityLogger.logFromRequest(req, {
                action: 'user.upload_rejected',
                category: 'security',
                description: `Upload rejected: Invalid file signature for ${type}`,
                severity: 'warning'
            }).catch(e => console.error(e));
            return res.status(400).json({ error: "Invalid file signature" });
        }

        // SEC-003: Sanitize image (strip metadata)
        await sanitizeImage(req.file.path);

        // Verify file exists after sanitization
        if (!fs.existsSync(req.file.path)) {
            console.error(`[Upload] File missing after sanitization: ${req.file.path}`);
            return res.status(500).json({ error: "File processing error" });
        }

        const userId = (req.user as any).id;
        const imageUrl = `/uploads/${req.file.filename}`;

        console.log(`[Upload] Success! URL: ${imageUrl}, Path: ${req.file.path}, Size: ${fs.statSync(req.file.path).size} bytes`);

        // Update user profile in database
        const updateData: any = {};
        if (type === "avatar") {
            updateData.avatarUrl = imageUrl;
            updateData.profilePictureUrl = imageUrl; // Update both for consistency
        } else {
            updateData.coverUrl = imageUrl;
        }

        await storage.updateUserProfile(userId, updateData);

        activityLogger.logFromRequest(req, {
            action: `user.update_${type}`,
            category: 'profile',
            description: `Hat ein neues ${type}-Bild hochgeladen`,
            targetType: 'User',
            targetId: String(userId),
            severity: 'info'
        }).catch(err => console.error('[Monitor] profile-upload failed:', err));

        res.json({ url: imageUrl });
    } catch (error) {
        console.error("Error uploading profile image:", error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: "Failed to upload profile image" });
    }
});

export default router;
