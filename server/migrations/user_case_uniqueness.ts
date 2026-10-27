import { getMigrationDb } from '../db';
import { sql } from 'drizzle-orm';
import { logger } from '../logger';

/**
 * Usernames and emails are unique regardless of case ("Alice" = "alice", "A@X.test" = "a@x.test").
 * The lookups in storage/user-storage.ts already compare case-insensitively; this adds unique indexes on
 * lower(username) / lower(email) so concurrent registrations cannot slip through either.
 *
 * Existing accounts that differ only in case are never deleted or renamed here: if any exist, the index
 * for that column is skipped and the affected accounts are logged so an admin can resolve them
 * (rename / merge), after which the next start creates the index. Idempotent, runs on every start.
 */
export async function ensureCaseInsensitiveUserUniqueness() {
  if (process.env.USE_SQLITE === "true") return;
  // Schema changes need the owner credentials; the app running as the least-privilege role skips them
  // (the migrate service has run them).
  const db = getMigrationDb();
  if (!db) return;

  for (const column of ['username', 'email'] as const) {
    const indexName = `users_${column}_lower_unique`;
    try {
      const existing = await db.execute(sql`SELECT 1 FROM pg_indexes WHERE tablename = 'users' AND indexname = ${indexName}`);
      if ((existing as any).rows?.length) continue;

      const dupes = await db.execute(sql.raw(
        `SELECT lower("${column}") AS value, string_agg("id"::text || ':' || "username", ', ' ORDER BY "id") AS accounts
         FROM "users" GROUP BY lower("${column}") HAVING count(*) > 1 ORDER BY 1 LIMIT 50`,
      ));
      const rows = ((dupes as any).rows ?? []) as Array<{ value: string; accounts: string }>;
      if (rows.length > 0) {
        logger.warn('db', `Case-insensitive unique index on users.${column} not created: ${rows.length} value(s) are used by several accounts that differ only in case. Rename or merge them; the index is created on the next start. Accounts (id:username): ${rows.map((r) => `[${r.accounts}]`).join(' ')}`);
        continue;
      }

      await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "${indexName}" ON "users" (lower("${column}"))`));
      logger.info('db', `Created case-insensitive unique index ${indexName}`);
    } catch (err) {
      // Never block startup over this safeguard; the case-insensitive lookups still prevent duplicates.
      logger.error('db', `Failed to ensure case-insensitive uniqueness of users.${column}`, err);
    }
  }
}
