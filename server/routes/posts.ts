import { Router } from "express";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { isAuthenticated, isAdmin, isOwner } from "../middleware/auth";
import { postUpload, checkFileSignature } from "../utils/file-upload";
import { checkContent } from "../services/moderation";
import { logSecurityEvent } from "../utils/logger";
import { broadcastMessage } from "../services/websocket";
import { notificationService } from "../services/notification-service";
import { sanitizeUser } from "../storage";
import { canDeleteContent } from "../utils/permissions";
import { SettingsService } from "../services/settings";
import { activityLogger } from "../services/activity-logger";

const router = Router();

// Create post with optional media upload
router.post("/", isAuthenticated, postUpload.any(), async (req, res) => {
    try {
        const user = req.user as any;
        console.log('POST /api/posts - Processing request');
        console.log('User:', user.username);

        const { title, content, category, communityId } = req.body;

        if (!content && !req.files) {
            return res.status(400).send("Content or media is required");
        }

        // FEATURE [SEC-010]: Post Cooldown Check
        try {
            const cooldownSeconds = await SettingsService.get("content", "post_cooldown_seconds", 30);
            const userPosts = await storage.getPostsByUser(user.id);
            if (userPosts.length > 0) {
                const lastPost = userPosts[0]; // Already sorted by desc in storage
                const now = new Date();
                const diffSeconds = (now.getTime() - lastPost.createdAt.getTime()) / 1000;
                
                if (diffSeconds < cooldownSeconds) {
                    const remaining = Math.ceil(cooldownSeconds - diffSeconds);
                    return res.status(429).json({ 
                        message: `Please wait ${remaining} seconds before posting again.`,
                        remainingSeconds: remaining
                    });
                }
            }
        } catch (error) {
            console.error("Error checking post cooldown:", error);
            // Non-blocking: continue if check fails
        }

        // Build post object
        const postData: any = {
            authorId: user.id,
            content: content || "",
            category: category || "general",
            communityId: communityId ? parseInt(communityId) : undefined
        };

        if (postData.communityId) {
            const community = await storage.getCommunity(postData.communityId);
            if (community) {
                const allowed = community.allowedCategories.split(',').map((c: string) => c.trim());
                if (!allowed.includes(postData.category)) {
                    return res.status(400).send(`Category '${postData.category}' is not allowed in this community. Allowed: ${allowed.join(', ')}`);
                }
            } else {
                return res.status(404).send("Community not found");
            }
        }

        // Moderation Check
        const moderationResult = await checkContent(postData.content + " " + (title || ""));
        if (!moderationResult.allowed) {
            return res.status(400).send(moderationResult.reason);
        }

        if (title) {
            postData.title = title;
        } else {
            // Generate a default title from content or use a placeholder
            postData.title = content ? (content.length > 50 ? content.substring(0, 47) + "..." : content) : "New Post";
        }

        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
            const uploadedFile = req.files[0];
            console.log('Media file uploaded:', uploadedFile.filename, 'Size:', uploadedFile.size, 'Mime:', uploadedFile.mimetype);

            // Custom Size Validation
            const IMAGE_LIMIT = 10 * 1024 * 1024; // 10MB

            if (uploadedFile.mimetype.startsWith('image/') && uploadedFile.size > IMAGE_LIMIT) {
                try {
                    fs.unlinkSync(path.join("./uploads", uploadedFile.filename));
                } catch (e) { console.error("Error deleting large file:", e); }
                return res.status(400).send("Image size exceeds 10MB limit.");
            }

            // SEC-002: Verify file signature
            const isValidSignature = await checkFileSignature(uploadedFile.path, uploadedFile.mimetype);
            if (!isValidSignature) {
                try {
                    fs.unlinkSync(path.join("./uploads", uploadedFile.filename));
                } catch (e) { console.error("Error deleting invalid file:", e); }
                logSecurityEvent({ type: 'FILE_UPLOAD_REJECTED', details: { reason: 'Invalid Magic Bytes', originalName: uploadedFile.originalname, mime: uploadedFile.mimetype } });
                return res.status(400).send("File content does not match extension.");
            }

            postData.mediaUrl = uploadedFile.filename;
            postData.mediaType = req.body.mediaType || (uploadedFile.mimetype.startsWith('image/') ? 'image' : 'video');
        }

        const post = await storage.createPost(postData);

        // Broadcast new post
        broadcastMessage(JSON.stringify({ type: 'new_post', postId: post.id }));

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
        console.error('Error creating post:', error);
        res.status(500).send("Failed to create post");
    }
});

router.get("/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const post = await storage.getPost(id);

        if (!post) {
            return res.status(404).send("Post not found");
        }

        // PERF-FIX [ROUTES-002]: Batch fetch post details to avoid multiple DB roundtrips
        const [author, comments, reactions] = await Promise.all([
            storage.getUser(post.authorId),
            storage.getComments(post.id),
            storage.getPostReactions(post.id)
        ]);

        const commentAuthorIds = [...new Set(comments.map(c => c.authorId))];
        const commentAuthors = await storage.getUsersByIds(commentAuthorIds);
        const authorsMap = new Map(commentAuthors.map(u => [u.id, u]));

        const userReaction = req.user ? await storage.getUserPostReaction((req.user as any).id, post.id) : null;
        const isFollowing = req.user ? await storage.isFollowing((req.user as any).id, post.authorId) : false;

        const commentsWithAuthors = await Promise.all(comments.map(async (comment) => {
            const commentAuthor = authorsMap.get(comment.authorId);
            const likes = await storage.getCommentLikes(comment.id);
            const isLiked = req.user ? await storage.getUserCommentLike((req.user as any).id, comment.id) : false;
            return {
                ...comment,
                author: {
                    username: commentAuthor?.username || 'Unknown',
                    role: commentAuthor?.role || 'user',
                    verified: commentAuthor?.verified || false
                },
                likes,
                isLiked
            };
        }));

        res.json({
            ...post,
            author: author ? sanitizeUser(author) : undefined,
            comments: commentsWithAuthors,
            likes: reactions.likes - reactions.dislikes,
            userVote: userReaction,
            isFollowing
        });
    } catch (error) {
        console.error('Error fetching post:', error);
        res.status(500).send("Failed to fetch post");
    }
});

router.get("/", async (req, res) => {
    try {
        console.log("Fetching posts with query:", req.query);
        const category = req.query.category as string | undefined;
        const communityId = req.query.communityId ? parseInt(req.query.communityId as string) : undefined;

        // PERF-FIX [ROUTES-005]: Filtering moved to DB level
        const filteredPosts = await storage.getPosts(category, communityId);

        console.log("Retrieved posts count:", filteredPosts.length);

        // PERF-FIX [ROUTES-003]: Optimized batch lookup for feed page
        const authorIds = [...new Set(filteredPosts.map(p => p.authorId))];
        const authors = await storage.getUsersByIds(authorIds);
        const authorsMap = new Map(authors.map(u => [u.id, u]));

        const postsWithDetails = await Promise.all(filteredPosts.map(async (post) => {
            const author = authorsMap.get(post.authorId);
            const isFollowing = req.user ? await storage.isFollowing((req.user as any).id, post.authorId) : false;

            // Note: Full comment retrieval for every post in feed is still heavy.
            // In a real optimized system, we'd only fetch comment counts.
            // But let's at least optimize the author parts here.
            const reactions = await storage.getPostReactions(post.id);
            const userReaction = req.user ? await storage.getUserPostReaction((req.user as any).id, post.id) : null;

            return {
                ...post,
                author: {
                    id: author?.id,
                    username: author?.username || 'Unknown',
                    verified: author?.verified || false,
                    isFollowing
                },
                reactions,
                userReaction
            };
        }));

        res.json(postsWithDetails);
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).send("Failed to fetch posts");
    }
});

router.delete("/:id", isAuthenticated, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const post = await storage.getPost(id);

        if (!post) {
            return res.status(404).send("Post not found");
        }

        // Check permissions: Author, Owner, or Admin
        const user = req.user as any;
        if (post.authorId !== user.id && user.role !== 'owner' && user.role !== 'admin') {
            return res.status(403).send("Forbidden");
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
        console.error('Error deleting post:', error);
        res.status(500).send("Failed to delete post");
    }
});

router.post("/:id/react", isAuthenticated, async (req, res) => {
    try {
        const postId = parseInt(req.params.id);
        const userId = (req.user as any).id;
        const { isLike } = req.body;

        if (typeof isLike !== 'boolean') {
            return res.status(400).send("Invalid reaction type");
        }

        const post = await storage.getPost(postId);
        if (!post) return res.status(404).send("Post not found");

        const currentReaction = await storage.getUserPostReaction(userId, postId);
        const postAuthor = await storage.getUser(post.authorId);

        if (!postAuthor) {
            return res.status(404).send("Post author not found");
        }

        // Calculate reputation change
        let reputationChange = 0;

        // Remove reputation impact of previous reaction if it exists
        if (currentReaction !== null) {
            reputationChange += currentReaction.isLike ? -1 : 1; // Remove previous impact
            await storage.removePostReaction(userId, postId);
        }

        // Add new reaction if different from current
        if (currentReaction === null || currentReaction.isLike !== isLike) {
            reputationChange += isLike ? 1 : -1; // Add new impact
            await storage.createPostLike(userId, postId, isLike);
            
            activityLogger.logFromRequest(req, {
                action: isLike ? 'like.add' : 'like.remove',
                category: 'social',
                description: `${isLike ? 'Like gegeben' : 'Like entfernt'} für Post "${post.title}" von ${postAuthor.username}`,
                targetType: 'Post',
                targetId: String(post.id),
                targetLabel: post.title,
                severity: 'info',
                newValue: { action: isLike ? 'like' : 'unlike' }
            }).catch(err => console.error('[Monitor] post.react failed:', err));
            
            // Phase 2: Notify author if it's a LIKE and not the author themselves
            if (isLike && post.authorId !== userId) {
                await notificationService.notify({
                    userId: post.authorId,
                    actorId: userId,
                    type: "like_post",
                    postId: post.id,
                    title: post.title,
                    actionUrl: `/post/${post.id}`
                });
            }
        }

        // Update author's reputation if there's a change
        if (reputationChange !== 0) {
            await storage.updateUserKarma(postAuthor.id, reputationChange);
        }

        const reactions = await storage.getPostReactions(postId);
        const userReaction = await storage.getUserPostReaction(userId, postId);

        res.json({ ...post, reactions, userReaction });
    } catch (error) {
        console.error('Error updating reaction:', error);
        res.status(500).send("Failed to update reaction");
    }
});

// Comments sub-route (e.g. /api/posts/:postId/comments)
// Or keep separate? The existing API is /api/posts/:postId/comments and /api/comments
// I'll keep /api/comments separate for creation/deletion, but /api/posts/:id returns comments anyway.
// But there IS a separate endpoint: app.get("/api/posts/:postId/comments"...)
// I'll add it here.

router.get("/:postId/comments", async (req, res) => {
    try {
        const comments = await storage.getComments(parseInt(req.params.postId));
        const commentsWithAuthors = await Promise.all(comments.map(async (comment) => {
            const author = await storage.getUser(comment.authorId);
            return {
                ...comment,
                author: { username: author?.username || 'Unknown' }
            };
        }));
        res.json(commentsWithAuthors);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).send("Failed to fetch comments");
    }
});

export default router;
