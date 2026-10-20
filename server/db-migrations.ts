import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from './logger';
import { sql } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { storage } from './storage';
import { hashPassword, verifyPassword } from './utils/password-hash';
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
  } catch (err) {
    console.error("[MIGRATIONS] ✗ CRITICAL ERROR:", err);
    logger.critical('db', "Failed to run migrations", err);
    throw err;
  }
}

/**
 * Account fixes that need the final schema, so they run after all migrations and column fixes
 * (in PostgreSQL and SQLite mode).
 */
export async function bootstrapAccounts() {
  await disableLegacyTestAdmin();
  await seedInitialOwner();
}

// Earlier versions created "testadmin" with a password that is public in this repository.
// If that account still uses it, replace the password with a random one so it can't be used to log in.
async function disableLegacyTestAdmin() {
  try {
    const legacy = await storage.getUserByUsername("testadmin");
    if (!legacy?.password || !(await verifyPassword("TestPassword123!", legacy.password)).isValid) return;
    await storage.updateUserPassword(legacy.id, await hashPassword(randomBytes(32).toString("hex")));
    logger.critical('db', 'Disabled legacy "testadmin" account that used the publicly known default password. Use INITIAL_OWNER_USERNAME / INITIAL_OWNER_PASSWORD to create your own owner.');
  } catch (err) {
    logger.error('db', 'Failed to check legacy testadmin account', err);
  }
}

/**
 * Creates the first owner from INITIAL_OWNER_USERNAME / INITIAL_OWNER_PASSWORD (optional INITIAL_OWNER_EMAIL).
 * - Account missing: it is created as owner.
 * - Account exists and INITIAL_OWNER_PASSWORD is its password: it is made owner if it isn't one yet.
 * - Account exists with another password: nothing changes, unless INITIAL_OWNER_RESET_PASSWORD=true, which
 *   sets INITIAL_OWNER_PASSWORD as its password and makes it owner (to recover access).
 * Every outcome is logged, so `docker compose logs app | grep -i owner` shows what happened.
 */
// Every outcome must show up in `docker compose logs app`. The logger prints warnings and errors there
// itself; in production it keeps info only in its files, so successes are printed here.
function ownerLog(level: 'info' | 'warn' | 'error' | 'critical', message: string, err?: unknown) {
  if (level === 'info' && process.env.NODE_ENV === 'production') console.log(`[INITIAL OWNER] ${message}`);
  if (level === 'error') logger.error('db', `Initial owner: ${message}`, err);
  else logger[level]('db', `Initial owner: ${message}`);
}

export async function seedInitialOwner() {
  const username = process.env.INITIAL_OWNER_USERNAME?.trim();
  // Trailing spaces in .env lines are almost always accidental (and invisible in editors)
  const rawPassword = process.env.INITIAL_OWNER_PASSWORD;
  const password = rawPassword?.replace(/\s+$/, "");
  if (rawPassword && password !== rawPassword) {
    ownerLog('warn', 'INITIAL_OWNER_PASSWORD ended with spaces; they were ignored');
  }
  const email = process.env.INITIAL_OWNER_EMAIL?.trim() || `${username}@localhost`;
  const resetPassword = process.env.INITIAL_OWNER_RESET_PASSWORD?.trim() === 'true';

  if (!username && !password) return;
  if (!username || !password) {
    ownerLog('warn', 'INITIAL_OWNER_USERNAME and INITIAL_OWNER_PASSWORD must both be set; nothing was created');
    return;
  }
  if (password.length < 12) {
    ownerLog('warn', 'INITIAL_OWNER_PASSWORD must be at least 12 characters; nothing was created');
    return;
  }

  try {
    const existing = await storage.getUserByUsername(username);
    if (!existing) {
      const emailUser = await storage.getUserByEmail(email);
      if (emailUser) {
        ownerLog('warn', `the email ${email} already belongs to "${emailUser.username}"; set another INITIAL_OWNER_EMAIL. Nothing was created`);
        return;
      }
      await storage.createUser({
        username,
        email,
        password: await hashPassword(password),
        role: 'owner',
        isAdmin: 1,
        verified: 1,
        emailVerified: 1,
      });
      ownerLog('info', `account "${username}" created`);
      return;
    }

    const passwordMatches = (await verifyPassword(password, existing.password)).isValid;
    if (!passwordMatches && !resetPassword) {
      // Registration and renames refuse INITIAL_OWNER_USERNAME, but an account with that name may predate
      // the setting (registered before the owner was configured). It is NOT made owner.
      const isOwner = existing.role === 'owner' && !!existing.isAdmin;
      ownerLog(isOwner ? 'warn' : 'critical', `account "${username}" already exists with a different password${isOwner ? '' : ' and is NOT an owner — someone may have registered this name before the owner was configured'}; nothing was changed. Check the account, then start once with INITIAL_OWNER_RESET_PASSWORD=true to set INITIAL_OWNER_PASSWORD as its password (or choose another INITIAL_OWNER_USERNAME).`);
      return;
    }
    if (!passwordMatches) {
      await storage.updateUserPassword(existing.id, await hashPassword(password));
      ownerLog('critical', `password of "${username}" was reset from INITIAL_OWNER_PASSWORD. Remove INITIAL_OWNER_RESET_PASSWORD from .env again.`);
    }
    if (existing.role !== 'owner' || !existing.isAdmin) {
      await db.update(users).set({ role: 'owner', isAdmin: 1 }).where(eq(users.id, existing.id));
      ownerLog('info', `existing account "${username}" is now owner`);
    } else if (passwordMatches) {
      ownerLog('info', `"${username}" already exists and is owner; nothing to do`);
    }
  } catch (err) {
    ownerLog('error', 'failed to create or update the account', err);
  }
}
