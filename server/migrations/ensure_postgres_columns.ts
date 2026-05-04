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

  const userColumns = [
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
  ];

  for (const col of userColumns) {
    try {
      // Postgres-safe way to add column if not exists
      await db.execute(sql.raw(`
        DO $$ 
        BEGIN 
          BEGIN
            ALTER TABLE users ADD COLUMN ${col.name} ${col.type};
          EXCEPTION
            WHEN duplicate_column THEN NULL;
          END;
        END $$;
      `));
    } catch (err: any) {
      logger.error('db', `Failed to ensure column ${col.name} in users table`, err);
    }
  }

  // Ensure reports columns for moderator performance
  const reportsColumns = [
    { name: 'resolved_by', type: 'INTEGER' },
    { name: 'resolved_at', type: 'TIMESTAMP' },
    { name: 'resolution_time_seconds', type: 'INTEGER' }
  ];

  for (const col of reportsColumns) {
    try {
      await db.execute(sql.raw(`
        DO $$ 
        BEGIN 
          BEGIN
            ALTER TABLE reports ADD COLUMN ${col.name} ${col.type};
          EXCEPTION
            WHEN duplicate_column THEN NULL;
          END;
        END $$;
      `));
    } catch (err: any) {
      logger.error('db', `Failed to ensure column ${col.name} in reports table`, err);
    }
  }

  // Ensure tickets columns
  const ticketsColumns = [
    { name: 'first_response_at', type: 'TIMESTAMP' },
    { name: 'response_time_seconds', type: 'INTEGER' },
    { name: 'resolution_time_seconds', type: 'INTEGER' }
  ];

  for (const col of ticketsColumns) {
    try {
      await db.execute(sql.raw(`
        DO $$ 
        BEGIN 
          BEGIN
            ALTER TABLE tickets ADD COLUMN ${col.name} ${col.type};
          EXCEPTION
            WHEN duplicate_column THEN NULL;
          END;
        END $$;
      `));
    } catch (err: any) {
      logger.error('db', `Failed to ensure column ${col.name} in tickets table`, err);
    }
  }

  logger.info('db', "Postgres schema consistency check completed");
}
