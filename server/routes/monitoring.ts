import { Router } from "express";
import { db } from "../db";
import { activityLogs, anomalyEvents, systemMetrics, alertRules, alertHistory, users } from "@shared/schema";
import { count, eq, desc, and, gte, inArray, sql, or, like } from "drizzle-orm";
import { isOwner, isAdmin } from "../middleware/auth";

const router = Router();

// Only owners can access monitoring
router.use(isAdmin); // base admin check
router.use(isOwner);

// GET /api/admin/activity-logs
router.get("/activity-logs", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (req.query.category) conditions.push(eq(activityLogs.category, String(req.query.category)));
    if (req.query.severity) conditions.push(eq(activityLogs.severity, String(req.query.severity)));
    if (req.query.status) conditions.push(eq(activityLogs.status, String(req.query.status)));
    if (req.query.action) conditions.push(eq(activityLogs.action, String(req.query.action)));
    
    if (req.query.userId) {
       conditions.push(eq(activityLogs.userId, parseInt(req.query.userId as string)));
    }
    if (req.query.search) {
       const term = `%${req.query.search}%`;
       conditions.push(or(
           like(activityLogs.description, term),
           like(activityLogs.action, term),
           like(activityLogs.targetLabel, term)
       ));
    }
    
    const baseQuery = db.select({
      log: activityLogs,
      user: {
        id: users.id,
        username: users.username,
        email: users.email
      }
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id));

    const finalQuery = conditions.length > 0 
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const items = await finalQuery
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit)
      .offset(offset)
      .execute();

    const countQuery = db.select({ total: count() }).from(activityLogs);
    const totalResult = conditions.length > 0 
      ? await countQuery.where(and(...conditions)).get()
      : await countQuery.get();

    res.json({ logs: items, total: totalResult?.total ?? 0, page });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/anomalies
router.get("/anomalies", async (req, res) => {
  try {
    const status = req.query.status as string;
    const conditions = [];
    if (status) conditions.push(eq(anomalyEvents.status, status));

    const items = await db.select({
        anomaly: anomalyEvents,
        user: { username: users.username }
      })
      .from(anomalyEvents)
      .leftJoin(users, eq(anomalyEvents.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(anomalyEvents.createdAt))
      .limit(100)
      .execute();

    res.json({ anomalies: items });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/monitoring/metrics/overview
router.get("/metrics/overview", async (req, res) => {
  try {
    const now = Date.now();
    const twentyFourHoursAgo = new Date(now - 86400000);
    const oneHourAgo = new Date(now - 3600000);
    
    const eventsToday = await db.select({ count: count() })
      .from(activityLogs)
      .where(sql`${activityLogs.createdAt} >= ${twentyFourHoursAgo.toISOString()}`).get();

    const openAnomalies = await db.select({ count: count() })
      .from(anomalyEvents)
      .where(eq(anomalyEvents.status, 'open')).get();
      
    const criticalAnomalies = await db.select({ count: count() })
      .from(anomalyEvents)
      .where(and(eq(anomalyEvents.status, 'open'), eq(anomalyEvents.severity, 'critical'))).get();

    const totalHourRequests = await db.select({ count: count() })
      .from(activityLogs)
      .where(sql`${activityLogs.createdAt} >= ${oneHourAgo.toISOString()}`).get();
      
    const errorHourRequests = await db.select({ count: count() })
      .from(activityLogs)
      .where(and(
         inArray(activityLogs.severity, ['error', 'critical']),
         sql`${activityLogs.createdAt} >= ${oneHourAgo.toISOString()}`
      )).get();
      
    const errorRate = totalHourRequests?.count ? 
      ((errorHourRequests?.count ?? 0) / totalHourRequests.count) * 100 : 0;
      
    const activeUsersNow = await db.select({ count: count(sql`DISTINCT user_id`) })
      .from(activityLogs)
      .where(sql`${activityLogs.createdAt} >= ${new Date(now - 300000).toISOString()}`).get();

    res.json({
      events_today: eventsToday?.count ?? 0,
      open_anomalies: openAnomalies?.count ?? 0,
      anomalies_critical: criticalAnomalies?.count ?? 0,
      error_rate_last_hour: errorRate,
      active_users_now: activeUsersNow?.count ?? 0
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/monitoring/metrics/chart-data
router.get("/metrics/chart-data", async (req, res) => {
  try {
    // Generate mock data for the charts for now, or group by hours using sqlite if possible
    // To be safe across DBs, we assemble recent logs and bucket them in JS.
    const now = Date.now();
    const twentyFourHoursAgo = new Date(now - 86400000);
    
    const recentLogs = await db.select({
      severity: activityLogs.severity,
      createdAt: activityLogs.createdAt,
      category: activityLogs.category
    })
    .from(activityLogs)
    .where(sql`${activityLogs.createdAt} >= ${twentyFourHoursAgo.toISOString()}`)
    .execute();

    // 1. Events over time (24h) in 3h buckets
    const bucketCount = 8;
    const bucketMs = 86400000 / bucketCount;
    const timeDataMap = new Map();
    
    for (let i = 0; i < bucketCount; i++) {
        const bucketStart = now - (bucketCount - i) * bucketMs;
        const d = new Date(bucketStart);
        const name = `${d.getHours().toString().padStart(2, '0')}:00`;
        timeDataMap.set(i, { name, info: 0, warning: 0, error: 0 });
    }
    
    const categoryMap = new Map();

    recentLogs.forEach(log => {
        // Time buckets
        const logTime = log.createdAt instanceof Date ? log.createdAt.getTime() : new Date(log.createdAt).getTime();
        const diffMs = logTime - twentyFourHoursAgo.getTime();
        if (diffMs >= 0) {
            const bucketIdx = Math.min(Math.floor(diffMs / bucketMs), bucketCount - 1);
            if (timeDataMap.has(bucketIdx)) {
                const b = timeDataMap.get(bucketIdx);
                const sev = (log.severity || 'info') as keyof typeof b;
                if (sev === 'info' || sev === 'warning' || sev === 'error' || sev === 'critical') {
                    const safeSev = sev === 'critical' ? 'error' : sev;
                    b[safeSev] = (b[safeSev] || 0) + 1;
                }
            }
        }
        
        // Error categories
        if (log.severity === 'error' || log.severity === 'critical') {
            const cat = log.category || 'unknown';
            categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
        }
    });

    const timeData = Array.from(timeDataMap.values());
    
    const categoryDataTotal = Array.from(categoryMap.values()).reduce((sum, val) => sum + val, 0);
    const categoryData: any[] = [];
    categoryMap.forEach((value, name) => {
        if (value > 0) {
            categoryData.push({ name, value });
        }
    });
    
    // Fallback if no errors 
    if (categoryData.length === 0) {
        categoryData.push({ name: 'None', value: 1 });
    }

    res.json({ timeData, categoryData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
