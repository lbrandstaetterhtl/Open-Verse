import { Router } from "express";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { isAuthenticated, isAdmin, isOwner } from "../middleware/auth";
import { postUpload, checkFileSignature } from "../utils/file-upload";
import { checkContent } from "../services/moderation";
import { logSecurityEvent } from "../utils/logger";
import { broadcastMessage } from "../services/websocket";
import { sanitizeUser } from "../storage";
import { canDeleteContent } from "../utils/permissions";

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
        const moderationResult = checkContent(postData.content + " " + (title || ""));
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

        const author = await storage.getUser(post.authorId);
        const comments = await storage.getComments(post.id);
        const commentsWithAuthors = await Promise.all(comments.map(async (comment) => {
            const commentAuthor = await storage.getUser(comment.authorId);
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

        const reactions = await storage.getPostReactions(post.id);
        const userReaction = req.user ? await storage.getUserPostReaction((req.user as any).id, post.id) : null;
        const isFollowing = req.user ? await storage.isFollowing((req.user as any).id, post.authorId) : false;

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

        const posts = await storage.getPosts(category);

        let filteredPosts = posts;
        if (communityId) {
            filteredPosts = posts.filter(p => p.communityId === communityId);
        } else {
            filteredPosts = posts.filter(p => !p.communityId);
        }

        console.log("Retrieved posts count:", filteredPosts.length);

        const postsWithDetails = await Promise.all(filteredPosts.map(async (post) => {
            const author = await storage.getUser(post.authorId);

            const comments = await storage.getComments(post.id);
            const commentsWithAuthors = await Promise.all(comments.map(async (comment) => {
                const commentAuthor = await storage.getUser(comment.authorId);
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

            const reactions = await storage.getPostReactions(post.id);
            const userReaction = req.user ? await storage.getUserPostReaction((req.user as any).id, post.id) : null;
            const isFollowing = req.user ? await storage.isFollowing((req.user as any).id, post.authorId) : false;

            return {
                ...post,
                author: {
                    id: author?.id,
                    username: author?.username || 'Unknown',
                    verified: author?.verified || false,
                    isFollowing
                },
                comments: commentsWithAuthors,
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
