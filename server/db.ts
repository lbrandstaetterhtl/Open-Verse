import "dotenv/config";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import pg from "pg";
import Database from "better-sqlite3";
import ws from "ws";
import * as schema from "@shared/schema";
import path from "path";
import fs from "fs";
import { logger } from "./logger";
import { warnAboutWeakSecrets } from "./db-maintenance/secrets-check";


const useSqlite = process.env.USE_SQLITE === "true";
logger.info('db', "Initializing database connection", { useSqlite });
warnAboutWeakSecrets();

let pool: NeonPool | pg.Pool | null = null;
let db: any;
let sqlite: any = null;

/**
 * Which credentials the process uses (PostgreSQL only):
 * - "single":   DATABASE_URL for everything (default, unchanged behaviour).
 * - "split":    DB_APP_PASSWORD is set: migrations/DDL use DATABASE_URL (owner/superuser), all queries of the
 *               running app use the least-privilege role openverse_app (DML only), created by the migrations.
 * - "app-only": DB_APP_USER is set without DB_APP_PASSWORD (docker-compose with DB_APP_PASSWORD: the app
 *               container only gets the app role's credentials, the one-shot `migrate` service runs the DDL).
 *               The app performs no DDL at all.
 */
export type DbRoleMode = "single" | "split" | "app-only";
export const DEFAULT_APP_ROLE = "openverse_app";
const appPassword = process.env.DB_APP_PASSWORD?.trim() || undefined;
const appUserEnv = process.env.DB_APP_USER?.trim() || undefined;
export const appRoleName = appUserEnv || DEFAULT_APP_ROLE;
export const dbRoleMode: DbRoleMode = appPassword ? "split" : appUserEnv ? "app-only" : "single";
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(appRoleName)) {
  throw new Error("DB_APP_USER must be a lower-case PostgreSQL identifier (letters, digits, underscore)");
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Connection limits and server-side timeouts (0 disables a timeout). */
export const dbTimeouts = {
  statementTimeoutMs: intEnv("DB_STATEMENT_TIMEOUT_MS", 15_000),
  idleInTransactionTimeoutMs: intEnv("DB_IDLE_IN_TRANSACTION_TIMEOUT_MS", 30_000),
  connectionTimeoutMs: intEnv("DB_CONNECTION_TIMEOUT_MS", 10_000),
  poolMax: intEnv("DB_POOL_MAX", 10) || 10,
};

/** DATABASE_URL with other credentials (keeps host, port, database and parameters such as sslmode). */
function withCredentials(url: string, user: string, password?: string): string {
  const u = new URL(url);
  u.username = encodeURIComponent(user);
  if (password !== undefined) u.password = encodeURIComponent(password);
  return u.toString();
}

function poolOptions(connectionString: string, opts: { runtime: boolean }) {
  return {
    connectionString,
    max: opts.runtime ? dbTimeouts.poolMax : 2,
    connectionTimeoutMillis: dbTimeouts.connectionTimeoutMs,
    idleTimeoutMillis: opts.runtime ? 30_000 : 5_000,
    keepAlive: true,
    application_name: opts.runtime ? "open-verse" : "open-verse-migrate",
    // Migrations (index builds on big tables) must not be cut off by the runtime limits
    ...(opts.runtime && dbTimeouts.statementTimeoutMs ? { statement_timeout: dbTimeouts.statementTimeoutMs } : {}),
    ...(dbTimeouts.idleInTransactionTimeoutMs ? { idle_in_transaction_session_timeout: dbTimeouts.idleInTransactionTimeoutMs } : {}),
  };
}

/**
 * Without an 'error' listener, an idle pooled connection that the server closes (Postgres restart, failover,
 * pg_terminate_backend, idle-connection killer) is an uncaught exception. The pool drops that connection
 * and opens a new one on the next query, so logging is all that is needed.
 */
function attachPoolErrorHandler(p: NeonPool | pg.Pool, label: string) {
  let lastLog = 0;
  let suppressed = 0;
  (p as any).on("error", (err: unknown) => {
    const now = Date.now();
    if (now - lastLog < 5_000) { suppressed++; return; }
    logger.error('db', `Idle ${label} connection lost (the pool reconnects on the next query)${suppressed ? `; ${suppressed} similar message(s) suppressed` : ''}`, err);
    lastLog = now;
    suppressed = 0;
  });
}

function createPgPool(connectionString: string, opts: { runtime: boolean }): NeonPool | pg.Pool {
  const options = poolOptions(connectionString, opts);
  let p: NeonPool | pg.Pool;
  if (connectionString.includes("neon.tech")) {
    neonConfig.webSocketConstructor = ws;
    p = new NeonPool(options as any);
  } else {
    p = new pg.Pool(options);
  }
  attachPoolErrorHandler(p, opts.runtime ? "database" : "migration");
  return p;
}

function drizzleFor(p: NeonPool | pg.Pool) {
  return p instanceof pg.Pool ? drizzlePg(p, { schema }) : drizzleNeon({ client: p as NeonPool, schema });
}

if (useSqlite) {
  logger.info('db', "Using SQLite database for local development");
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

  logger.info('db', "SQLite DB Path", { path: dbPath });
  prepareSqliteFile(dbPath);

  sqlite = new Database(dbPath);
  restrictSqliteFiles(dbPath);

  /* PERF-FIX [OPT-001]: SQLite PRAGMA Optimizations (WAL-mode, Cache, Optimize) */
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('temp_store = MEMORY');
  sqlite.pragma('cache_size = -64000');
  sqlite.pragma('mmap_size = 268435456'); // 256MB memory mapping
  sqlite.pragma('busy_timeout = 5000');   // 5s busy timeout
  sqlite.pragma('optimize');

  // Register 'now' function for compatibility with defaultNow()
  sqlite.function("now", () => Math.floor(Date.now() / 1000));

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
      display_name TEXT,
      avatar_url TEXT,
      cover_url TEXT,
      location TEXT,
      website TEXT,
      is_private INTEGER NOT NULL DEFAULT 0,
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
      karma INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS saved_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_posts_user_post ON saved_posts(user_id, post_id);
    CREATE TABLE IF NOT EXISTS admin_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      permissions TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
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

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT NOT NULL UNIQUE,
      created_by INTEGER NOT NULL,
      assigned_to INTEGER,
      type TEXT,
      priority TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      related_user_id INTEGER,
      related_post_id INTEGER,
      related_url TEXT,
      tags TEXT,
      attachments TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      response_time_seconds INTEGER,
      resolution_time_seconds INTEGER,
      first_response_at INTEGER,
      resolved_at INTEGER,
      closed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      is_internal INTEGER NOT NULL DEFAULT 0,
      change_type TEXT,
      change_from TEXT,
      change_to TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      changed_by INTEGER NOT NULL,
      from_status TEXT,
      to_status TEXT,
      reason TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      community_post INTEGER NOT NULL DEFAULT 1,
      post_milestone INTEGER NOT NULL DEFAULT 1,
      system_announcement INTEGER NOT NULL DEFAULT 1,
      browser_notifications INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      colors TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS moderator_performance_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      moderator_id INTEGER NOT NULL,
      moderator_username TEXT NOT NULL,
      moderator_role TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      period TEXT NOT NULL DEFAULT 'day',
      reports_resolved INTEGER DEFAULT 0,
      reports_dismissed INTEGER DEFAULT 0,
      reports_total_handled INTEGER DEFAULT 0,
      avg_report_resolution_s INTEGER DEFAULT 0,
      tickets_resolved INTEGER DEFAULT 0,
      tickets_commented INTEGER DEFAULT 0,
      avg_ticket_response_s INTEGER DEFAULT 0,
      avg_ticket_resolution_s INTEGER DEFAULT 0,
      total_admin_actions INTEGER DEFAULT 0,
      user_bans INTEGER DEFAULT 0,
      user_unbans INTEGER DEFAULT 0,
      content_removals INTEGER DEFAULT 0,
      performance_score REAL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mod_perf_snapshot_unique ON moderator_performance_snapshots(moderator_id, snapshot_date, period);
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
      device_fingerprint TEXT,
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

    -- PHASE 3: BANS & AUTO-PUNISHMENT
    CREATE TABLE IF NOT EXISTS bans (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      ban_type        TEXT NOT NULL,
      user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ip_address      TEXT,
      ip_range        TEXT,
      device_fingerprint TEXT,
      reason          TEXT NOT NULL,
      severity        TEXT NOT NULL DEFAULT 'medium',
      is_permanent    INTEGER DEFAULT 0,
      expires_at      INTEGER,
      is_shadow       INTEGER DEFAULT 0,
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by_type TEXT DEFAULT 'admin',
      anomaly_id      INTEGER REFERENCES anomaly_events(id) ON DELETE SET NULL,
      notes           TEXT,
      is_active       INTEGER DEFAULT 1,
      revoked_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      revoked_at      INTEGER,
      revoke_reason   TEXT,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      CHECK (ban_type IN ('ip','hardware','account','shadow','network')),
      CHECK (severity IN ('warning','medium','high','permanent'))
    );
    CREATE INDEX IF NOT EXISTS idx_bans_user_id       ON bans(user_id);
    CREATE INDEX IF NOT EXISTS idx_bans_ip            ON bans(ip_address);
    CREATE INDEX IF NOT EXISTS idx_bans_fingerprint   ON bans(device_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_bans_active        ON bans(is_active) WHERE is_active = 1;

    CREATE TABLE IF NOT EXISTS auto_punishment_rules (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      description     TEXT,
      is_active       INTEGER DEFAULT 1,
      anomaly_type    TEXT NOT NULL,
      severity_threshold TEXT NOT NULL DEFAULT 'high',
      action          TEXT NOT NULL,
      action_duration_hours INTEGER,
      action_reason   TEXT NOT NULL,
      escalate_after_count INTEGER DEFAULT 1,
      escalation_window_hours INTEGER DEFAULT 24,
      cooldown_hours  INTEGER DEFAULT 1,
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      CHECK (action IN ('warn','shadow_ban','temp_ban','ip_ban','hardware_ban','freeze','permanent_ban'))
    );

    CREATE TABLE IF NOT EXISTS auto_punishment_executions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id         INTEGER REFERENCES auto_punishment_rules(id) ON DELETE SET NULL,
      rule_name       TEXT NOT NULL,
      anomaly_id      INTEGER REFERENCES anomaly_events(id) ON DELETE SET NULL,
      user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ban_id          INTEGER REFERENCES bans(id) ON DELETE SET NULL,
      action_taken    TEXT NOT NULL,
      action_detail   TEXT,
      success         INTEGER DEFAULT 1,
      error_message   TEXT,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS bulk_action_logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      performed_by    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_type     TEXT NOT NULL,
      target_type     TEXT NOT NULL,
      target_ids      TEXT NOT NULL,
      target_count    INTEGER NOT NULL,
      success_count   INTEGER DEFAULT 0,
      fail_count      INTEGER DEFAULT 0,
      reason          TEXT,
      metadata        TEXT DEFAULT '{}',
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS analytics_snapshots (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date   TEXT NOT NULL,
      snapshot_hour   INTEGER,
      granularity     TEXT NOT NULL DEFAULT 'day',
      new_users       INTEGER DEFAULT 0,
      total_users     INTEGER DEFAULT 0,
      active_users_day INTEGER DEFAULT 0,
      active_users_week INTEGER DEFAULT 0,
      active_users_month INTEGER DEFAULT 0,
      returning_users  INTEGER DEFAULT 0,
      new_posts       INTEGER DEFAULT 0,
      new_comments    INTEGER DEFAULT 0,
      new_likes       INTEGER DEFAULT 0,
      new_follows     INTEGER DEFAULT 0,
      new_communities INTEGER DEFAULT 0,
      total_posts     INTEGER DEFAULT 0,
      avg_posts_per_user REAL DEFAULT 0,
      avg_session_actions REAL DEFAULT 0,
      engagement_rate REAL DEFAULT 0,
      d1_retention    REAL DEFAULT 0,
      d7_retention    REAL DEFAULT 0,
      d30_retention   REAL DEFAULT 0,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(snapshot_date, snapshot_hour, granularity)
    );

    CREATE TABLE IF NOT EXISTS community_analytics (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      community_id    INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      snapshot_date   TEXT NOT NULL,
      new_members     INTEGER DEFAULT 0,
      total_members   INTEGER DEFAULT 0,
      new_posts       INTEGER DEFAULT 0,
      total_posts     INTEGER DEFAULT 0,
      active_members  INTEGER DEFAULT 0,
      engagement_score REAL DEFAULT 0,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(community_id, snapshot_date)
    );

    CREATE TABLE IF NOT EXISTS creator_analytics (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      snapshot_date   TEXT NOT NULL,
      new_posts       INTEGER DEFAULT 0,
      total_posts     INTEGER DEFAULT 0,
      new_followers   INTEGER DEFAULT 0,
      total_followers INTEGER DEFAULT 0,
      post_likes_received INTEGER DEFAULT 0,
      post_comments_received INTEGER DEFAULT 0,
      total_reach     INTEGER DEFAULT 0,
      engagement_score REAL DEFAULT 0,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(user_id, snapshot_date)
    );
    CREATE TABLE IF NOT EXISTS admin_settings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      category        TEXT NOT NULL,
      key             TEXT NOT NULL,
      label           TEXT NOT NULL,
      description     TEXT,
      value           TEXT,
      value_type      TEXT NOT NULL DEFAULT 'string',
      default_value   TEXT,
      is_sensitive    INTEGER DEFAULT 0,
      is_readonly     INTEGER DEFAULT 0,
      updated_by      INTEGER,
      updated_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(category, key)
    );
  `);
  console.log("DEBUG: SQLite tables initialized");

  // Add community_id column to posts if it doesn't exist yet
  try {
    sqlite.exec(`ALTER TABLE posts ADD COLUMN community_id INTEGER`);
    logger.info('db', "Added community_id column to posts");
  } catch {
    // Column already exists, ignore
  }

  // Add ip_address column to reports if it doesn't exist yet
  try {
    sqlite.exec(`ALTER TABLE reports ADD COLUMN ip_address TEXT`);
  } catch {
    // Column already exists, ignore
  }
  // Add is_private column to communities if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE communities ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0`);
    logger.info('db', "Added is_private column to communities");
  } catch {
    // Column already exists, ignore
  }

  // FEATURE-FIX [USER-SCHEMA]: Add missing profile columns for SQLite parity
  try {
    sqlite.exec(`ALTER TABLE users ADD COLUMN profile_picture_url TEXT`);
  } catch {}
  try {
    sqlite.exec(`ALTER TABLE users ADD COLUMN bio TEXT`);
  } catch {}
  
  // PHASE 3: Add Moderation columns to users table
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN is_frozen INTEGER DEFAULT 0`); } catch {}
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN is_shadow_banned INTEGER DEFAULT 0`); } catch {}
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN frozen_until INTEGER`); } catch {}
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN freeze_reason TEXT`); } catch {}

  // PROFESSIONAL PROFILE FIELDS
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN display_name TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN cover_url TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN location TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN website TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN is_private INTEGER DEFAULT 0`); } catch {}
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN admin_group_id INTEGER`); } catch {}
  // Columns the shared schema has but older SQLite tables lack
  try { sqlite.exec(`ALTER TABLE tickets ADD COLUMN deleted_at INTEGER`); } catch {}
  try { sqlite.exec(`ALTER TABLE ticket_comments ADD COLUMN deleted_at INTEGER`); } catch {}
  for (const col of ["like_post", "like_comment", "comment_post", "reply_comment", "mention_post", "mention_comment", "new_follower", "community_invite"]) {
    try { sqlite.exec(`ALTER TABLE notification_preferences ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 1`); } catch {}
  }

  // Migrating profile_picture_url to avatar_url if exists and new is empty
  try {
    sqlite.exec(`UPDATE users SET avatar_url = profile_picture_url WHERE (avatar_url IS NULL OR avatar_url = '') AND profile_picture_url IS NOT NULL`);
  } catch {}

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
      logger.info('db', `Added ${col.name} column to notifications`);
    } catch {
      // Ignore "duplicate column" errors
    }
  }

  // Data migration: if from_user_id exists, copy it to actor_id
  try {
    sqlite.exec(`UPDATE notifications SET actor_id = from_user_id WHERE actor_id IS NULL AND from_user_id IS NOT NULL`);
  } catch {
    // Ignore if from_user_id doesn't exist
  }

  // Hot-lookup indexes (same as migrations/0004_hot_indexes.sql for PostgreSQL)
  for (const ddl of [
    "CREATE INDEX IF NOT EXISTS posts_author_created_idx ON posts(author_id, created_at)",
    "CREATE INDEX IF NOT EXISTS posts_community_created_idx ON posts(community_id, created_at)",
    "CREATE INDEX IF NOT EXISTS posts_created_idx ON posts(created_at)",
    "CREATE INDEX IF NOT EXISTS comments_post_created_idx ON comments(post_id, created_at)",
    "CREATE INDEX IF NOT EXISTS comments_author_idx ON comments(author_id)",
    "CREATE INDEX IF NOT EXISTS post_likes_post_idx ON post_likes(post_id)",
    "CREATE INDEX IF NOT EXISTS comment_likes_comment_idx ON comment_likes(comment_id)",
    "CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS messages_sender_receiver_created_idx ON messages(sender_id, receiver_id, created_at)",
    "CREATE INDEX IF NOT EXISTS followers_follower_following_idx ON followers(follower_id, following_id)",
    "CREATE INDEX IF NOT EXISTS followers_following_idx ON followers(following_id)",
    "CREATE INDEX IF NOT EXISTS community_members_user_idx ON community_members(user_id)",
    "CREATE INDEX IF NOT EXISTS reports_reporter_idx ON reports(reporter_id)",
    "CREATE INDEX IF NOT EXISTS verification_tokens_user_idx ON verification_tokens(user_id)",
    "CREATE INDEX IF NOT EXISTS anomaly_events_user_type_created_idx ON anomaly_events(user_id, anomaly_type, created_at)",
    "CREATE INDEX IF NOT EXISTS activity_logs_ip_created_idx ON activity_logs(ip_address, created_at)",
    "CREATE INDEX IF NOT EXISTS activity_logs_action_created_idx ON activity_logs(action, created_at)",
  ]) {
    try { sqlite.exec(ddl); } catch (err) { logger.warn('db', `SQLite index not created: ${ddl}`, { error: String(err) }); }
  }
  restrictSqliteFiles(dbPath);
} else {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production") {
      logger.error('db', "CRITICAL: DATABASE_URL is missing in production!");
      throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
    } else {
      const urlPreview = process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 10)}...` : "undefined";
      logger.warn('db', "DATABASE_URL status", { 
        missing: !process.env.DATABASE_URL,
        preview: urlPreview,
        envFile: ".env"
      });
      logger.warn('db', "DATABASE_URL is missing. Production-mode DB logic will fail if called.");
      // Fallback pool for analysis tools
      pool = null;
      db = null;
    }
  } else {
    const baseUrl = process.env.DATABASE_URL;
    const runtimeUrl = dbRoleMode === "split" ? withCredentials(baseUrl, appRoleName, appPassword)
      : dbRoleMode === "app-only" ? withCredentials(baseUrl, appRoleName)
      : baseUrl;
    logger.info('db', `Using ${baseUrl.includes("neon.tech") ? "Neon" : "standard"} PostgreSQL database`, {
      role: dbRoleMode === "single" ? "DATABASE_URL user" : appRoleName,
      mode: dbRoleMode,
      statementTimeoutMs: dbTimeouts.statementTimeoutMs,
      poolMax: dbTimeouts.poolMax,
    });
    pool = createPgPool(runtimeUrl, { runtime: true });
    db = drizzleFor(pool);
  }
}

// ── Migration connection ────────────────────────────────────────────────
// Schema changes run on their own small pool without the runtime statement timeout, with the DATABASE_URL
// credentials (owner/superuser). In "app-only" mode there are no such credentials: getMigrationPool() is null
// and the app performs no DDL (the migrate service has done it).
let migrationPool: NeonPool | pg.Pool | null = null;
let migrationDb: any = null;

export function getMigrationPool(): NeonPool | pg.Pool | null {
  if (useSqlite || dbRoleMode === "app-only" || !process.env.DATABASE_URL) return null;
  if (!migrationPool) {
    migrationPool = createPgPool(process.env.DATABASE_URL, { runtime: false });
    migrationDb = drizzleFor(migrationPool);
  }
  return migrationPool;
}

export function getMigrationDb(): any {
  return getMigrationPool() ? migrationDb : null;
}

export async function closeMigrationDb() {
  const p = migrationPool;
  migrationPool = null;
  migrationDb = null;
  if (p) await p.end().catch(() => undefined);
}

// ── SQLite file protection ──────────────────────────────────────────────
// The database (password hashes, sessions) must never be inside the publicly served uploads folder, and only
// the app's own user may read it.
function prepareSqliteFile(dbPath: string) {
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  const real = (p: string) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const dir = path.dirname(dbPath);
  const rel = path.relative(real(uploadsDir), path.join(real(dir), path.basename(dbPath)));
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
    const msg = `SQLITE_PATH (${dbPath}) is inside the public uploads folder, where anyone could download the database. Move the file outside "uploads" (e.g. data/local.db) and set SQLITE_PATH accordingly.`;
    logger.critical('db', msg);
    throw new Error(msg);
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(dbPath)) fs.closeSync(fs.openSync(dbPath, "a", 0o600));
}

function restrictSqliteFiles(dbPath: string) {
  // SQLite creates -wal/-shm with the permissions of the database file
  for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`]) {
    try { if (fs.existsSync(file)) fs.chmodSync(file, 0o600); } catch (err) {
      logger.warn('db', `Could not restrict the permissions of ${path.basename(file)} to 0600`, { error: String(err) });
    }
  }
}

export function getSqlite() {
  return sqlite;
}

export async function closeDb() {
  if (sqlite) {
    logger.info('db', "Closing SQLite database...");
    sqlite.close();
  }
  await closeMigrationDb();
  if (pool) {
    logger.info('db', "Closing Postgres pool...");
    await pool.end();
  }
}

export { pool, db };
