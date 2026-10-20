import { Router } from "express";
import { isAuthenticated, hasPermission } from "../middleware/auth";
import { moderatorPerformanceService } from "../services/moderator-performance-service";
import { activityLogger } from "../services/activity-logger";

import { sendInternalError } from "../utils/http-errors";
import { validateIdParams } from "../utils/params";
const router = Router();
validateIdParams(router, ["id"]);

const PERIODS = ["today", "7d", "30d"] as const;
const SORTS = ["score", "reports", "tickets", "response_time"] as const;
/** A whitelisted query value; anything else (unknown, array, object) falls back to the default. */
function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

// Admin permission for mod performance
const checkPerm = hasPermission("performance");

// GET /api/admin/performance/leaderboard
router.get("/leaderboard", isAuthenticated, checkPerm, async (req, res) => {
  try {
    const period = pick(req.query.period, PERIODS, '7d');
    const sortBy = pick(req.query.sortBy, SORTS, 'score');
    const leaderboard = await moderatorPerformanceService.getModeratorLeaderboard(period, sortBy);
    res.json(leaderboard);
  } catch (err: any) {
    sendInternalError(res, err, "mod-performance.ts request failed");
  }
});

// GET /api/admin/performance/team-overview
router.get("/team-overview", isAuthenticated, checkPerm, async (req, res) => {
  try {
    const overview = await moderatorPerformanceService.getTeamOverview();
    res.json(overview);
  } catch (err: any) {
    sendInternalError(res, err, "mod-performance.ts request failed");
  }
});

// GET /api/admin/performance/moderator/:id
router.get("/moderator/:id", isAuthenticated, checkPerm, async (req, res) => {
  try {
    const modId = Number(req.params.id);
    const period = pick(req.query.period, PERIODS, '30d');
    const detail = await moderatorPerformanceService.getModeratorDetail(modId, period);
    res.json(detail);
  } catch (err: any) {
    sendInternalError(res, err, "mod-performance.ts request failed");
  }
});

// POST /api/admin/performance/snapshot
// Manuelles Trigger für Snapshots (z.B. nach Backfill)
router.post("/snapshot", isAuthenticated, checkPerm, async (req, res) => {
  try {
    const raw = req.body && typeof req.body === "object" ? req.body.date : undefined;
    let date: string | undefined;
    if (raw !== undefined && raw !== null && raw !== "") {
      // yyyy-MM-dd of a real day between 2000 and tomorrow
      const ok = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(new Date(raw).getTime())
        && new Date(raw).toISOString().startsWith(raw) && raw >= "2000-01-01" && new Date(raw).getTime() <= Date.now() + 86400000;
      if (!ok) return res.status(400).json({ error: "Invalid date", code: "INVALID_DATE" });
      date = raw;
    }
    await moderatorPerformanceService.computeDailySnapshot(date);
    
    activityLogger.logFromRequest(req, {
      action: 'admin.bulk_action',
      category: 'admin',
      description: `Manueller Mod-Performance Snapshot für ${date || 'heute'} getriggert`,
      severity: 'info'
    }).catch(err => console.error('[ModPerf] Log failed:', err));

    res.json({ success: true });
  } catch (err: any) {
    sendInternalError(res, err, "mod-performance.ts request failed");
  }
});

export default router;
