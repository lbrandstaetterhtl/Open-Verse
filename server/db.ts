import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { Pool, neonConfig } from "@neondatabase/serverless";
import Database from "better-sqlite3";
import ws from "ws";
import * as schema from "@shared/schema";
import path from "path";
import fs from "fs";

console.log("DEBUG: process.env.USE_SQLITE =", process.env.USE_SQLITE);

const useSqlite = process.env.USE_SQLITE === "true";
console.log("DEBUG: useSqlite =", useSqlite);

let pool: Pool | null = null;
let db: any;
let sqlite: any = null;

if (useSqlite) {
  console.log("Using SQLite database for local development");
  // VPS-HOSTING-OPTIMIZATION [PERSISTENCE]: Use absolute path or configurable path from environment
  // Priority: SQLITE_PATH > DATABASE_URL (if starts with sqlite:) > Default local.db
  let dbPath = process.env.SQLITE_PATH;
  
  if (!dbPath && process.env.DATABASE_URL?.startsWith("sqlite:")) {
    dbPath = process.env.DATABASE_URL.replace("sqlite:", "");
  }
  
  if (!dbPath) {
    dbPath = path.join(process.cwd(), "local.db");
  } else if (!path.isAbsolute(dbPath)) {
    dbPath = path.resolve(process.cwd(), dbPath);
  }

  console.log("DEBUG: SQLite DB Path:", dbPath);

  sqlite = new Database(dbPath);

  /* PERF-FIX [OPT-001]: SQLite PRAGMA Optimizations (WAL-mode, Cache, Optimize) */
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('temp_store = MEMORY');
  sqlite.pragma('cache_size = -64000');
  sqlite.pragma('optimize');

  // Register 'now' function for compatibility with defaultNow()
  sqlite.function("now", () => new Date().toISOString());

  db = drizzleSqlite(sqlite, { schema });

  // Auto-initialize tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      karma INTEGER NOT NULL DEFAULT 0,
      email_verified INTEGER NOT NULL DEFAULT 0,
      is_admin INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL DEFAULT 'user',
      verified INTEGER NOT NULL DEFAULT 0,
      profile_picture_url TEXT,
      bio TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      karma INTEGER NOT NULL DEFAULT 0,
      media_url TEXT,
      media_type TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      karma INTEGER NOT NULL DEFAULT 5,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reason TEXT NOT NULL,
      reporter_id INTEGER NOT NULL,
      post_id INTEGER,
      comment_id INTEGER,
      discussion_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS followers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id INTEGER NOT NULL,
      following_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      actor_id INTEGER,
      type TEXT NOT NULL,
      post_id INTEGER,
      comment_id INTEGER,
      community_id INTEGER,
      title TEXT,
      message TEXT,
      preview TEXT,
      action_url TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      seen INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      group_key TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS post_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      is_like INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_post_likes_user_post ON post_likes(user_id, post_id);
    CREATE TABLE IF NOT EXISTS comment_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      comment_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS communities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      image_url TEXT,
      creator_id INTEGER NOT NULL,
      allowed_categories TEXT NOT NULL DEFAULT 'news,entertainment,discussion',
      is_private INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS community_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      community_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS community_bans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      community_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      reason TEXT,
      banned_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS community_join_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      community_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
    
    -- PHASE 2: NEW ACTIVITY_LOGS
    CREATE TABLE IF NOT EXISTS activity_logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_email      TEXT,
      user_role       TEXT,
      user_username   TEXT,
      action          TEXT NOT NULL,
      category        TEXT NOT NULL,
      subcategory     TEXT,
      target_type     TEXT,
      target_id       TEXT,
      target_label    TEXT,
      description     TEXT NOT NULL,
      metadata        TEXT DEFAULT '{}',
      old_value       TEXT,
      new_value       TEXT,
      ip_address      TEXT,
      ip_country      TEXT,
      ip_city         TEXT,
      user_agent      TEXT,
      device_type     TEXT,
      device_os       TEXT,
      device_browser  TEXT,
      session_id      TEXT,
      status          TEXT NOT NULL DEFAULT 'success',
      severity        TEXT NOT NULL DEFAULT 'info',
      is_anomaly      INTEGER DEFAULT 0,
      anomaly_type    TEXT,
      anomaly_score   REAL,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      CHECK (status IN ('success','failure','warning','blocked')),
      CHECK (severity IN ('debug','info','warning','error','critical')),
      CHECK (category IN ('auth','content','social','admin','system','security','moderation'))
    );
    CREATE INDEX IF NOT EXISTS idx_al_user_id        ON activity_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_al_action         ON activity_logs(action);
    CREATE INDEX IF NOT EXISTS idx_al_category       ON activity_logs(category);
    CREATE INDEX IF NOT EXISTS idx_al_created_at     ON activity_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_al_severity       ON activity_logs(severity);
    CREATE INDEX IF NOT EXISTS idx_al_status         ON activity_logs(status);
    CREATE INDEX IF NOT EXISTS idx_al_ip_address     ON activity_logs(ip_address);
    CREATE INDEX IF NOT EXISTS idx_al_session_id     ON activity_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_al_target         ON activity_logs(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_al_user_action    ON activity_logs(user_id, action, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_al_user_time      ON activity_logs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_al_cat_time       ON activity_logs(category, created_at DESC);

    -- PHASE 2: ANOMALY EVENTS
    CREATE TABLE IF NOT EXISTS anomaly_events (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      anomaly_type    TEXT NOT NULL,
      severity        TEXT NOT NULL DEFAULT 'warning',
      title           TEXT NOT NULL,
      description     TEXT NOT NULL,
      evidence        TEXT DEFAULT '{}',
      trigger_value   REAL,
      threshold_value REAL,
      status          TEXT DEFAULT 'open',
      resolved_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at     INTEGER,
      resolution_note TEXT,
      auto_action     TEXT,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      CHECK (severity IN ('info','warning','high','critical')),
      CHECK (status IN ('open','investigating','resolved','false_positive'))
    );
    CREATE INDEX IF NOT EXISTS idx_anomaly_user_id   ON anomaly_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_anomaly_type      ON anomaly_events(anomaly_type);
    CREATE INDEX IF NOT EXISTS idx_anomaly_severity  ON anomaly_events(severity);
    CREATE INDEX IF NOT EXISTS idx_anomaly_status    ON anomaly_events(status);
    CREATE INDEX IF NOT EXISTS idx_anomaly_created   ON anomaly_events(created_at DESC);

    -- PHASE 2: SYSTEM METRICS
    CREATE TABLE IF NOT EXISTS system_metrics (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_name     TEXT NOT NULL,
      metric_value    REAL NOT NULL,
      metric_unit     TEXT,
      dimensions      TEXT DEFAULT '{}',
      period_start    INTEGER NOT NULL,
      period_end      INTEGER NOT NULL,
      granularity     TEXT DEFAULT 'minute',
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_metrics_name_time ON system_metrics(metric_name, period_start DESC);
    CREATE INDEX IF NOT EXISTS idx_metrics_granularity ON system_metrics(granularity, period_start DESC);

    -- PHASE 2: ALERTS
    CREATE TABLE IF NOT EXISTS alert_rules (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      description     TEXT,
      metric          TEXT NOT NULL,
      condition       TEXT NOT NULL,
      threshold       REAL NOT NULL,
      window_seconds  INTEGER DEFAULT 300,
      severity        TEXT NOT NULL DEFAULT 'warning',
      is_active       INTEGER DEFAULT 1,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS alert_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id         INTEGER REFERENCES alert_rules(id),
      rule_name       TEXT NOT NULL,
      severity        TEXT NOT NULL,
      title           TEXT NOT NULL,
      description     TEXT NOT NULL,
      metric_value    REAL,
      threshold_value REAL,
      status          TEXT DEFAULT 'firing',
      acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      acknowledged_at INTEGER,
      resolved_at     INTEGER,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      CHECK (status IN ('firing','resolved','acknowledged'))
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_severity   ON alert_history(severity);
    CREATE INDEX IF NOT EXISTS idx_alerts_status     ON alert_history(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_created    ON alert_history(created_at DESC);

  `);
  console.log("DEBUG: SQLite tables initialized");

  // Add community_id column to posts if it doesn't exist yet
  try {
    sqlite.exec(`ALTER TABLE posts ADD COLUMN community_id INTEGER`);
    console.log("DEBUG: Added community_id column to posts");
  } catch (e: any) {
    // Column already exists, ignore
  }

  // Add ip_address column to reports if it doesn't exist yet
  try {
    sqlite.exec(`ALTER TABLE reports ADD COLUMN ip_address TEXT`);
  } catch (e: any) {
    // Column already exists, ignore
  }
  // Add is_private column to communities if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE communities ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0`);
    console.log("DEBUG: Added is_private column to communities");
  } catch (e: any) {
    // Column already exists, ignore
  }

  // FEATURE-FIX [USER-SCHEMA]: Add missing profile columns for SQLite parity
  try {
    sqlite.exec(`ALTER TABLE users ADD COLUMN profile_picture_url TEXT`);
    sqlite.exec(`ALTER TABLE users ADD COLUMN bio TEXT`);
  } catch (e) {
    // Ignore duplicate column errors
  }

  // FEATURE-FIX [NOTIF-SCHEMA]: Add missing notification columns for SQLite parity
  const notifColumns = [
    { name: "actor_id", type: "INTEGER" },
    { name: "post_id", type: "INTEGER" },
    { name: "comment_id", type: "INTEGER" },
    { name: "community_id", type: "INTEGER" },
    { name: "title", type: "TEXT" },
    { name: "message", type: "TEXT" },
    { name: "preview", type: "TEXT" },
    { name: "action_url", type: "TEXT" },
    { name: "seen", type: "INTEGER NOT NULL DEFAULT 0" },
    { name: "archived", type: "INTEGER NOT NULL DEFAULT 0" },
    { name: "group_key", type: "TEXT" }
  ];

  for (const col of notifColumns) {
    try {
      sqlite.exec(`ALTER TABLE notifications ADD COLUMN ${col.name} ${col.type}`);
      console.log(`DEBUG: Added ${col.name} column to notifications`);
    } catch (e) {
      // Ignore "duplicate column" errors
    }
  }

  // Data migration: if from_user_id exists, copy it to actor_id
  try {
    sqlite.exec(`UPDATE notifications SET actor_id = from_user_id WHERE actor_id IS NULL AND from_user_id IS NOT NULL`);
  } catch (e) {
    // Ignore if from_user_id doesn't exist
  }
} else {
  console.log("Using Neon PostgreSQL database");
  neonConfig.webSocketConstructor = ws;

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }

  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzleNeon({ client: pool, schema });
}

export function getSqlite() {
  return sqlite;
}
export { pool, db };
