import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { messageSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

router.post("/", isAuthenticated, async (req, res) => {
    try {
        const result = messageSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json(result.error);
        }

        const senderId = (req.user as any).id;
        const { receiverId, content } = result.data;

        // Check if users follow each other
        const isFollowing = await storage.isFollowing(senderId, receiverId);
        const isFollowedBy = await storage.isFollowing(receiverId, senderId);

        if (!isFollowing || !isFollowedBy) {
            return res
                .status(403)
                .send("You can only message users who follow you and whom you follow");
        }

        const message = await storage.createMessage({
            senderId,
            receiverId,
            content,
        });

        await storage.createNotification({
            userId: receiverId,
            type: "new_message",
            fromUserId: senderId,
        });

        res.status(201).json(message);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid message data", details: (error as any).errors });
        }
        console.error("Error sending message:", error);
        res.status(500).send("Failed to send message");
    }
});

router.get("/unread/count", isAuthenticated, async (req, res) => {
    try {
        const count = await storage.getUnreadMessageCount((req.user as any).id);
        res.json({ count });
    } catch (error) {
        console.error("Error getting unread message count:", error);
        res.status(500).send("Failed to get unread message count");
    }
});

router.get("/:userId", isAuthenticated, async (req, res) => {
    try {
        const otherUserId = parseInt(req.params.userId);
        if (isNaN(otherUserId)) {
            return res.status(400).send("Invalid user ID");
        }
        const messages = await storage.getMessages((req.user as any).id, otherUserId);
        res.json(messages);
    } catch (error) {
        console.error("Error getting messages:", error);
        res.status(500).send("Failed to get messages");
    }
});

export default router;
