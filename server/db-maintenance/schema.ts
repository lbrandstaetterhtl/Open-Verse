// Schema migrations for PostgreSQL: SQL files (journal), then the optional least-privilege app role.
// Used by the app at startup (server/db-migrations.ts runMigrations) and by the one-shot migrate entrypoint
// (server/db-maintenance/migrate.ts, docker-compose service `migrate`).
import { logger } from "../logger";
import { appRoleName, dbRoleMode, getMigrationPool, pool } from "../db";
import { pendingMigrations, runSqlMigrations } from "./sql-migrations";
import { ensureAppRole } from "./app-role";

/** True when this process may change the schema (not SQLite, not the app-only role). */
export function canRunDdl(): boolean {
  return process.env.USE_SQLITE !== "true" && getMigrationPool() !== null;
}

export async function runSchemaMigrations(): Promise<void> {
  if (process.env.USE_SQLITE === "true") return;

  const migrationPool = getMigrationPool();
  if (!migrationPool) {
    await checkAppliedAsAppRole();
    return;
  }

  const result = await runSqlMigrations(migrationPool as any);
  logger.info("db", `Migrations: ${result.applied.length} applied, ${result.baselined.length} recorded as already applied, ${result.skipped.length} up to date`, {
    applied: result.applied,
    baselined: result.baselined,
  });

  const appPassword = process.env.DB_APP_PASSWORD?.trim();
  if (appPassword) {
    const client = await (migrationPool as any).connect();
    try {
      await ensureAppRole(client, appRoleName, appPassword);
    } finally {
      client.release();
    }
  }
}

/**
 * App-only mode (the app connects as openverse_app and has no DDL rights): migrations were run by the migrate
 * service. Only check that they are complete, so a forgotten migrate step shows up clearly in the log.
 */
async function checkAppliedAsAppRole() {
  if (!pool) return;
  try {
    const pending = await pendingMigrations(pool as any);
    if (pending === null) {
      logger.error("db", `The app runs as the database role ${appRoleName} (no DDL rights) but the migration journal is missing: run the migrations with the owner credentials first (docker compose run --rm migrate)`);
    } else if (pending.length > 0) {
      logger.error("db", `The app runs as the database role ${appRoleName} (no DDL rights) and ${pending.length} migration(s) are not applied: ${pending.join(", ")}. Run: docker compose run --rm migrate`);
    } else {
      logger.info("db", `Schema is up to date; the app uses the least-privilege role ${appRoleName} (mode ${dbRoleMode})`);
    }
  } catch (err) {
    logger.error("db", "Could not check the migration journal", err);
  }
}
