import { Router, type Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { messageSchema } from "@shared/schema";
import { notificationService } from "../services/notification-service";
import { validateIdParams, parseId } from "../utils/params";
import { sendValidationError } from "../utils/http-errors";
import { viewerIsShadowBanned, isStaff } from "../utils/community-access";

const router = Router();

// Malformed conversation ids ("abc", "-5", "99999999999") answer 404 before any handler runs.
validateIdParams(router, ["userId"]);

const fail = (res: Response, status: number, error: string, code?: string) =>
    res.status(status).json(code ? { error, code } : { error });

router.post("/", isAuthenticated, async (req, res) => {
    try {
        const result = messageSchema.safeParse(req.body);
        if (!result.success) {
            return sendValidationError(res, result.error);
        }

        const senderId = (req.user as any).id;
        const { receiverId, content } = result.data;

        // Check if users follow each other
        const isFollowing = await storage.isFollowing(senderId, receiverId);
        const isFollowedBy = await storage.isFollowing(receiverId, senderId);

        if (!isFollowing || !isFollowedBy) {
            return fail(res, 403, "You can only message users who follow you and whom you follow");
        }

        // A shadow-banned sender's messages are silently withheld from the receiver (unless the receiver is
        // staff or shadow-banned too): the sender sees them as sent, the receiver gets nothing.
        let withheld = false;
        if (viewerIsShadowBanned(req)) {
            const receiver = await storage.getUser(receiverId);
            withheld = !(receiver && (isStaff(receiver) || receiver.isShadowBanned));
        }

        const message = await storage.getMessageStore().createMessage({
            senderId,
            receiverId,
            content,
        }, { withheld });

        // Goes through the notification service: names the sender, respects preferences, pushes via WebSocket.
        if (!withheld) await notificationService.notify({
            userId: receiverId,
            actorId: senderId,
            type: "new_message",
            preview: content.slice(0, 100),
            actionUrl: `/chat/${senderId}`,
        });

        res.status(201).json(message);
    } catch (error) {
        console.error("Error sending message:", error);
        fail(res, 500, "Failed to send message");
    }
});

router.get("/unread/count", isAuthenticated, async (req, res) => {
    try {
        const count = await storage.getUnreadMessageCount((req.user as any).id);
        res.json({ count });
    } catch (error) {
        console.error("Error getting unread message count:", error);
        fail(res, 500, "Failed to get unread message count");
    }
});

/**
 * The newest messages of the conversation with :userId (oldest first). ?before=<messageId> pages back.
 * Opening a conversation marks the messages received in it as read.
 */
router.get("/:userId", isAuthenticated, async (req, res) => {
    try {
        const me = (req.user as any).id;
        const otherUserId = Number(req.params.userId);
        const beforeId = typeof req.query.before === "string" ? parseId(req.query.before) ?? undefined : undefined;
        const messages = await storage.getMessageStore().getConversation(me, otherUserId, { limit: 100, beforeId });
        await storage.getMessageStore().markConversationAsRead(me, otherUserId);
        res.json(messages);
    } catch (error) {
        console.error("Error getting messages:", error);
        fail(res, 500, "Failed to get messages");
    }
});

export default router;
