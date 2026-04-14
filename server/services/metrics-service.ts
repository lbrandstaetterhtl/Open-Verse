import { db } from "../db";
import { systemMetrics, activityLogs, anomalyEvents, tickets } from "@shared/schema";
import { count, eq, and, or, gte, inArray, sql, isNull } from "drizzle-orm";

class MetricsService {
  private buffer: any[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  record(name: string, value: number, dimensions?: Record<string, string>): void {
    const now = new Date();
    this.buffer.push({
      metricName: name,
      metricValue: value,
      dimensions: JSON.stringify(dimensions ?? {}),
      periodStart: now,
      periodEnd: now,
      granularity: 'minute',
    });

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 30_000);
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    this.flushTimer = null;

    try {
      await db.insert(systemMetrics).values(batch);
    } catch (error) {
      console.error('[MetricsService] Failed to write batch:', error);
    }
  }

  async aggregateHourly(): Promise<void> {
    // Basic stub, real implementation would aggregate minute metrics
  }

  async captureHealthSnapshot(): Promise<void> {
    const nowTs = Date.now();
    const fiveMinutesAgo = new Date(nowTs - 300000);
    const oneHourAgo = new Date(nowTs - 3600000);

    try {
      const activeUsers = await db.select({ count: count(sql`DISTINCT user_id`) })
        .from(activityLogs)
        .where(sql`${activityLogs.createdAt} >= ${fiveMinutesAgo.toISOString()}`)
        .get();
      this.record('active_users', activeUsers?.count ?? 0);

      const recentPosts = await db.select({ count: count() })
        .from(activityLogs)
        .where(and(
          eq(activityLogs.action, 'post.create'),
          sql`${activityLogs.createdAt} >= ${oneHourAgo.toISOString()}`
        ))
        .get();
      this.record('posts_per_hour', recentPosts?.count ?? 0);

      const totalRequests = await db.select({ count: count() })
        .from(activityLogs)
        .where(sql`${activityLogs.createdAt} >= ${fiveMinutesAgo.toISOString()}`)
        .get();
      const errorRequests = await db.select({ count: count() })
        .from(activityLogs)
        .where(and(
          inArray(activityLogs.severity, ['error', 'critical']),
          sql`${activityLogs.createdAt} >= ${fiveMinutesAgo.toISOString()}`
        ))
        .get();

      const errorRate = totalRequests?.count
        ? ((errorRequests?.count ?? 0) / totalRequests.count) * 100
        : 0;
      this.record('error_rate_percent', errorRate);

      const failedLogins = await db.select({ count: count() })
        .from(activityLogs)
        .where(and(
          eq(activityLogs.action, 'auth.login_failed'),
          sql`${activityLogs.createdAt} >= ${oneHourAgo.toISOString()}`
        ))
        .get();
      this.record('failed_logins_per_hour', failedLogins?.count ?? 0);
      
      const openAnomalies = await db.select({ count: count() })
        .from(anomalyEvents)
        .where(eq(anomalyEvents.status, 'open'))
        .get();
      this.record('open_anomalies_count', openAnomalies?.count ?? 0);
      
      const openTickets = await db.select({ count: count() })
        .from(tickets)
        .where(and(
            inArray(tickets.status, ['open', 'in_progress']),
            isNull(tickets.deletedAt)
        ))
        .get();
      this.record('open_tickets_count', openTickets?.count ?? 0);
      
    } catch (e) {
      console.error("[MetricsService] Failed to capture health snapshot", e);
    }
  }
}

export const metricsService = new MetricsService();

setInterval(() => metricsService.captureHealthSnapshot(), 5 * 60 * 1000);
setInterval(() => metricsService.aggregateHourly(), 60 * 60 * 1000);
