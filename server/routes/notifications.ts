import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";

const router = Router();

/**
 * Get notifications with filters and pagination
 */
router.get("/", isAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any).id;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const unreadOnly = req.query.unreadOnly === 'true';
        const type = req.query.type ? (req.query.type as string).split(',') : undefined;

        const notifications = await storage.getNotifications(userId, {
            limit,
            offset,
            unreadOnly,
            type
        });
        res.json(notifications);
    } catch (error) {
        console.error("Error getting notifications:", error);
        res.status(500).send("Failed to get notifications");
    }
});

/**
 * Get unread/unseen counts
 */
router.get("/counts", isAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any).id;
        const counts = await storage.getNotificationCounts(userId);
        res.json(counts);
    } catch (error) {
        console.error("Error getting notification counts:", error);
        res.status(500).send("Failed to get notification counts");
    }
});

/**
 * Mark notifications as seen (clears badge)
 */
router.post("/seen", isAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any).id;
        await storage.markNotificationsAsSeen(userId);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error marking notifications as seen:", error);
        res.status(500).send("Failed to mark notifications as seen");
    }
});

/**
 * Mark all as read
 */
router.post("/read-all", isAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any).id;
        await storage.markAllNotificationsAsRead(userId);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error marking all notifications as read:", error);
        res.status(500).send("Failed to mark all as read");
    }
});

/**
 * Mark specific notification as read
 */
router.post("/:id/read", isAuthenticated, async (req, res) => {
    try {
        const notificationId = parseInt(req.params.id);
        const userId = (req.user as any).id;

        // Optimization: We could do a single query to update ONLY if userId matches
        // but storage methods are usually simple.
        await storage.markNotificationAsRead(notificationId);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error marking notification as read:", error);
        res.status(500).send("Failed to mark notification as read");
    }
});

/**
 * Delete specific notification (soft delete)
 */
router.delete("/:id", isAuthenticated, async (req, res) => {
    try {
        const notificationId = parseInt(req.params.id);
        await storage.deleteNotification(notificationId);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting notification:", error);
        res.status(500).send("Failed to delete notification");
    }
});

/**
 * Get notification preferences
 */
router.get("/preferences", isAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any).id;
        const prefs = await storage.getNotificationPreferences(userId);
        res.json(prefs);
    } catch (error) {
        console.error("Error getting notification preferences:", error);
        res.status(500).send("Failed to get preferences");
    }
});

/**
 * Update notification preferences
 */
router.patch("/preferences", isAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any).id;
        const updated = await storage.updateNotificationPreferences(userId, req.body);
        res.json(updated);
    } catch (error) {
        console.error("Error updating notification preferences:", error);
        res.status(500).send("Failed to update preferences");
    }
});

export default router;
