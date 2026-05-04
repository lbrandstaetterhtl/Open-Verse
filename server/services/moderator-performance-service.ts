import { db } from '../db';
import { sql, eq, gte, lte, and, or, desc, count, avg, sum } from 'drizzle-orm';
import { 
  users, 
  reports, 
  tickets, 
  ticketComments, 
  activityLogs, 
  moderatorPerformanceSnapshots 
} from '@shared/schema';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';

export interface ModeratorLeaderboardEntry {
  moderatorId: number;
  moderatorUsername: string;
  moderatorRole: string;
  avatarUrl: string | null;
  totalScore: number;
  totalReportsHandled: number;
  totalReportsResolved: number;
  totalTicketsResolved: number;
  totalTicketsCommented: number;
  avgReportResolutionS: number;
  avgTicketResponseS: number;
  avgTicketResolutionS: number;
  totalAdminActions: number;
  totalUserBans: number;
}

export interface TeamOverview {
  reportsHandledToday: number;
  ticketsResolvedToday: number;
  adminActionsToday: number;
  reportsTrend: string;
  ticketsTrend: string;
  openReports: number;
  openTickets: number;
  avgTicketResponseSeconds: number;
  avgTicketResolutionSeconds: number;
  reportsHandled7d: number;
  ticketsResolved7d: number;
}

export interface ModeratorDetail {
  reportsHandled: number;
  reportsResolved: number;
  ticketsResolved: number;
  ticketsCommented: number;
  adminActions: number;
  userBans: number;
  score: number;
  avgResponseMins: number;
  avgResolutionHours: number;
  timeline: Array<{
    date: string;
    reportsHandled: number;
    ticketsResolved: number;
    score: number;
    responseTimeMins: number;
  }>;
}

class ModeratorPerformanceService {

  // ════════════════════════════════════════════
  // TÄGLICHER SNAPSHOT
  // ════════════════════════════════════════════
  async computeDailySnapshot(dateStr: string = this.getTodayStr()): Promise<void> {
    console.log(`[ModPerf] Computing snapshot for ${dateStr}...`);

    const date = new Date(dateStr);
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    // Alle Admins und Owner holen
    const moderators = await db.select({
      id:       users.id,
      username: users.username,
      role:     users.role,
    })
      .from(users)
      .where(sql`role IN ('admin', 'owner')`);

    for (const mod of moderators) {
      await this.computeModeratorSnapshot(mod, dateStr, dayStart, dayEnd);
    }

    console.log(`[ModPerf] Snapshot for ${dateStr} completed (${moderators.length} moderators)`);
  }

  private async computeModeratorSnapshot(
    mod: { id: number; username: string; role: string },
    dateStr: string,
    dayStart: Date,
    dayEnd: Date
  ): Promise<void> {

    // SQLite normalisierte Zeitstempel-Abfrage (wie im AnalyticsService)
    const timestampCondition = (column: any, start: Date, end: Date) => {
      if (process.env.USE_SQLITE === "true") {
        const s = start.toISOString().replace('T', ' ').slice(0, 19);
        const e = end.toISOString().replace('T', ' ').slice(0, 19);
        return sql`(
          CASE 
            WHEN typeof(${column}) = 'integer' THEN datetime(${column}, 'unixepoch')
            ELSE datetime(${column})
          END
        ) BETWEEN ${s} AND ${e}`;
      }
      return and(gte(column, start), lte(column, end));
    };

    // ── Report-Metriken ────────────────────────────────────
    const reportsHandled = await db.select({
      status: reports.status,
      count: count(),
      avgResolution: avg(reports.resolutionTimeSeconds),
    })
      .from(reports)
      .where(and(
        eq(reports.resolvedBy, mod.id),
        timestampCondition(reports.resolvedAt, dayStart, dayEnd)
      ))
      .groupBy(reports.status);

    const reportsResolved  = reportsHandled.find(r => r.status === 'resolved')?.count ?? 0;
    const reportsDismissed = reportsHandled.find(r => r.status === 'rejected')?.count ?? 0;
    const reportsTotal     = reportsHandled.reduce((sum, r) => sum + r.count, 0);
    const avgReportRes     = reportsHandled.reduce((sum, r) =>
      sum + (Number(r.avgResolution ?? 0) * r.count), 0
    ) / Math.max(reportsTotal, 1);

    // ── Ticket-Metriken ────────────────────────────────────

    // Tickets die dieser Mod resolved/closed hat
      const [ticketsResolvedCount] = await db.select({ count: count() })
        .from(tickets)
        .where(and(
          eq(tickets.assignedTo, mod.id),
          sql`status IN ('resolved', 'closed')`,
          timestampCondition(tickets.updatedAt, dayStart, dayEnd)
        ));

    // Kommentare von diesem Mod auf Tickets heute
      const [ticketCommentsCount] = await db.select({ count: count() })
        .from(ticketComments)
        .where(and(
          eq(ticketComments.authorId, mod.id),
          eq(ticketComments.isSystem, 0),
          timestampCondition(ticketComments.createdAt, dayStart, dayEnd)
        ));

    // Ø Antwortzeit
      const [avgResponseTime] = await db.select({
        avg: avg(tickets.responseTimeSeconds),
      })
        .from(tickets)
        .where(and(
          eq(tickets.assignedTo, mod.id),
          sql`response_time_seconds IS NOT NULL`,
          timestampCondition(tickets.firstResponseAt, dayStart, dayEnd)
        ));

    // Ø Lösungszeit
      const [avgResolutionTime] = await db.select({
        avg: avg(tickets.resolutionTimeSeconds),
      })
        .from(tickets)
        .where(and(
          eq(tickets.assignedTo, mod.id),
          sql`resolution_time_seconds IS NOT NULL`,
          or(
            timestampCondition(tickets.resolvedAt, dayStart, dayEnd),
            timestampCondition(tickets.closedAt, dayStart, dayEnd)
          )
        ));

    // ── Admin-Aktionen aus Activity Logs ───────────────────
    const adminActions = await db.select({
      action: activityLogs.action,
      count: count(),
    })
      .from(activityLogs)
        .where(and(
          eq(activityLogs.userId, mod.id),
          eq(activityLogs.category, 'admin'),
          timestampCondition(activityLogs.createdAt, dayStart, dayEnd)
        ))
        .groupBy(activityLogs.action);

    const totalAdminActions = adminActions.reduce((s, a) => s + a.count, 0);
    const userBans    = adminActions.find(a => a.action === 'admin.user_ban')?.count ?? 0;
    const userUnbans  = adminActions.find(a => a.action === 'admin.user_unban')?.count ?? 0;
    const contentRem  = adminActions.find(a => a.action === 'admin.content_remove')?.count ?? 0;

    // ── Performance Score ──────────────────────────────────
    const responseBonus = (avgResponseTime?.avg ?? 99999) < 7200 ? 10 : 0;
    const performanceScore =
      reportsResolved * 3 +
      reportsDismissed * 1 +
      (ticketsResolvedCount?.count ?? 0) * 5 +
      (ticketCommentsCount?.count ?? 0) * 1 +
      responseBonus;

    // ── Snapshot speichern ─────────────────────────────────
    const snapshot = {
      moderatorId:           mod.id,
      moderatorUsername:     mod.username,
      moderatorRole:         mod.role,
      snapshotDate:          dateStr,
      period:                'day',
      reportsResolved:       reportsResolved,
      reportsDismissed:      reportsDismissed,
      reportsTotalHandled:   reportsTotal,
      avgReportResolutionS:  Math.round(avgReportRes) || 0,
      ticketsResolved:       ticketsResolvedCount?.count ?? 0,
      ticketsCommented:      ticketCommentsCount?.count ?? 0,
      avgTicketResponseS:    Math.round(Number(avgResponseTime?.avg ?? 0)) || 0,
      avgTicketResolutionS:  Math.round(Number(avgResolutionTime?.avg ?? 0)) || 0,
      totalAdminActions,
      userBans,
      userUnbans,
      contentRemovals:       contentRem,
      performanceScore:      performanceScore || 0,
      createdAt:             Math.floor(Date.now() / 1000)
    };

    try {
      await db.insert(moderatorPerformanceSnapshots)
        .values(snapshot)
        .onConflictDoUpdate({
          target: [
            moderatorPerformanceSnapshots.moderatorId,
            moderatorPerformanceSnapshots.snapshotDate,
            moderatorPerformanceSnapshots.period,
          ],
          set: snapshot
        });
    } catch (dbErr: any) {
      console.error(`[ModPerf] Database error for ${mod.username}:`, dbErr);
    }
  }

  // ════════════════════════════════════════════
  // QUERY-METHODEN FÜR DASHBOARD
  // ════════════════════════════════════════════

  async getModeratorLeaderboard(
    period: 'today' | '7d' | '30d' = '7d',
    sortBy: 'score' | 'reports' | 'tickets' | 'response_time' = 'score'
  ): Promise<ModeratorLeaderboardEntry[]> {

    const days = period === 'today' ? 1 : period === '7d' ? 7 : 30;
    const startDate = format(subDays(new Date(), days - 1), 'yyyy-MM-dd');

    const orderCol = {
      score:         sql`SUM(${moderatorPerformanceSnapshots.performanceScore}) DESC`,
      reports:       sql`SUM(${moderatorPerformanceSnapshots.reportsTotalHandled}) DESC`,
      tickets:       sql`SUM(${moderatorPerformanceSnapshots.ticketsResolved}) DESC`,
      response_time: sql`AVG(${moderatorPerformanceSnapshots.avgTicketResponseS}) ASC`, 
    }[sortBy];

    return await db.select({
      moderatorId:          moderatorPerformanceSnapshots.moderatorId,
      moderatorUsername:    moderatorPerformanceSnapshots.moderatorUsername,
      moderatorRole:        moderatorPerformanceSnapshots.moderatorRole,
      avatarUrl:            users.bio, // Using bio as proxy or actual avatarUrl if exists (check schema later)
      totalScore:           sum(moderatorPerformanceSnapshots.performanceScore),
      totalReportsHandled:  sum(moderatorPerformanceSnapshots.reportsTotalHandled),
      totalReportsResolved: sum(moderatorPerformanceSnapshots.reportsResolved),
      totalTicketsResolved: sum(moderatorPerformanceSnapshots.ticketsResolved),
      totalTicketsCommented:sum(moderatorPerformanceSnapshots.ticketsCommented),
      avgReportResolutionS: avg(moderatorPerformanceSnapshots.avgReportResolutionS),
      avgTicketResponseS:   avg(moderatorPerformanceSnapshots.avgTicketResponseS),
      avgTicketResolutionS: avg(moderatorPerformanceSnapshots.avgTicketResolutionS),
      totalAdminActions:    sum(moderatorPerformanceSnapshots.totalAdminActions),
      totalUserBans:        sum(moderatorPerformanceSnapshots.userBans),
    })
      .from(moderatorPerformanceSnapshots)
      .leftJoin(users, eq(users.id, moderatorPerformanceSnapshots.moderatorId))
      .where(gte(moderatorPerformanceSnapshots.snapshotDate, startDate))
      .groupBy(moderatorPerformanceSnapshots.moderatorId)
      .orderBy(sql`${orderCol}`) as any;
  }

  async getTeamOverview(): Promise<TeamOverview> {
    const today = this.getTodayStr();
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');

    const [todayStats, yesterdayStats, weekStats] = await Promise.all([
      this.getTeamStatsForDate(today),
      this.getTeamStatsForDate(yesterday),
      this.getTeamStatsForDateRange(sevenDaysAgo, today),
    ]);

    const [openReports] = await db.select({ count: count() })
      .from(reports)
      .where(eq(reports.status, 'pending'));

    const [openTickets] = await db.select({ count: count() })
      .from(tickets)
      .where(sql`status IN ('open', 'in_progress', 'on_hold')`);

    const [globalAvgResponse] = await db.select({
      avg: avg(tickets.responseTimeSeconds),
    })
      .from(tickets)
      .where(sql`response_time_seconds IS NOT NULL`);

    const [globalAvgResolution] = await db.select({
      avg: avg(tickets.resolutionTimeSeconds),
    })
      .from(tickets)
      .where(sql`resolution_time_seconds IS NOT NULL`);

    const calcTrend = (current: number, previous: number) =>
      previous > 0 ? (((current - previous) / previous) * 100).toFixed(1) : '0';

    return {
      reportsHandledToday:     todayStats.reportsHandled,
      ticketsResolvedToday:    todayStats.ticketsResolved,
      adminActionsToday:       todayStats.adminActions,
      reportsTrend: calcTrend(todayStats.reportsHandled, yesterdayStats.reportsHandled),
      ticketsTrend: calcTrend(todayStats.ticketsResolved, yesterdayStats.ticketsResolved),
      openReports:   openReports?.count ?? 0,
      openTickets:   openTickets?.count ?? 0,
      avgTicketResponseSeconds:   Math.round(Number(globalAvgResponse?.avg ?? 0)),
      avgTicketResolutionSeconds: Math.round(Number(globalAvgResolution?.avg ?? 0)),
      reportsHandled7d:  weekStats.reportsHandled,
      ticketsResolved7d: weekStats.ticketsResolved,
    };
  }

  private async getTeamStatsForDate(date: string) {
    const result = await db.select({
      reportsHandled: sum(moderatorPerformanceSnapshots.reportsTotalHandled),
      ticketsResolved: sum(moderatorPerformanceSnapshots.ticketsResolved),
      adminActions: sum(moderatorPerformanceSnapshots.totalAdminActions),
    })
      .from(moderatorPerformanceSnapshots)
      .where(and(
        eq(moderatorPerformanceSnapshots.snapshotDate, date),
        eq(moderatorPerformanceSnapshots.period, 'day')
      ));

    return {
      reportsHandled:  Number(result?.reportsHandled ?? 0),
      ticketsResolved: Number(result?.ticketsResolved ?? 0),
      adminActions:    Number(result?.adminActions ?? 0),
    };
  }

  private async getTeamStatsForDateRange(startDate: string, endDate: string) {
    const result = await db.select({
      reportsHandled:  sum(moderatorPerformanceSnapshots.reportsTotalHandled),
      ticketsResolved: sum(moderatorPerformanceSnapshots.ticketsResolved),
    })
      .from(moderatorPerformanceSnapshots)
      .where(and(
        gte(moderatorPerformanceSnapshots.snapshotDate, startDate),
        lte(moderatorPerformanceSnapshots.snapshotDate, endDate),
        eq(moderatorPerformanceSnapshots.period, 'day')
      ));

    return {
      reportsHandled:  Number(result?.reportsHandled ?? 0),
      ticketsResolved: Number(result?.ticketsResolved ?? 0),
    };
  }

  async getModeratorDetail(
    moderatorId: number,
    period: 'today' | '7d' | '30d' = '30d'
  ): Promise<ModeratorDetail> {

    const days = period === 'today' ? 1 : period === '7d' ? 7 : 30;
    const startDate = format(subDays(new Date(), days - 1), 'yyyy-MM-dd');

    const snapshots = await db.select()
      .from(moderatorPerformanceSnapshots)
      .where(and(
        eq(moderatorPerformanceSnapshots.moderatorId, moderatorId),
        gte(moderatorPerformanceSnapshots.snapshotDate, startDate),
        eq(moderatorPerformanceSnapshots.period, 'day')
      ))
      .orderBy(moderatorPerformanceSnapshots.snapshotDate);

    const timeline = snapshots.map(s => ({
      date:             s.snapshotDate,
      reportsHandled:   s.reportsTotalHandled,
      ticketsResolved:  s.ticketsResolved,
      score:            s.performanceScore,
      responseTimeMins: Math.round((s.avgTicketResponseS ?? 0) / 60),
    }));

    const totals = snapshots.reduce((acc, s) => ({
      reportsHandled:   acc.reportsHandled + s.reportsTotalHandled,
      reportsResolved:  acc.reportsResolved + s.reportsResolved,
      ticketsResolved:  acc.ticketsResolved + s.ticketsResolved,
      ticketsCommented: acc.ticketsCommented + s.ticketsCommented,
      adminActions:     acc.adminActions + s.totalAdminActions,
      userBans:         acc.userBans + s.userBans,
      score:            acc.score + s.performanceScore,
    }), {
      reportsHandled: 0, reportsResolved: 0, ticketsResolved: 0,
      ticketsCommented: 0, adminActions: 0, userBans: 0, score: 0,
    });

    const avgResponseMins = snapshots.length > 0
      ? Math.round(snapshots.reduce((s, snap) => s + (snap.avgTicketResponseS ?? 0), 0) / snapshots.length / 60)
      : 0;

    const avgResolutionHours = snapshots.length > 0
      ? Math.round(snapshots.reduce((s, snap) => s + (snap.avgTicketResolutionS ?? 0), 0) / snapshots.length / 3600)
      : 0;

    return { ...totals, timeline, avgResponseMins, avgResolutionHours };
  }

  private getTodayStr = () => format(new Date(), 'yyyy-MM-dd');
}

export const moderatorPerformanceService = new ModeratorPerformanceService();
