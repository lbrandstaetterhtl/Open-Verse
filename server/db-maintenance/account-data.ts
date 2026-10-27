// Personal data of a deleted account. Call inside the transaction that deletes the user, BEFORE the users row
// is removed:
//
//   await db.transaction(async (tx) => {
//     ...
//     await purgeAccountData(tx, userId);
//     await tx.delete(users).where(eq(users.id, userId));
//   });
//
// What happens (PostgreSQL has no foreign keys here, so nothing cascades by itself):
// - activity_logs of the account: deleted, except staff actions (categories admin / moderation / users /
//   settings), which stay as audit trail but lose every personal field (user id, email, username, IP,
//   location, user agent, session, device). Log rows ABOUT the account (target) lose their label and the
//   old/new values (they may hold the old email or profile data).
// - anomaly_events of the account: deleted; those a ban refers to stay, without user id, evidence and
//   description (which contain IPs).
// - bans of the account: kept (moderation history), but account/shadow bans lose IP, IP range and device id,
//   which those ban types do not need. IP and device bans are left as they are (the address IS the ban).
// - reports filed by the account: deleted (as before).
// - verification tokens, sessions, saved posts, notification preferences, themes, creator analytics and
//   auto-punishment executions of the account: deleted.
import { sql, type SQL } from "drizzle-orm";
import { getSqlite } from "../db";

const STAFF_AUDIT_CATEGORIES = ["admin", "moderation", "users", "settings"];

export interface PurgeSummary {
  activityLogsDeleted: number;
  activityLogsAnonymised: number;
  anomalyEventsDeleted: number;
  bansScrubbed: number;
  reportsDeleted: number;
}

const isSqlite = () => process.env.USE_SQLITE === "true";

async function exec(tx: any, query: SQL): Promise<number> {
  const result = isSqlite() ? await tx.run(query) : await tx.execute(query);
  return Number(result?.rowCount ?? result?.changes ?? 0) || 0;
}

function sqliteTableExists(name: string): boolean {
  const s = getSqlite();
  return !!s?.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

export async function purgeAccountData(tx: any, userId: number): Promise<PurgeSummary> {
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("purgeAccountData: invalid user id");
  const id = userId;
  const idText = String(userId);
  const staff = sql.join(STAFF_AUDIT_CATEGORIES.map((c) => sql`${c}`), sql`, `);

  const activityLogsAnonymised = await exec(tx, sql`
    UPDATE activity_logs SET user_id = NULL, user_email = NULL, user_username = NULL, ip_address = NULL,
      ip_country = NULL, ip_city = NULL, user_agent = NULL, session_id = NULL, device_fingerprint = NULL,
      device_type = NULL, device_os = NULL, device_browser = NULL
    WHERE user_id = ${id} AND category IN (${staff})`);
  const activityLogsDeleted = await exec(tx, sql`DELETE FROM activity_logs WHERE user_id = ${id}`);
  await exec(tx, sql`
    UPDATE activity_logs SET target_label = NULL, old_value = NULL, new_value = NULL
    WHERE lower(target_type) = 'user' AND target_id = ${idText}`);

  await exec(tx, sql`
    UPDATE anomaly_events SET user_id = NULL, evidence = '{}', description = 'Removed: the account was deleted'
    WHERE user_id = ${id} AND EXISTS (SELECT 1 FROM bans b WHERE b.anomaly_id = anomaly_events.id)`);
  const anomalyEventsDeleted = await exec(tx, sql`DELETE FROM anomaly_events WHERE user_id = ${id}`);

  const bansScrubbed = await exec(tx, sql`
    UPDATE bans SET ip_address = NULL, ip_range = NULL, device_fingerprint = NULL
    WHERE user_id = ${id} AND ban_type IN ('account', 'shadow')
      AND (ip_address IS NOT NULL OR ip_range IS NOT NULL OR device_fingerprint IS NOT NULL)`);

  const reportsDeleted = await exec(tx, sql`DELETE FROM reports WHERE reporter_id = ${id}`);

  for (const table of ["verification_tokens", "saved_posts", "notification_preferences", "themes", "creator_analytics"]) {
    if (isSqlite() && !sqliteTableExists(table)) continue;
    await exec(tx, sql`DELETE FROM ${sql.identifier(table)} WHERE user_id = ${id}`);
  }
  await exec(tx, sql`UPDATE auto_punishment_executions SET user_id = NULL WHERE user_id = ${id}`);

  // Logged-in sessions of the account (connect-pg-simple stores the session as JSON text)
  if (!isSqlite()) {
    await exec(tx, sql`DELETE FROM "session" WHERE sess LIKE ${`%"passport":{"user":${id}}%`} OR sess LIKE ${`%"passport":{"user":${id},%`}`);
  }

  return { activityLogsDeleted, activityLogsAnonymised, anomalyEventsDeleted, bansScrubbed, reportsDeleted };
}
