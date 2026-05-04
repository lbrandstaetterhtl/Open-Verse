import { db } from '../db';
import { sql } from 'drizzle-orm';
import { logger } from '../logger';

/**
 * MIGRATION [POSTGRES-FIX]: Ensure all columns from shared/schema.ts exist in Postgres.
 * This is necessary because some columns were added later and might be missing
 * in production/docker Postgres environments that don't use drizzle-kit push.
 */
export async function ensurePostgresColumns() {
  if (process.env.USE_SQLITE === "true") {
    return; // SQLite is handled in db.ts
  }

  logger.info('db', "Ensuring Postgres schema consistency...");

  const tablesToFix = [
    {
      table: 'users',
      columns: [
        { name: 'role', type: 'TEXT DEFAULT \'user\'' },
        { name: 'verified', type: 'INTEGER DEFAULT 0' },
        { name: 'profile_picture_url', type: 'TEXT' },
        { name: 'bio', type: 'TEXT' },
        { name: 'display_name', type: 'TEXT' },
        { name: 'avatar_url', type: 'TEXT' },
        { name: 'cover_url', type: 'TEXT' },
        { name: 'location', type: 'TEXT' },
        { name: 'website', type: 'TEXT' },
        { name: 'is_private', type: 'INTEGER DEFAULT 0' },
        { name: 'is_frozen', type: 'INTEGER DEFAULT 0' },
        { name: 'is_shadow_banned', type: 'INTEGER DEFAULT 0' },
        { name: 'frozen_until', type: 'INTEGER' },
        { name: 'freeze_reason', type: 'TEXT' }
      ]
    },
    {
      table: 'communities',
      columns: [
        { name: 'slug', type: 'TEXT' },
        { name: 'allowed_categories', type: 'TEXT DEFAULT \'news,entertainment,discussion\'' },
        { name: 'is_private', type: 'INTEGER DEFAULT 0' }
      ]
    },
    {
      table: 'notifications',
      columns: [
        { name: 'read', type: 'INTEGER DEFAULT 0' },
        { name: 'seen', type: 'INTEGER DEFAULT 0' },
        { name: 'archived', type: 'INTEGER DEFAULT 0' },
        { name: 'group_key', type: 'TEXT' }
      ]
    },
    {
      table: 'reports',
      columns: [
        { name: 'resolved_by', type: 'INTEGER' },
        { name: 'resolved_at', type: 'TIMESTAMP' },
        { name: 'resolution_time_seconds', type: 'INTEGER' }
      ]
    },
    {
      table: 'tickets',
      columns: [
        { name: 'first_response_at', type: 'TIMESTAMP' },
        { name: 'response_time_seconds', type: 'INTEGER' },
        { name: 'resolution_time_seconds', type: 'INTEGER' }
      ]
    },
    {
      table: 'activity_logs',
      columns: [
        { name: 'is_anomaly', type: 'INTEGER DEFAULT 0' },
        { name: 'anomaly_type', type: 'TEXT' },
        { name: 'anomaly_score', type: 'REAL' },
        { name: 'metadata', type: 'TEXT DEFAULT \'{}\'' },
        { name: 'ip_country', type: 'TEXT' },
        { name: 'device_fingerprint', type: 'TEXT' }
      ]
    },
    {
      table: 'notification_preferences',
      columns: [
        { name: 'community_post', type: 'INTEGER DEFAULT 1' },
        { name: 'post_milestone', type: 'INTEGER DEFAULT 1' },
        { name: 'system_announcement', type: 'INTEGER DEFAULT 1' },
        { name: 'browser_notifications', type: 'INTEGER DEFAULT 1' }
      ]
    },
    {
      table: 'admin_settings',
      columns: [
        { name: 'is_sensitive', type: 'INTEGER DEFAULT 0' },
        { name: 'is_readonly', type: 'INTEGER DEFAULT 0' }
      ]
    }
  ];

  for (const item of tablesToFix) {
    for (const col of item.columns) {
      try {
        await db.execute(sql.raw(`
          DO $$ 
          BEGIN 
            BEGIN
              ALTER TABLE ${item.table} ADD COLUMN ${col.name} ${col.type};
            EXCEPTION
              WHEN duplicate_column THEN NULL;
              WHEN undefined_table THEN NULL;
            END;
          END $$;
        `));
      } catch (err: any) {
        logger.error('db', `Failed to ensure column ${col.name} in ${item.table} table`, err);
      }
    }
  }

  logger.info('db', "Postgres schema consistency check completed");
}
