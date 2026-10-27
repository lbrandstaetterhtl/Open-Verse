// Data retention: a daily job deletes activity logs and anomaly events older than the retention period
// (admin setting security.data_retention_days, default 90, 0 = keep forever) and expired sessions and
// email verification tokens. Deletes in batches, so a large backlog never holds long locks or runs into the
// statement timeout; a run stops after MAX_BATCHES per table and continues on the next day.
import { sql } from "drizzle-orm";
import { db, getSqlite } from "../db";
import { logger } from "../logger";
import { SettingsService } from "../services/settings";

export const RETENTION_SETTING = { category: "security", key: "data_retention_days", defaultDays: 90 } as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 5_000;
const MAX_BATCHES = 200; // up to 1 million rows per table and run
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;

export interface RetentionSummary {
  retentionDays: number;
  activityLogs: number;
  anomalyEvents: number;
  sessions: number;
  verificationTokens: number;
}

export async function getRetentionDays(): Promise<number> {
  const raw = Number(await SettingsService.get(RETENTION_SETTING.category, RETENTION_SETTING.key, RETENTION_SETTING.defaultDays));
  if (!Number.isFinite(raw) || raw < 0) return RETENTION_SETTING.defaultDays;
  return Math.min(Math.floor(raw), 36_500);
}

const isSqlite = () => process.env.USE_SQLITE === "true";

function affected(result: any): number {
  return Number(result?.rowCount ?? result?.changes ?? 0) || 0;
}

async function deleteInBatches(statement: () => Promise<any>): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const n = affected(await statement());
    total += n;
    if (n < BATCH) break;
  }
  return total;
}

async function pgRetention(cutoffDate: Date, days: number): Promise<RetentionSummary> {
  // timestamp columns hold UTC (values are written as ISO strings, like drizzle does for these columns)
  const cutoff = cutoffDate.toISOString();
  const summary: RetentionSummary = { retentionDays: days, activityLogs: 0, anomalyEvents: 0, sessions: 0, verificationTokens: 0 };
  if (days > 0) {
    summary.activityLogs = await deleteInBatches(() => db.execute(sql`
      DELETE FROM "activity_logs" WHERE "id" IN (
        SELECT "id" FROM "activity_logs" WHERE "created_at" < ${cutoff} LIMIT ${BATCH})`));
    // Anomalies a ban refers to stay (the ban shows why it was issued)
    summary.anomalyEvents = await deleteInBatches(() => db.execute(sql`
      DELETE FROM "anomaly_events" WHERE "id" IN (
        SELECT a."id" FROM "anomaly_events" a WHERE a."created_at" < ${cutoff}
          AND NOT EXISTS (SELECT 1 FROM "bans" b WHERE b."anomaly_id" = a."id") LIMIT ${BATCH})`));
  }
  // connect-pg-simple writes "expire" with the database clock, so compare with it
  summary.sessions = affected(await db.execute(sql`DELETE FROM "session" WHERE "expire" < now()`));
  summary.verificationTokens = affected(await db.execute(sql`DELETE FROM "verification_tokens" WHERE "expires_at" < ${new Date().toISOString()}`));
  return summary;
}

// SQLite rows hold either unix seconds (column default) or ISO strings (values written by drizzle)
const SQLITE_EPOCH = (col: string) => `(CASE WHEN typeof(${col}) = 'integer' THEN ${col} ELSE CAST(strftime('%s', ${col}) AS INTEGER) END)`;

function sqliteRetention(cutoff: Date, days: number): RetentionSummary {
  const s = getSqlite();
  const summary: RetentionSummary = { retentionDays: days, activityLogs: 0, anomalyEvents: 0, sessions: 0, verificationTokens: 0 };
  if (!s) return summary;
  const cutoffSec = Math.floor(cutoff.getTime() / 1000);
  const nowSec = Math.floor(Date.now() / 1000);
  const batches = (stmt: any, ...args: unknown[]) => {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES; i++) {
      const n = stmt.run(...args).changes;
      total += n;
      if (n < BATCH) break;
    }
    return total;
  };
  if (days > 0) {
    summary.activityLogs = batches(s.prepare(`DELETE FROM activity_logs WHERE id IN (SELECT id FROM activity_logs WHERE ${SQLITE_EPOCH("created_at")} < ? LIMIT ${BATCH})`), cutoffSec);
    summary.anomalyEvents = batches(s.prepare(`DELETE FROM anomaly_events WHERE id IN (SELECT a.id FROM anomaly_events a WHERE ${SQLITE_EPOCH("a.created_at")} < ? AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.anomaly_id = a.id) LIMIT ${BATCH})`), cutoffSec);
  }
  summary.verificationTokens = s.prepare(`DELETE FROM verification_tokens WHERE ${SQLITE_EPOCH("expires_at")} < ?`).run(nowSec).changes;
  // Sessions: the SQLite session store clears expired sessions itself
  return summary;
}

/** One retention run. Exported for tests and admin tooling. */
export async function runDataRetention(now = new Date()): Promise<RetentionSummary> {
  const days = await getRetentionDays();
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const summary = isSqlite() ? sqliteRetention(cutoff, days) : await pgRetention(cutoff, days);
  const removed = summary.activityLogs + summary.anomalyEvents + summary.sessions + summary.verificationTokens;
  if (removed > 0) {
    logger.info("db", `Data retention (${days > 0 ? `${days} days` : "logs kept forever"}): removed ${summary.activityLogs} activity log(s), ${summary.anomalyEvents} anomaly event(s), ${summary.sessions} expired session(s), ${summary.verificationTokens} expired verification token(s)`, { ...summary });
  }
  return summary;
}

let timers: { first: NodeJS.Timeout; daily: NodeJS.Timeout } | null = null;

/** Starts the daily job (first run two minutes after startup). Idempotent; timers do not keep the process alive. */
export function startDataRetention(): void {
  if (timers || process.env.DATA_RETENTION_DISABLED === "true") return;
  const run = () => {
    runDataRetention().catch((err) => logger.error("db", "Data retention run failed", err));
  };
  timers = { first: setTimeout(run, FIRST_RUN_DELAY_MS), daily: setInterval(run, DAY_MS) };
  timers.first.unref?.();
  timers.daily.unref?.();
}

export function stopDataRetention(): void {
  if (!timers) return;
  clearTimeout(timers.first);
  clearInterval(timers.daily);
  timers = null;
}
