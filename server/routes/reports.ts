import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, isAdmin } from "../middleware/auth";
import { insertReportSchema } from "@shared/schema";
import { broadcastMessage, connections } from "../services/websocket";
import { WebSocket } from 'ws';

const router = Router();

router.get("/", isAuthenticated, async (req, res) => {
    const reports = await storage.getReports();
    res.json(reports);
});

router.post("/", isAuthenticated, async (req, res) => {
    const result = insertReportSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(result.error);
    }

    try {
        if (result.data.discussionId) {
            const discussion = await storage.getPost(result.data.discussionId);
            if (!discussion || discussion.category !== 'discussion') {
                return res.status(404).send("Discussion not found");
            }
        }

        const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown";

        const report = await storage.createReport({
            reason: result.data.reason,
            postId: result.data.postId ?? null,
            commentId: result.data.commentId ?? null,
            discussionId: result.data.discussionId ?? null,
            reporterId: (req.user as any).id,
            ipAddress: ipAddress,
        });

        // Notify admins
        const adminSockets = Array.from(connections.entries()).filter(async ([userId]) => {
            const user = await storage.getUser(userId);
            return user?.role === 'admin' || user?.role === 'owner';
        });

        const message = JSON.stringify({
            type: "new_report",
            data: {
                ...report,
                reporter: { username: (req.user as any).username },
            },
        });

        // We can't await filter so we loop manually or accept potential lag.
        // For now simple loop over all connections and check role is inefficient but okay for small scale.
        // Better: connections map should store user role or we fetch it.

        // Optimisation: just broadcast to everyone? No, admin only.
        // Let's iterate all connections.
        connections.forEach(async (ws, userId) => {
            const user = await storage.getUser(userId);
            if (user && (user.role === 'admin' || user.role === 'owner') && ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });

        res.status(201).json(report);
    } catch (error) {
        console.error("Error creating report:", error);
        res.status(500).send("Failed to create report");
    }
});

router.patch("/:id", isAdmin, async (req, res) => {
    try {
        const reportId = parseInt(req.params.id);
        const { status } = req.body;

        if (!["pending", "resolved", "rejected"].includes(status)) {
            return res.status(400).send("Invalid report status");
        }

        const report = await storage.getReport(reportId);
        if (!report) {
            return res.status(404).send("Report not found");
        }

        if (status === "resolved") {
            try {
                const updatedReport = await storage.updateReportStatus(reportId, status);

                try {
                    if (report.discussionId) {
                        await storage.deleteComments(report.discussionId);
                        await storage.deletePostReactions(report.discussionId);
                        await storage.deletePost(report.discussionId);
                    } else if (report.postId) {
                        await storage.deleteComments(report.postId);
                        await storage.deletePostReactions(report.postId);
                        await storage.deletePost(report.postId);
                    } else if (report.commentId) {
                        await storage.deleteComment(report.commentId);
                    }
                } catch (deleteError) {
                    console.error("Error during content deletion:", deleteError);
                }

                try {
                    await storage.createNotification({
                        userId: report.reporterId,
                        type: "report_resolved",
                        fromUserId: (req.user as any).id,
                    });
                } catch (notifError) {
                    console.error(notifError);
                }

                res.json(updatedReport);
            } catch (error) {
                console.error("Error resolving report:", error);
                res.status(500).send("Failed to resolve report");
            }
        } else {
            const updatedReport = await storage.updateReportStatus(reportId, status);
            if (status === "rejected") {
                try {
                    await storage.createNotification({
                        userId: report.reporterId,
                        type: "report_rejected",
                        fromUserId: (req.user as any).id,
                    });
                } catch (notifError) { console.error(notifError); }
            }
            res.json(updatedReport);
        }
    } catch (error) {
        console.error("Error updating report:", error);
        res.status(500).send("Failed to update report status");
    }
});

export default router;
