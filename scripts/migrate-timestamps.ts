import { db, getSqlite } from "../server/db";
import { activityLogs, anomalyEvents, bans } from "../shared/schema";
import { sql } from "drizzle-orm";

/**
 * APE-FIX [MIGRATION]: Timestamp Converter
 * Converts ISO String timestamps in SQLite to Unix Integers.
 */
async function migrate() {
  const sqlite = getSqlite();
  if (!sqlite) {
    console.log("Migration only necessary for SQLite. Postgres handles timestamp conversion automatically via Drizzle.");
    return;
  }

  const tables = ['activity_logs', 'anomaly_events', 'bans', 'auto_punishment_rules', 'auto_punishment_executions'];

  for (const table of tables) {
    console.log(`Checking table ${table}...`);
    try {
      // Find rows where created_at is a string (starts with '2')
      const rows = sqlite.prepare(`SELECT id, created_at FROM ${table} WHERE typeof(created_at) = 'text'`).all();
      console.log(`Found ${rows.length} string timestamps in ${table}.`);

      for (const row of rows) {
        const unix = Math.floor(new Date(row.created_at).getTime() / 1000);
        if (!isNaN(unix)) {
          sqlite.prepare(`UPDATE ${table} SET created_at = ? WHERE id = ?`).run(unix, row.id);
        }
      }
    } catch (e) {
      console.error(`Failed to migrate ${table}:`, e);
    }
  }
  
  console.log("Migration finished.");
}

migrate().then(() => process.exit(0));
