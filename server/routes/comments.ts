import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { insertCommentSchema } from "@shared/schema";
import { broadcastMessage } from "../services/websocket";
import { canDeleteContent } from "../utils/permissions";
import { notificationService } from "../services/notification-service";
import { activityLogger } from "../services/activity-logger";

const router = Router();

// We need to move canDeleteContent to a shared utility
// For now, I'll inline it or import if I created it. 
// I haven't created it yet. It was inline in routes.ts.
// I will create server/utils/permissions.ts.


router.post("/", isAuthenticated, async (req, res) => {
    const result = insertCommentSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result.error);

    try {
        const comment = await storage.createComment({
            ...result.data,
            authorId: (req.user as any).id,
        });

        const post = await storage.getPost(comment.postId);
        if (post && post.authorId !== comment.authorId) {
            // Notify post author
            await notificationService.notify({
                userId: post.authorId,
                actorId: comment.authorId,
                type: "comment_post",
                postId: post.id,
                commentId: comment.id,
                preview: comment.content.slice(0, 100),
                actionUrl: `/post/${post.id}#comment-${comment.id}`
            });
        }

        // Handle Mentions
        await notificationService.notifyMentions(comment.content, comment.authorId, { 
            postId: comment.postId, 
            commentId: comment.id 
        });

        broadcastMessage(JSON.stringify({
            type: 'new_comment',
            data: comment
        }));

        activityLogger.logFromRequest(req, {
            action: 'comment.create',
            category: 'content',
            description: `Neuer Kommentar verfasst`,
            targetType: 'Comment',
            targetId: String(comment.id),
            targetLabel: comment.content.slice(0, 50),
            severity: 'info',
            newValue: comment,
            metadata: { postId: comment.postId }
        }).catch(err => console.error('[Monitor] comment.create failed:', err));

        res.status(201).json(comment);
    } catch (error) {
        console.error('Error creating comment:', error);
        res.status(500).send("Failed to create comment");
    }
});

router.post("/:id/like", isAuthenticated, async (req, res) => {
    try {
        const commentId = parseInt(req.params.id);
        const userId = (req.user as any).id;

        const comment = await storage.getComment(commentId);
        if (!comment) {
            return res.status(404).send("Comment not found");
        }

        const commentAuthor = await storage.getUser(comment.authorId);
        if (!commentAuthor) {
            return res.status(404).send("Comment author not found");
        }

        const isLiked = await storage.getUserCommentLike(userId, commentId);

        try {
            if (isLiked) {
                await storage.unlikeComment(userId, commentId);
                await storage.updateUserKarma(commentAuthor.id, -1);
            } else {
                await storage.likeComment(userId, commentId);
                await storage.updateUserKarma(commentAuthor.id, 1);

                // Notify comment author
                if (comment.authorId !== userId) {
                    await notificationService.notify({
                        userId: comment.authorId,
                        actorId: userId,
                        type: "like_comment",
                        postId: comment.postId,
                        commentId: comment.id,
                        actionUrl: `/post/${comment.postId}#comment-${comment.id}`
                    });
                }
            }
            
            activityLogger.logFromRequest(req, {
                action: isLiked ? 'like.remove' : 'like.add',
                category: 'social',
                description: `${isLiked ? 'Like entfernt' : 'Like gegeben'} für Kommentar von ${commentAuthor.username}`,
                targetType: 'Comment',
                targetId: String(comment.id),
                severity: 'info',
                metadata: { postId: comment.postId, authorId: comment.authorId }
            }).catch(err => console.error('[Monitor] comment.react failed:', err));
            
        } catch (error) {
            console.error('Error updating karma:', error);
            throw error;
        }

        const likesCount = await storage.getCommentLikes(commentId);

        res.json({ likes: likesCount, isLiked: !isLiked });
    } catch (error) {
        console.error('Error updating comment like:', error);
        res.status(500).send("Failed to update comment like");
    }
});

router.delete("/:id", isAuthenticated, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const comment = await storage.getComment(id);

        if (!comment) {
            return res.status(404).send("Comment not found");
        }

        const targetUser = await storage.getUser(comment.authorId);
        if (!targetUser) {
            return res.status(404).send("Comment author not found");
        }

        const canDelete = canDeleteContent(req.user, comment.authorId, targetUser.role);

        if (!canDelete) {
            return res.status(403).send("Forbidden");
        }

        // Calculate reputation impact from comment likes
        const likes = await storage.getCommentLikes(id);
        if (likes > 0) {
            await storage.updateUserKarma(targetUser.id, -likes);
        }

        await storage.deleteComment(id);
        
        activityLogger.logFromRequest(req, {
            action: 'comment.delete',
            category: 'content',
            description: `Kommentar gelöscht${comment.authorId !== (req.user as any).id ? ' (durch Mod/Admin)' : ''}`,
            targetType: 'Comment',
            targetId: String(id),
            targetLabel: comment.content.slice(0, 50),
            severity: 'warning',
            oldValue: comment,
            metadata: { deletedByRole: (req.user as any).role, postId: comment.postId }
        }).catch(err => console.error('[Monitor] comment.delete failed:', err));
        
        res.sendStatus(204);
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).send("Failed to delete comment");
    }
});

export default router;
