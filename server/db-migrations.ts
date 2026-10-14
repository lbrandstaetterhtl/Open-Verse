import { db } from './db';
import { logger } from './logger';
import { sql } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { storage } from './storage';
import crypto from 'node:crypto';

/**
 * Run all pending Drizzle migrations.
 * This executes SQL migration files from the migrations/ directory.
 */
export async function runMigrations() {
  if (process.env.USE_SQLITE === "true") {
    console.log("[MIGRATIONS] SQLite mode detected, skipping migrations");
    return; // SQLite handles schema creation in db.ts
  }

  console.log("[MIGRATIONS] Starting PostgreSQL migration runner...");
  logger.info('db', "Running PostgreSQL migrations...");

  try {
    const migrationsDir = path.join(process.cwd(), 'migrations');
    console.log("[MIGRATIONS] Looking for migrations in:", migrationsDir);

    if (!fs.existsSync(migrationsDir)) {
      console.log("[MIGRATIONS] Directory not found at:", migrationsDir);
      logger.warn('db', "Migrations directory not found - skipping migrations");
      return;
    }

    console.log("[MIGRATIONS] Found migrations directory");

    // Read all .sql files from migrations directory
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`[MIGRATIONS] Found ${files.length} SQL files:`, files);

    if (files.length === 0) {
      console.log("[MIGRATIONS] No SQL files found!");
      logger.warn('db', "No SQL migration files found");
      return;
    }

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      try {
        console.log(`[MIGRATIONS] Running: ${file}`);
        logger.info('db', `Executing migration: ${file}`);
        // Split by semicolon to handle multiple statements
        const statements = sqlContent
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);

        console.log(`[MIGRATIONS] File has ${statements.length} SQL statements`);

        for (const statement of statements) {
          await db.execute(sql.raw(statement));
        }
        console.log(`[MIGRATIONS] ✓ Completed: ${file}`);
        logger.info('db', `Completed migration: ${file}`);
      } catch (err: any) {
        // Some migrations may fail if tables already exist - that's OK
        if (err.message?.includes('already exists') ||
            err.code === '42P07') { // PostgreSQL duplicate table error
          console.log(`[MIGRATIONS] Already applied: ${file}`);
          logger.info('db', `Migration ${file} already applied (skipped)`);
        } else {
          console.error(`[MIGRATIONS] ✗ ERROR in ${file}:`, err.message);
          logger.error('db', `Failed to execute migration ${file}`, err);
          throw err;
        }
      }
    }

    console.log("[MIGRATIONS] ✓ All migrations completed successfully!");
    logger.info('db', "All migrations completed successfully");

    // Seed test account for development
    await seedTestAccount();
  } catch (err) {
    console.error("[MIGRATIONS] ✗ CRITICAL ERROR:", err);
    logger.critical('db', "Failed to run migrations", err);
    throw err;
  }
}

async function seedTestAccount() {
  try {
    const testUsername = "testadmin";
    const testEmail = "test@example.com";
    const testPassword = "TestPassword123!";

    // Check if test account already exists
    const existingUser = await storage.getUserByUsername(testUsername);

    if (existingUser) {
      console.log(`[SEED] Test account '${testUsername}' already exists (ID: ${existingUser.id})`);
      return;
    }

    // Hash password
    const passwordHash = crypto
      .createHash('sha256')
      .update(testPassword)
      .digest('hex');

    // Create test owner account
    const user = await storage.createUser({
      username: testUsername,
      email: testEmail,
      password: passwordHash,
      role: 'owner',
      verified: 1,
      displayName: 'Test Admin'
    } as any);

    console.log(`[SEED] ✓ Test account created!`);
    console.log(`[SEED]   Username: ${testUsername}`);
    console.log(`[SEED]   Email: ${testEmail}`);
    console.log(`[SEED]   Password: ${testPassword}`);
    console.log(`[SEED]   Role: owner`);
    console.log(`[SEED]   ID: ${user.id}`);
    logger.info('db', `Test owner account created: ${testUsername}`);
  } catch (err: any) {
    if (err.message?.includes('duplicate') || err.code === '23505') {
      console.log(`[SEED] Test account already exists (constraint violation)`);
    } else {
      console.error(`[SEED] Error creating test account:`, err.message);
      logger.warn('db', `Failed to seed test account`, err);
    }
  }
}