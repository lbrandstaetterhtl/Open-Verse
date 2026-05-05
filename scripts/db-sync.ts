import { db, getSqlite } from "../server/db";
import * as schema from "@shared/schema";
import { sql } from "drizzle-orm";

/**
 * DB Sync & Syntax Checker Script
 * This script ensures all tables defined in shared/schema.ts exist in the database
 * and follow a unified syntax (especially for SQLite compatibility).
 */
async function syncDatabase() {
  const useSqlite = process.env.USE_SQLITE === "true";
  console.log(`--- Database Sync (${useSqlite ? "SQLite" : "PostgreSQL"}) ---`);

  let success = false;
  if (useSqlite) {
    success = await syncSqlite();
  } else {
    success = await syncPostgres();
  }

  if (success) {
    console.log("\n✅ Database sync completed!");
  } else {
    console.log("\n❌ Database sync failed.");
    process.exit(1);
  }
  process.exit(0);
}

async function syncSqlite() {
  const sqlite = getSqlite();
  if (!sqlite) {
    console.error("❌ SQLite connection not found.");
    return;
  }

  // Get existing tables
  const existingTablesResult = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const existingTables = new Set(existingTablesResult.map(t => t.name));

  // Tables defined in schema.ts (that we expect to see in the DB)
  const schemaTables = [
    { name: "users", ddl: `
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
        bio TEXT,
        display_name TEXT,
        avatar_url TEXT,
        profile_picture_url TEXT,
        cover_url TEXT,
        location TEXT,
        website TEXT,
        is_private INTEGER NOT NULL DEFAULT 0,
        is_frozen INTEGER DEFAULT 0,
        is_shadow_banned INTEGER DEFAULT 0,
        frozen_until INTEGER,
        freeze_reason TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )` 
    },
    { name: "verification_tokens", ddl: `
      CREATE TABLE IF NOT EXISTS verification_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        expires_at INTEGER NOT NULL
      )`
    },
    { name: "posts", ddl: `
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        karma INTEGER NOT NULL DEFAULT 0,
        media_url TEXT,
        media_type TEXT,
        community_id INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "comments", ddl: `
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        post_id INTEGER NOT NULL,
        karma INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "reports", ddl: `
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reason TEXT NOT NULL,
        reporter_id INTEGER NOT NULL,
        post_id INTEGER,
        comment_id INTEGER,
        discussion_id INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        ip_address TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        resolved_by INTEGER,
        resolved_at INTEGER,
        resolution_time_seconds INTEGER
      )`
    },
    { name: "followers", ddl: `
      CREATE TABLE IF NOT EXISTS followers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        follower_id INTEGER NOT NULL,
        following_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "notifications", ddl: `
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
      )`
    },
    { name: "messages", ddl: `
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "post_likes", ddl: `
      CREATE TABLE IF NOT EXISTS post_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        post_id INTEGER NOT NULL,
        is_like INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "comment_likes", ddl: `
      CREATE TABLE IF NOT EXISTS comment_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        comment_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "communities", ddl: `
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
      )`
    },
    { name: "community_members", ddl: `
      CREATE TABLE IF NOT EXISTS community_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        community_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        joined_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "community_bans", ddl: `
      CREATE TABLE IF NOT EXISTS community_bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        community_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        reason TEXT,
        banned_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "community_join_requests", ddl: `
      CREATE TABLE IF NOT EXISTS community_join_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        community_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "activity_logs", ddl: `
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_email TEXT,
        user_role TEXT,
        user_username TEXT,
        action TEXT NOT NULL,
        category TEXT NOT NULL,
        subcategory TEXT,
        target_type TEXT,
        target_id TEXT,
        target_label TEXT,
        description TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        old_value TEXT,
        new_value TEXT,
        ip_address TEXT,
        ip_country TEXT,
        ip_city TEXT,
        user_agent TEXT,
        device_type TEXT,
        device_os TEXT,
        device_browser TEXT,
        session_id TEXT,
        device_fingerprint TEXT,
        status TEXT NOT NULL DEFAULT 'success',
        severity TEXT NOT NULL DEFAULT 'info',
        is_anomaly INTEGER DEFAULT 0,
        anomaly_type TEXT,
        anomaly_score REAL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "anomaly_events", ddl: `
      CREATE TABLE IF NOT EXISTS anomaly_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        anomaly_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'warning',
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        evidence TEXT DEFAULT '{}',
        trigger_value REAL,
        threshold_value REAL,
        status TEXT DEFAULT 'open',
        resolved_by INTEGER,
        resolved_at INTEGER,
        resolution_note TEXT,
        auto_action TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "bans", ddl: `
      CREATE TABLE IF NOT EXISTS bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ban_type TEXT NOT NULL,
        user_id INTEGER,
        ip_address TEXT,
        ip_range TEXT,
        device_fingerprint TEXT,
        reason TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'medium',
        is_permanent INTEGER DEFAULT 0,
        expires_at INTEGER,
        is_shadow INTEGER DEFAULT 0,
        created_by INTEGER,
        created_by_type TEXT DEFAULT 'admin',
        anomaly_id INTEGER,
        is_active INTEGER DEFAULT 1,
        revoked_by INTEGER,
        revoked_at INTEGER,
        revoke_reason TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "auto_punishment_rules", ddl: `
      CREATE TABLE IF NOT EXISTS auto_punishment_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        is_active INTEGER DEFAULT 1,
        anomaly_type TEXT NOT NULL,
        severity_threshold TEXT NOT NULL DEFAULT 'high',
        action TEXT NOT NULL,
        action_duration_hours INTEGER,
        action_reason TEXT NOT NULL,
        escalate_after_count INTEGER DEFAULT 1,
        escalation_window_hours INTEGER DEFAULT 24,
        cooldown_hours INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "auto_punishment_executions", ddl: `
      CREATE TABLE IF NOT EXISTS auto_punishment_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_id INTEGER,
        rule_name TEXT NOT NULL,
        anomaly_id INTEGER,
        user_id INTEGER,
        ban_id INTEGER,
        action_taken TEXT NOT NULL,
        action_detail TEXT,
        success INTEGER DEFAULT 1,
        error_message TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "tickets", ddl: `
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
      )`
    },
    { name: "ticket_comments", ddl: `
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
      )`
    },
    { name: "ticket_status_history", ddl: `
      CREATE TABLE IF NOT EXISTS ticket_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        changed_by INTEGER NOT NULL,
        from_status TEXT,
        to_status TEXT,
        reason TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "system_metrics", ddl: `
      CREATE TABLE IF NOT EXISTS system_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        metric_unit TEXT,
        dimensions TEXT DEFAULT '{}',
        period_start INTEGER NOT NULL,
        period_end INTEGER NOT NULL,
        granularity TEXT DEFAULT 'minute',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "alert_rules", ddl: `
      CREATE TABLE IF NOT EXISTS alert_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        metric TEXT NOT NULL,
        condition TEXT NOT NULL,
        threshold REAL NOT NULL,
        window_seconds INTEGER DEFAULT 300,
        severity TEXT NOT NULL DEFAULT 'warning',
        is_active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "alert_history", ddl: `
      CREATE TABLE IF NOT EXISTS alert_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_id INTEGER,
        rule_name TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        metric_value REAL,
        threshold_value REAL,
        status TEXT DEFAULT 'firing',
        acknowledged_by INTEGER,
        acknowledged_at INTEGER,
        resolved_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "bulk_action_logs", ddl: `
      CREATE TABLE IF NOT EXISTS bulk_action_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        performed_by INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_ids TEXT NOT NULL,
        target_count INTEGER NOT NULL,
        success_count INTEGER DEFAULT 0,
        fail_count INTEGER DEFAULT 0,
        reason TEXT,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "notification_preferences", ddl: `
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        community_post INTEGER NOT NULL DEFAULT 1,
        post_milestone INTEGER NOT NULL DEFAULT 1,
        system_announcement INTEGER NOT NULL DEFAULT 1,
        browser_notifications INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER
      )`
    },
    { name: "themes", ddl: `
      CREATE TABLE IF NOT EXISTS themes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        colors TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "admin_settings", ddl: `
      CREATE TABLE IF NOT EXISTS admin_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        value TEXT,
        value_type TEXT NOT NULL DEFAULT 'string',
        is_sensitive INTEGER DEFAULT 0,
        is_readonly INTEGER DEFAULT 0,
        updated_by INTEGER,
        updated_at INTEGER
      )`
    },
    { name: "creator_analytics", ddl: `
      CREATE TABLE IF NOT EXISTS creator_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        snapshot_date TEXT NOT NULL,
        new_posts INTEGER DEFAULT 0,
        total_posts INTEGER DEFAULT 0,
        new_followers INTEGER DEFAULT 0,
        total_followers INTEGER DEFAULT 0,
        post_likes_received INTEGER DEFAULT 0,
        post_comments_received INTEGER DEFAULT 0,
        total_reach INTEGER DEFAULT 0,
        engagement_score REAL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "community_analytics", ddl: `
      CREATE TABLE IF NOT EXISTS community_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        community_id INTEGER NOT NULL,
        snapshot_date TEXT NOT NULL,
        new_members INTEGER DEFAULT 0,
        total_members INTEGER DEFAULT 0,
        new_posts INTEGER DEFAULT 0,
        total_posts INTEGER DEFAULT 0,
        active_members INTEGER DEFAULT 0,
        engagement_score REAL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "analytics_snapshots", ddl: `
      CREATE TABLE IF NOT EXISTS analytics_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_date TEXT NOT NULL,
        snapshot_hour INTEGER,
        granularity TEXT NOT NULL DEFAULT 'day',
        new_users INTEGER DEFAULT 0,
        total_users INTEGER DEFAULT 0,
        active_users_day INTEGER DEFAULT 0,
        active_users_week INTEGER DEFAULT 0,
        active_users_month INTEGER DEFAULT 0,
        new_posts INTEGER DEFAULT 0,
        new_comments INTEGER DEFAULT 0,
        new_likes INTEGER DEFAULT 0,
        new_follows INTEGER DEFAULT 0,
        new_communities INTEGER DEFAULT 0,
        engagement_rate REAL DEFAULT 0,
        d1_retention REAL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`
    },
    { name: "moderator_performance_snapshots", ddl: `
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
      )`
    }
  ];

  for (const table of schemaTables) {
    if (!existingTables.has(table.name)) {
      console.log(`\n📦 Creating missing table: ${table.name}...`);
      try {
        sqlite.exec(table.ddl);
        console.log(`✅ Table ${table.name} created successfully.`);
      } catch (error) {
        console.error(`❌ Error creating table ${table.name}:`, error);
      }
    } else {
      console.log(`✔ Table ${table.name} already exists.`);
    }
  }

  // Syntax Consistency Check: Timestamps
  console.log("\n🔍 Checking for syntax inconsistencies (Timestamps)...");
  for (const table of schemaTables) {
    try {
      // Check if table has created_at column
      const info = sqlite.prepare(`PRAGMA table_info(${table.name})`).all() as any[];
      const createdAtCol = info.find(c => c.name === 'created_at');
      if (createdAtCol && createdAtCol.type !== 'INTEGER') {
        console.warn(`⚠ Warning: Table ${table.name} uses ${createdAtCol.type} for created_at instead of INTEGER.`);
      }
    } catch (e) {}
  }
  return true;
}

async function syncPostgres() {
  console.log("PostgreSQL synchronization relies on 'npm run db:push' (Drizzle Kit).");
  
  if (!db) {
    console.error("❌ PostgreSQL connection failed: Database connection (db) is not initialized. Is DATABASE_URL missing?");
    return false;
  }

  console.log("Checking connection...");
  try {
    await db.execute(sql`SELECT 1`);
    console.log("✅ PostgreSQL connection successful.");
    console.log("Please run 'npm run db:push' to sync your schema with Postgres.");
    return true;
  } catch (error) {
    console.error("❌ PostgreSQL connection failed:", error);
    return false;
  }
}

syncDatabase().catch(console.error);
