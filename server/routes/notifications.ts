import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";

const router = Router();

router.get("/", isAuthenticated, async (req, res) => {
    try {
        const notifications = await storage.getNotifications((req.user as any).id);
        res.json(notifications);
    } catch (error) {
        console.error("Error getting notifications:", error);
        res.status(500).send("Failed to get notifications");
    }
});

router.post("/:id/read", isAuthenticated, async (req, res) => {
    try {
        await storage.markNotificationAsRead(parseInt(req.params.id));
        res.sendStatus(200);
    } catch (error) {
        console.error("Error marking notification as read:", error);
        res.status(500).send("Failed to mark notification as read");
    }
});

router.delete("/:id", isAuthenticated, async (req, res) => {
    try {
        const notificationId = parseInt(req.params.id);
        const userId = (req.user as any).id;

        const userNotifications = await storage.getNotifications(userId);
        const targetNotification = userNotifications.find((n) => n.id === notificationId);

        if (!targetNotification) {
            return res.status(404).send("Notification not found");
        }

        await storage.deleteNotification(notificationId);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting notification:", error);
        res.status(500).send("Failed to delete notification");
    }
});

export default router;
