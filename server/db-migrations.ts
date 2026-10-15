import { db } from './db';
import { logger } from './logger';
import { sql } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { storage } from './storage';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

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
        const errorCode = err.code || err.cause?.code;
        const errorMessage = err.message || err.cause?.message || '';

        if (errorMessage.includes('already exists') || errorCode === '42P07') {
          console.log(`[MIGRATIONS] Already applied: ${file}`);
          logger.info('db', `Migration ${file} already applied (skipped)`);
        } else {
          console.error(`[MIGRATIONS] ✗ ERROR in ${file}:`, errorMessage);
          logger.error('db', `Failed to execute migration ${file}`, err);
          throw err;
        }
      }
    }

    console.log("[MIGRATIONS] ✓ All migrations completed successfully!");
    logger.info('db', "All migrations completed successfully");

    await disableLegacyTestAdmin();
    await seedInitialOwner();
  } catch (err) {
    console.error("[MIGRATIONS] ✗ CRITICAL ERROR:", err);
    logger.critical('db', "Failed to run migrations", err);
    throw err;
  }
}

// Earlier versions created "testadmin" with a password that is public in this repository.
// If that account still uses it, replace the password with a random one so it can't be used to log in.
async function disableLegacyTestAdmin() {
  try {
    const legacy = await storage.getUserByUsername("testadmin");
    if (!legacy || !(await bcrypt.compare("TestPassword123!", legacy.password))) return;
    await storage.updateUserPassword(legacy.id, await bcrypt.hash(randomBytes(32).toString("hex"), 12));
    logger.critical('db', 'Disabled legacy "testadmin" account that used the publicly known default password. Use INITIAL_OWNER_USERNAME / INITIAL_OWNER_PASSWORD to create your own owner.');
  } catch (err) {
    logger.error('db', 'Failed to check legacy testadmin account', err);
  }
}

async function seedInitialOwner() {
  const username = process.env.INITIAL_OWNER_USERNAME;
  const password = process.env.INITIAL_OWNER_PASSWORD;
  if (!username || !password) return;

  if (password.length < 12) {
    logger.warn('db', 'INITIAL_OWNER_PASSWORD must be at least 12 characters; initial owner was not created');
    return;
  }

  try {
    if (await storage.getUserByUsername(username)) return;

    await storage.createUser({
      username,
      email: process.env.INITIAL_OWNER_EMAIL || `${username}@localhost`,
      password: await bcrypt.hash(password, 12),
      role: 'owner',
      isAdmin: 1,
      verified: 1,
      emailVerified: 1,
    });
    logger.info('db', `Initial owner account created: ${username}`);
  } catch (err) {
    logger.error('db', 'Failed to create initial owner account', err);
  }
}
