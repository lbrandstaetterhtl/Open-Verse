import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, isAdmin, hasPermission } from "../middleware/auth";
import { insertReportSchema } from "@shared/schema";
import { connections, sendToUser } from "../services/websocket";
import { notificationService } from "../services/notification-service";
import { activityLogger } from "../services/activity-logger";

import { sendValidationError, sendInternalError } from "../utils/http-errors";
import { parseId, validateIdParams } from "../utils/params";
import { canViewPost } from "../utils/community-access";
import { userHasPermission } from "../utils/permissions";

const router = Router();
validateIdParams(router, ["id"]);

// A report as API answers carry it: never the stored IP address of the reporter.
const withoutIp = ({ ipAddress: _ip, ...report }: any) => report;

router.get("/", hasPermission("reports"), async (req, res) => {
    try {
        res.json((await storage.getReports()).map(withoutIp));
    } catch (error) {
        sendInternalError(res, error, "GET /api/reports");
    }
});

router.post("/", isAuthenticated, async (req, res) => {
    try {
        const result = insertReportSchema.safeParse(req.body);
        if (!result.success) return sendValidationError(res, result.error);
        const user = req.user as any;
        const { reason, postId, commentId, discussionId } = result.data;

        // The target must exist and be visible to the reporter; nobody reports their own content (CONTENT-7).
        let authorId: number;
        if (commentId) {
            const comment = await storage.getComment(commentId);
            const post = comment ? await storage.getPost(comment.postId) : undefined;
            if (!comment || !post || !(await canViewPost(req, post))) {
                return res.status(404).json({ error: "Comment not found", code: "NOT_FOUND" });
            }
            authorId = comment.authorId;
        } else {
            const post = await storage.getPost((postId ?? discussionId)!);
            if (!post || !(await canViewPost(req, post))) {
                return res.status(404).json({ error: "Post not found", code: "NOT_FOUND" });
            }
            authorId = post.authorId;
        }
        if (authorId === user.id) {
            return res.status(400).json({ error: "You cannot report your own content", code: "OWN_CONTENT" });
        }

        // The reporter's IP address is not stored: nothing uses it, and it would identify the reporter.
        const created = await storage.getContentStore().createReportOnce({
            reason,
            postId: postId ?? null,
            commentId: commentId ?? null,
            discussionId: discussionId ?? null,
            reporterId: user.id,
        });
        if ("duplicate" in created) {
            // One open report per user and target (UI-14)
            return res.status(409).json({ error: "You have already reported this content", code: "ALREADY_REPORTED" });
        }
        const report = created.report;

        // Tell the staff who handle reports (owners, admins with the "reports" permission) that there is a new
        // one. Ids only: the dashboard loads the report itself through the authorised admin route.
        try {
            const message = JSON.stringify({ type: "new_report", data: { id: report.id } });
            const online = await storage.getUsersByIds(Array.from(connections.keys()));
            for (const admin of online) {
                if ((admin.role === 'admin' || admin.role === 'owner') && (await userHasPermission(admin, "reports"))) {
                    sendToUser(admin.id, message);
                }
            }
        } catch (notifErr) {
            console.error("[Report] Error in admin notification loop:", notifErr);
        }

        // Log activity (non-blocking)
        activityLogger.logFromRequest(req, {
            action: 'report.submit',
            category: 'moderation',
            description: `Teilt mit: ${reason.slice(0, 50)}`,
            targetType: 'Report',
            targetId: String(report.id),
            severity: 'warning'
        }).catch(err => console.error('[Monitor] report.submit activity log failed:', err));

        return res.status(201).json(withoutIp(report));
    } catch (error) {
        // Never the database message: it contains the SQL (INPUT-5)
        sendInternalError(res, error, "POST /api/reports");
    }
});

router.patch("/:id", hasPermission("reports"), async (req, res) => {
    try {
        const reportId = parseId(req.params.id)!;
        const status = req.body?.status;

        if (typeof status !== "string" || !["pending", "resolved", "rejected"].includes(status)) {
            return res.status(400).json({ error: "Invalid report status", code: "VALIDATION_ERROR" });
        }

        const report = await storage.getReport(reportId);
        if (!report) {
            return res.status(404).json({ error: "Report not found", code: "NOT_FOUND" });
        }

        if (status === "resolved") {
            try {
                const resolutionTime = Math.floor((Date.now() - new Date(report.createdAt).getTime()) / 1000);
                const updatedReport = await storage.updateReportStatus(reportId, status, (req.user as any).id, resolutionTime);

                try {
                    if (report.discussionId) {
                        await storage.deletePost(report.discussionId);
                    } else if (report.postId) {
                        await storage.deletePost(report.postId);
                    } else if (report.commentId) {
                        await storage.deleteComment(report.commentId);
                    }
                } catch (deleteError) {
                    console.error("[Report] Error during content deletion:", deleteError);
                }

                // A system notification: the reporter is not told which staff member handled the report
                try {
                    await notificationService.notify({
                        userId: report.reporterId,
                        type: "report_resolved",
                        actionUrl: "/notifications"
                    });
                } catch (notifError) {
                    console.error("[NotificationService] Error notifying reporter:", notifError);
                }

                res.json(withoutIp(updatedReport));
            } catch (error) {
                return sendInternalError(res, error, "PATCH /api/reports/:id (resolve)");
            }
        } else {
            const updatedReport = await storage.updateReportStatus(reportId, status);
            if (status === "rejected") {
                try {
                    await notificationService.notify({
                        userId: report.reporterId,
                        type: "report_rejected",
                        actionUrl: "/notifications"
                    });
                } catch (notifError) { console.error("[NotificationService] Error notifying reporter:", notifError); }
            }
            res.json(withoutIp(updatedReport));
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
        sendInternalError(res, error, "PATCH /api/reports/:id");
    }
});

export default router;
