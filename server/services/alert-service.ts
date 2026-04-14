import { db } from "../db";
import { alertHistory } from "@shared/schema";

class AlertService {
  async fire(params: { severity: string, title: string, description: string }): Promise<void> {
    try {
      // Find rules or just fire an adhoc alert

      
      await db.insert(alertHistory).values({
        ruleName: "Adhoc Alert",
        severity: params.severity,
        title: params.title,
        description: params.description,
        status: "firing",
      });

      // If critical, notify admins
      if (params.severity === "critical") {
        notifyAdmins({
          title: `CRITICAL ALERT: ${params.title}`,
          message: params.description,
        });
      }
    } catch (e) {
      console.error("[AlertService] failed to fire alert", e);
    }
  }
}

async function notifyAdmins(params: { title: string, message: string }) {
  // Basic implementation to notify admins, e.g. using existing notificationService logic
  // Currently omitted from the spec, but we can do a best effort
  console.error(`[ADMIN NOTIFY] ${params.title} - ${params.message}`);
}

export const alertService = new AlertService();
