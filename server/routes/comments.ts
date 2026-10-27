import { Router, type Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { insertCommentSchema } from "@shared/schema";
import { canDeleteContent } from "../utils/permissions";
import { notificationService } from "../services/notification-service";
import { activityLogger } from "../services/activity-logger";
import { parseId, validateIdParams } from "../utils/params";
import { sendValidationError, sendInternalError } from "../utils/http-errors";
import { canViewPost, canInteractWithPost, broadcastAboutPost, shadowCountScope, viewerIsShadowBanned } from "../utils/community-access";

const router = Router();
// Malformed ids answer 404 before any handler runs (CONTENT-10, AUTHZ-12).
validateIdParams(router, ["id"]);

const postNotFound = (res: Response) => res.status(404).json({ error: "Post not found", code: "NOT_FOUND" });
const commentNotFound = (res: Response) => res.status(404).json({ error: "Comment not found", code: "NOT_FOUND" });
const bannedFromCommunity = (res: Response) =>
    res.status(403).json({ error: "You are banned from this community.", code: "COMMUNITY_BANNED" });

router.post("/", isAuthenticated, async (req, res) => {
    const result = insertCommentSchema.safeParse(req.body);
    if (!result.success) return sendValidationError(res, result.error);

    try {
        // The post must exist and be open to this user: visible (private communities) and not banned there
        // (CONTENT-3, CONTENT-6, SOCIAL-4).
        const post = await storage.getPost(result.data.postId);
        if (!post) return postNotFound(res);
        const access = await canInteractWithPost(req, post);
        if (access === "not_found") return postNotFound(res);
        if (access === "banned") return bannedFromCommunity(res);

        const comment = await storage.createComment({
            content: result.data.content,
            postId: post.id,
            authorId: (req.user as any).id,
        });

        if (post.authorId && post.authorId !== comment.authorId) {
            // Notify post author
            await notificationService.notify({
                userId: post.authorId,
                actorId: comment.authorId,
                type: "comment_post",
                postId: post.id,
                commentId: comment.id,
                preview: comment.content.slice(0, 100),
                actionUrl: `/posts/${post.id}#comment-${comment.id}`
            });
        }

        // Handle Mentions
        await notificationService.notifyMentions(comment.content, comment.authorId, {
            postId: comment.postId,
            commentId: comment.id
        });

        // Ids only, and only to users who may see the post: clients refetch through the authorised routes
        // (SOCIAL-12, ATK-RT-2).
        // A shadow-banned commenter's comment is only announced to the commenter and staff.
        broadcastAboutPost(post, JSON.stringify({ type: 'new_comment', postId: post.id, commentId: comment.id }), comment.authorId).catch((err) =>
            console.error("[WS] new_comment broadcast failed:", err),
        );

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
        sendInternalError(res, error, "POST /api/comments");
    }
});

router.post("/:id/like", isAuthenticated, async (req, res) => {
    try {
        const commentId = parseId(req.params.id)!;
        const userId = (req.user as any).id;

        const comment = await storage.getComment(commentId);
        if (!comment) return commentNotFound(res);
        const post = await storage.getPost(comment.postId);
        if (!post) return commentNotFound(res);
        const access = await canInteractWithPost(req, post);
        if (access === "not_found") return commentNotFound(res);
        if (access === "banned") return bannedFromCommunity(res);

        // Comments of deleted users keep author_id 0: they can be liked, nobody gets karma or a notification.
        const commentAuthor = comment.authorId ? await storage.getUser(comment.authorId) : undefined;

        // Like row and karma change in one locked transaction: parallel clicks count once (CONTENT-22)
        // A shadow-banned user's likes are invisible to others and do not change the author's public karma.
        const karmaTarget = viewerIsShadowBanned(req) ? null : commentAuthor?.id ?? null;
        const { liked } = await storage.getContentStore().toggleCommentLike(userId, commentId, karmaTarget);

        if (liked && commentAuthor && comment.authorId !== userId) {
            await notificationService.notify({
                userId: comment.authorId,
                actorId: userId,
                type: "like_comment",
                postId: comment.postId,
                commentId: comment.id,
                actionUrl: `/posts/${comment.postId}#comment-${comment.id}`
            });
        }

        activityLogger.logFromRequest(req, {
            action: liked ? 'like.add' : 'like.remove',
            category: 'social',
            description: `${liked ? 'Like gegeben' : 'Like entfernt'} für Kommentar von ${commentAuthor?.username ?? "gelöschtem Nutzer"}`,
            targetType: 'Comment',
            targetId: String(comment.id),
            severity: 'info',
            metadata: { postId: comment.postId, authorId: comment.authorId }
        }).catch(err => console.error('[Monitor] comment.react failed:', err));

        const likesCount = await storage.getContentStore().getCommentLikes(commentId, shadowCountScope(req));
        res.json({ likes: likesCount, isLiked: liked });
    } catch (error) {
        sendInternalError(res, error, "POST /api/comments/:id/like");
    }
});

router.delete("/:id", isAuthenticated, async (req, res) => {
    try {
        const id = parseId(req.params.id)!;
        const comment = await storage.getComment(id);
        if (!comment) return commentNotFound(res);

        const post = await storage.getPost(comment.postId);
        if (post && !(await canViewPost(req, post))) return commentNotFound(res);

        const targetUser = comment.authorId ? await storage.getUser(comment.authorId) : undefined;
        if (!canDeleteContent(req.user, comment.authorId, targetUser?.role ?? "user")) {
            return res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
        }

        // Take back the karma the comment's likes gave its author (likes of shadow-banned users gave none)
        const likes = await storage.getContentStore().getCommentLikes(id, { includeShadowBanned: false });
        if (likes > 0 && targetUser) {
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
        sendInternalError(res, error, "DELETE /api/comments/:id");
    }
});

export default router;
