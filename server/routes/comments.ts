import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { insertCommentSchema } from "@shared/schema";
import { broadcastMessage } from "../services/websocket";
import { canDeleteContent } from "../utils/permissions";

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

        broadcastMessage(JSON.stringify({
            type: 'new_comment',
            data: comment
        }));

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
            }
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
        res.sendStatus(204);
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).send("Failed to delete comment");
    }
});

export default router;
