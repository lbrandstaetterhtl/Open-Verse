import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { notificationService } from "../services/notification-service";
import { activityLogger } from "../services/activity-logger";

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
        res.json(posts);
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

router.get("/user/communities", isAuthenticated, async (req, res) => {
    try {
        const communities = await storage.getUserCommunities((req.user as any).id);
        res.json(communities);
    } catch (error) {
        console.error("Error getting user communities:", error);
        res.status(500).send("Failed to get user communities");
    }
});

router.get("/user/moderated-communities", isAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any).id;
        const communities = await storage.getModeratedCommunities(userId);
        res.json(communities);
    } catch (error) {
        console.error("Error getting moderated communities:", error);
        res.status(500).send("Failed to get moderated communities");
    }
});

export default router;
