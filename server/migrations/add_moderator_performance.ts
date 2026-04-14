import { getSqlite } from "../db";

export async function addModeratorPerformanceSystem() {
  const sqlite = getSqlite();
  if (!sqlite) return;

  console.log("🎫 Erstelle Moderator Performance Tabellen...");

  // 1. Snapshot Tabelle
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS moderator_performance_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      moderator_id INTEGER NOT NULL,
      moderator_username TEXT NOT NULL,
      moderator_role TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      period TEXT NOT NULL DEFAULT 'day',
      reports_resolved INTEGER NOT NULL DEFAULT 0,
      reports_dismissed INTEGER NOT NULL DEFAULT 0,
      reports_total_handled INTEGER NOT NULL DEFAULT 0,
      avg_report_resolution_s INTEGER NOT NULL DEFAULT 0,
      tickets_resolved INTEGER NOT NULL DEFAULT 0,
      tickets_commented INTEGER NOT NULL DEFAULT 0,
      avg_ticket_response_s INTEGER NOT NULL DEFAULT 0,
      avg_ticket_resolution_s INTEGER NOT NULL DEFAULT 0,
      total_admin_actions INTEGER NOT NULL DEFAULT 0,
      user_bans INTEGER NOT NULL DEFAULT 0,
      user_unbans INTEGER NOT NULL DEFAULT 0,
      content_removals INTEGER NOT NULL DEFAULT 0,
      performance_score REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(moderator_id, snapshot_date, period)
    );
  `);

  // Indexe erstellen
  try { sqlite.exec("CREATE INDEX IF NOT EXISTS idx_mod_perf_date ON moderator_performance_snapshots(snapshot_date);"); } catch(e){}
  try { sqlite.exec("CREATE INDEX IF NOT EXISTS idx_mod_perf_score ON moderator_performance_snapshots(performance_score);"); } catch(e){}

  // 2. Bestehende Tabellen für Performance-Daten erweitern
  try { sqlite.exec("ALTER TABLE reports ADD COLUMN resolved_by INTEGER;"); } catch (e) {}
  try { sqlite.exec("ALTER TABLE reports ADD COLUMN resolved_at INTEGER;"); } catch (e) {}
  try { sqlite.exec("ALTER TABLE reports ADD COLUMN resolution_time_seconds INTEGER;"); } catch (e) {}

  try { sqlite.exec("ALTER TABLE tickets ADD COLUMN first_response_at INTEGER;"); } catch (e) {}
  try { sqlite.exec("ALTER TABLE tickets ADD COLUMN response_time_seconds INTEGER;"); } catch (e) {}
  try { sqlite.exec("ALTER TABLE tickets ADD COLUMN resolution_time_seconds INTEGER;"); } catch (e) {}

  console.log("✅ Moderator Performance Tabellen bereit");
}
