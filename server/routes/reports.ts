import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, isAdmin } from "../middleware/auth";
import { insertReportSchema } from "@shared/schema";
import { broadcastMessage, connections } from "../services/websocket";
import { WebSocket } from 'ws';
import { notificationService } from "../services/notification-service";
import { activityLogger } from "../services/activity-logger";

const router = Router();

router.get("/", isAdmin, async (req, res) => {
    const reports = await storage.getReports();
    res.json(reports);
});

router.post("/", isAuthenticated, async (req, res) => {
    try {
        console.log("[Report] Incoming Request Body:", req.body);
        const result = insertReportSchema.safeParse(req.body);
        if (!result.success) {
            console.error("[Report] Validation Failed:", result.error.format());
            return res.status(400).json(result.error);
        }

        console.log("[Report] Validation Passed, building storage object...");
        const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown";

        const reportData = {
            reason: result.data.reason,
            postId: result.data.postId ?? null,
            commentId: result.data.commentId ?? null,
            discussionId: result.data.discussionId ?? null,
            reporterId: (req.user as any).id,
            ipAddress: ipAddress,
        };
        
        console.log("[Report] Sending to storage.createReport:", reportData);
        const report = await storage.createReport(reportData);
        console.log("[Report] Successfully created in DB with ID:", report.id);

        // Notify admins (non-blocking)
        try {
            const message = JSON.stringify({
                type: "new_report",
                data: {
                    ...report,
                    reporter: { username: (req.user as any).username },
                },
            });

            connections.forEach(async (ws, userId) => {
                try {
                    const user = await storage.getUser(userId);
                    if (user && (user.role === 'admin' || user.role === 'owner') && ws.readyState === WebSocket.OPEN) {
                        ws.send(message);
                    }
                } catch (wsErr) {
                    console.error("[Report] Failed to notify admin via WS:", userId, wsErr);
                }
            });
        } catch (notifErr) {
            console.error("[Report] Error in admin notification loop:", notifErr);
        }

        // Log activity (non-blocking)
        activityLogger.logFromRequest(req, {
            action: 'report.submit',
            category: 'moderation',
            description: `Teilt mit: ${result.data.reason.slice(0, 50)}`,
            targetType: 'Report',
            targetId: String(report.id),
            severity: 'warning'
        }).catch(err => console.error('[Monitor] report.submit activity log failed:', err));

        return res.status(201).json(report);
    } catch (error: any) {
        console.error("[Report] CRITICAL ERROR IN ROUTE:", error);
        res.status(500).json({ 
            message: "Failed to create report", 
            error: error.message || String(error) 
        });
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
                const resolutionTime = Math.floor((Date.now() - new Date(report.createdAt).getTime()) / 1000);
                const updatedReport = await storage.updateReportStatus(reportId, status, (req.user as any).id, resolutionTime);

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
                    await notificationService.notify({
                        userId: report.reporterId,
                        actorId: (req.user as any).id,
                        type: "report_resolved",
                        actionUrl: "/notifications"
                    });
                } catch (notifError) {
                    console.error("[NotificationService] Error notifying reporter:", notifError);
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
                    await notificationService.notify({
                        userId: report.reporterId,
                        actorId: (req.user as any).id,
                        type: "report_rejected",
                        actionUrl: "/notifications"
                    });
                } catch (notifError) { console.error("[NotificationService] Error notifying reporter:", notifError); }
            }
            res.json(updatedReport);
        }
        
        // Ensure log is recorded for any report patch
        const updatedReport = await storage.getReport(reportId);
        if (updatedReport) {
            activityLogger.logFromRequest(req, {
                action: 'report.resolve',
                category: 'moderation',
                description: `Report Status auf ${status} gesetzt`,
                targetType: 'Report',
                targetId: String(reportId),
                severity: status === 'rejected' ? 'info' : 'warning',
                newValue: { status }
            }).catch(err => console.error('[Monitor] report.resolve failed:', err));
        }
        
    } catch (error) {
        console.error("Error updating report:", error);
        res.status(500).send("Failed to update report status");
    }
});

export default router;
