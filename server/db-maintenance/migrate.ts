// One-shot migration entrypoint: `node dist/db-maintenance/migrate.js` (docker-compose service `migrate`)
// or `npm run db:migrate` (tsx, reads .env).
// Applies all schema changes with the DATABASE_URL credentials (owner/superuser) and, if DB_APP_PASSWORD is
// set, creates/updates the least-privilege role openverse_app the app then connects with. Exit code 0 on
// success, 1 on failure (the app service only starts after a successful run).
import "dotenv/config";
import { logger } from "../logger";
import { closeDb, getMigrationPool } from "../db";
import { runSchemaMigrations } from "./schema";
import { ensurePostgresColumns } from "../migrations/ensure_postgres_columns";
import { ensureCaseInsensitiveUserUniqueness } from "../migrations/user_case_uniqueness";

async function main() {
  if (process.env.USE_SQLITE === "true") {
    console.log("[migrate] SQLite mode: the app creates its schema itself, nothing to do");
    return;
  }
  if (!getMigrationPool()) {
    throw new Error("No migration credentials: DATABASE_URL must be set (owner/superuser) and DB_APP_USER must not be set for the migrate step");
  }
  console.log("[migrate] Applying database migrations...");
  await runSchemaMigrations();
  await ensurePostgresColumns();
  await ensureCaseInsensitiveUserUniqueness();
  console.log(process.env.DB_APP_PASSWORD?.trim()
    ? "[migrate] Done. The app connects as the least-privilege role (DB_APP_PASSWORD is set)."
    : "[migrate] Done.");
}

main()
  .then(async () => {
    await closeDb();
    logger.shutdown();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.critical("db", "Migration failed", err);
    console.error("[migrate] FAILED:", err);
    await closeDb().catch(() => undefined);
    logger.shutdown();
    process.exit(1);
  });
