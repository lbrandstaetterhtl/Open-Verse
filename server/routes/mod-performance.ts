import { Router } from "express";
import { isAuthenticated, hasPermission } from "../middleware/auth";
import { moderatorPerformanceService } from "../services/moderator-performance-service";
import { activityLogger } from "../services/activity-logger";

const router = Router();

// Admin permission for mod performance
const checkPerm = hasPermission("performance");

// GET /api/admin/performance/leaderboard
router.get("/leaderboard", isAuthenticated, checkPerm, async (req, res) => {
  try {
    const period = (req.query.period as 'today' | '7d' | '30d') || '7d';
    const sortBy = (req.query.sortBy as any) || 'score';
    const leaderboard = await moderatorPerformanceService.getModeratorLeaderboard(period, sortBy);
    res.json(leaderboard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/performance/team-overview
router.get("/team-overview", isAuthenticated, checkPerm, async (req, res) => {
  try {
    const overview = await moderatorPerformanceService.getTeamOverview();
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/performance/moderator/:id
router.get("/moderator/:id", isAuthenticated, checkPerm, async (req, res) => {
  try {
    const modId = parseInt(req.params.id);
    const period = (req.query.period as 'today' | '7d' | '30d') || '30d';
    const detail = await moderatorPerformanceService.getModeratorDetail(modId, period);
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/performance/snapshot
// Manuelles Trigger für Snapshots (z.B. nach Backfill)
router.post("/snapshot", isAuthenticated, checkPerm, async (req, res) => {
  try {
    const { date } = req.body;
    await moderatorPerformanceService.computeDailySnapshot(date);
    
    activityLogger.logFromRequest(req, {
      action: 'admin.bulk_action',
      category: 'admin',
      description: `Manueller Mod-Performance Snapshot für ${date || 'heute'} getriggert`,
      severity: 'info'
    }).catch(err => console.error('[ModPerf] Log failed:', err));

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
