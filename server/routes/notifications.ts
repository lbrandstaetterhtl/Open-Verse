import { Router, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { validateIdParams } from "../utils/params";
import { parsePagination } from "../utils/pagination";
import { sendValidationError } from "../utils/http-errors";
import { PREFERENCE_FLAGS } from "../storage/notification-storage";

const router = Router();

// Malformed notification ids answer 404 before any handler runs.
validateIdParams(router, ["id"]);

const fail = (res: Response, status: number, error: string, code?: string) =>
    res.status(status).json(code ? { error, code } : { error });

/** Query values are only used when they are plain strings (?type[]=a, ?type[a]=b or repeated keys are ignored). */
const queryString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/**
 * Get notifications with filters and pagination
 */
router.get("/", isAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any).id;
        const { limit, offset } = parsePagination(
            { limit: queryString(req.query.limit), offset: queryString(req.query.offset) },
            { defaultLimit: 50, maxLimit: 100 },
        );
        const unreadOnly = queryString(req.query.unreadOnly) === 'true';
        const typeParam = queryString(req.query.type);
        const type = typeParam
            ? typeParam.split(',').map((t) => t.trim()).filter((t) => t && t.length <= 50 && !t.includes("\u0000")).slice(0, 20)
            : undefined;

        const notifications = await storage.getNotifications(userId, {
            limit,
            // offsets beyond int4/bigint ranges just mean "past the end"
            offset: Math.min(offset, 1_000_000_000),
            unreadOnly,
            type: type && type.length > 0 ? type : undefined,
        });
        res.json(notifications);
    } catch (error) {
        console.error("Error getting notifications:", error);
        fail(res, 500, "Failed to get notifications");
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
        fail(res, 500, "Failed to get notification counts");
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
        fail(res, 500, "Failed to mark notifications as seen");
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
        fail(res, 500, "Failed to mark all as read");
    }
});

/**
 * Mark specific notification as read — only the caller's own notifications.
 */
router.post("/:id/read", isAuthenticated, async (req, res) => {
    try {
        const notificationId = Number(req.params.id);
        const userId = (req.user as any).id;
        const updated = await storage.getNotificationStore().markNotificationAsReadForUser(notificationId, userId);
        if (!updated) return fail(res, 404, "Notification not found");
        res.sendStatus(200);
    } catch (error) {
        console.error("Error marking notification as read:", error);
        fail(res, 500, "Failed to mark notification as read");
    }
});

/**
 * Delete (archive) all of the caller's notifications
 */
router.delete("/", isAuthenticated, async (req, res) => {
    try {
        await storage.getNotificationStore().deleteAllNotifications((req.user as any).id);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting notifications:", error);
        fail(res, 500, "Failed to delete notification");
    }
});

/**
 * Delete specific notification (soft delete) — only the caller's own notifications.
 */
router.delete("/:id", isAuthenticated, async (req, res) => {
    try {
        const notificationId = Number(req.params.id);
        const userId = (req.user as any).id;
        const archived = await storage.getNotificationStore().archiveNotificationForUser(notificationId, userId);
        if (!archived) return fail(res, 404, "Notification not found");
        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting notification:", error);
        fail(res, 500, "Failed to delete notification");
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
        fail(res, 500, "Failed to get preferences");
    }
});

// Each flag is on/off: the settings form sends booleans, older clients 0/1. Other keys (userId, id,
// updatedAt, …) are dropped, so the row can never be moved to another account.
const preferenceFlag = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => (v === true || v === 1 ? 1 : 0));
const preferencesSchema = z.object(
    Object.fromEntries(PREFERENCE_FLAGS.map((key) => [key, preferenceFlag.optional()])) as Record<
        (typeof PREFERENCE_FLAGS)[number],
        z.ZodOptional<typeof preferenceFlag>
    >,
);

/**
 * Update notification preferences
 */
router.patch("/preferences", isAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any).id;
        const parsed = preferencesSchema.safeParse(req.body ?? {});
        if (!parsed.success) return sendValidationError(res, parsed.error);
        const updated = await storage.updateNotificationPreferences(userId, parsed.data);
        res.json(updated);
    } catch (error) {
        console.error("Error updating notification preferences:", error);
        fail(res, 500, "Failed to update preferences");
    }
});

export default router;
