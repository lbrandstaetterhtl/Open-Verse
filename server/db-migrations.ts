import { db } from './db';
import { logger } from './logger';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Run all pending Drizzle migrations.
 * This executes SQL migration files from the migrations/ directory.
 */
export async function runMigrations() {
  if (process.env.USE_SQLITE === "true") {
    return; // SQLite handles schema creation in db.ts
  }

  logger.info('db', "Running PostgreSQL migrations...");

  try {
    const migrationsDir = path.join(process.cwd(), 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      logger.warn('db', "Migrations directory not found - skipping migrations");
      return;
    }

    // Read all .sql files from migrations directory
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      logger.warn('db', "No SQL migration files found");
      return;
    }

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      try {
        logger.info('db', `Executing migration: ${file}`);
        await db.execute(sql as any);
        logger.info('db', `Completed migration: ${file}`);
      } catch (err: any) {
        // Some migrations may fail if tables already exist - that's OK
        if (err.message?.includes('already exists') ||
            err.code === '42P07') { // PostgreSQL duplicate table error
          logger.info('db', `Migration ${file} already applied (skipped)`);
        } else {
          logger.error('db', `Failed to execute migration ${file}`, err);
          throw err;
        }
      }
    }

    logger.info('db', "All migrations completed successfully");
  } catch (err) {
    logger.critical('db', "Failed to run migrations", err);
    throw err;
  }
}