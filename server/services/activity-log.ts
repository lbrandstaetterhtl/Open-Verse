import { db } from "../db";
import { activityLogs } from "@shared/schema";
import { type Request } from "express";

/* FEATURE [AL-003]: Activity Logs – Implementation of the central logger service. */
export class ActivityLogger {
  static async log(
    req: Request,
    params: {
      action: string;
      category: string;
      targetType?: string;
      targetId?: string | number;
      targetLabel?: string;
      description: string;
      oldValue?: any;
      newValue?: any;
      severity: "low" | "medium" | "high" | "critical";
      status: "success" | "failure" | "warning";
      metadata?: any;
    }
  ) {
    // Non-blocking execution
    (async () => {
      try {
        const user = req.user as any;
        if (!user) return;

        await db.insert(activityLogs).values({
          adminId: user.id,
          adminEmail: user.email,
          adminRole: user.role || (user.isAdmin ? "admin" : "user"),
          action: params.action,
          category: params.category,
          targetType: params.targetType,
          targetId: params.targetId?.toString(),
          targetLabel: params.targetLabel,
          description: params.description,
          oldValue: params.oldValue ? JSON.stringify(params.oldValue) : null,
          newValue: params.newValue ? JSON.stringify(params.newValue) : null,
          ipAddress: req.ip || req.headers["x-forwarded-for"]?.toString(),
          userAgent: req.headers["user-agent"],
          status: params.status,
          severity: params.severity,
          metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        });
      } catch (error) {
        // Silent failure to prevent blocking the main request
        console.error("Critical: Failed to record activity log:", error);
      }
    })();
  }
}
