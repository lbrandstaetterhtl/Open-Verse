// Runner for migrations/*.sql (PostgreSQL).
//
// - Every applied file is recorded in the journal table "openverse_schema_migrations" (name, sha256, time) and
//   is not run again.
// - Each file runs as a whole (simple query protocol, so DO $$ ... $$ blocks and functions work) inside its own
//   transaction: a failing file leaves no partial schema behind. A file whose first line contains
//   "-- migrate:no-transaction" (needed for CREATE INDEX CONCURRENTLY) runs statement by statement
//   (split on "--> statement-breakpoint") without a transaction.
// - Databases set up before the journal existed: the old runner executed every file on each start. When a
//   file fails here with "already exists" (table, index, constraint, column ...), it was applied by the old
//   runner: the transaction is rolled back and the file is recorded as applied.
// - A session advisory lock keeps two processes (migrate service and app, several app instances) from
//   migrating at the same time.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "../logger";

export const JOURNAL_TABLE = "openverse_schema_migrations";
const LOCK_KEY = "4711060520260101"; // arbitrary constant (bigint)
const ALREADY_EXISTS = new Set(["42P07", "42710", "42701", "42P06", "42723", "42P16"]);
const NO_TX_MARKER = /^\s*--\s*migrate:no-transaction/;

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };
type PoolLike = { connect: () => Promise<Queryable & { release: (err?: any) => void }> };

export interface MigrationResult {
  applied: string[];
  baselined: string[];
  skipped: string[];
}

export function migrationsDir(): string {
  return path.join(process.cwd(), "migrations");
}

export function listMigrationFiles(dir = migrationsDir()): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
}

function checksum(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function isAlreadyExists(err: any): boolean {
  const code = err?.code ?? err?.cause?.code;
  return ALREADY_EXISTS.has(code) || /already exists/i.test(String(err?.message ?? ""));
}

export async function ensureJournal(client: Queryable) {
  await client.query(`CREATE TABLE IF NOT EXISTS "${JOURNAL_TABLE}" (
    "name" text PRIMARY KEY,
    "checksum" text NOT NULL,
    "applied_at" timestamptz NOT NULL DEFAULT now(),
    "note" text
  )`);
}

async function record(client: Queryable, name: string, sum: string, note: string | null) {
  await client.query(
    `INSERT INTO "${JOURNAL_TABLE}" ("name", "checksum", "note") VALUES ($1, $2, $3) ON CONFLICT ("name") DO NOTHING`,
    [name, sum, note],
  );
}

/** Files of migrations/ that are not in the journal (null if the journal table does not exist). */
export async function pendingMigrations(client: Queryable, dir = migrationsDir()): Promise<string[] | null> {
  const exists = await client.query(`SELECT to_regclass($1) AS t`, [`public.${JOURNAL_TABLE}`]);
  if (!exists.rows[0]?.t) return null;
  const done = new Set((await client.query(`SELECT "name" FROM "${JOURNAL_TABLE}"`)).rows.map((r: any) => r.name));
  return listMigrationFiles(dir).filter((f) => !done.has(f));
}

export async function runSqlMigrations(pool: PoolLike, dir = migrationsDir()): Promise<MigrationResult> {
  const result: MigrationResult = { applied: [], baselined: [], skipped: [] };
  const files = listMigrationFiles(dir);
  if (files.length === 0) {
    logger.warn("db", `No SQL migration files found in ${dir}`);
    return result;
  }

  const client = await pool.connect();
  let released = false;
  try {
    // statement_timeout 0: index builds on large tables may take minutes
    await client.query(`SET statement_timeout = 0`);
    await client.query(`SELECT pg_advisory_lock(${LOCK_KEY})`);
    await ensureJournal(client);
    const applied = new Map<string, string>(
      (await client.query(`SELECT "name", "checksum" FROM "${JOURNAL_TABLE}"`)).rows.map((r: any) => [r.name, r.checksum]),
    );

    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      const sum = checksum(content);
      if (applied.has(file)) {
        if (applied.get(file) !== sum) {
          logger.warn("db", `Migration ${file} was changed after it was applied; it is not run again (add a new migration file for further changes)`);
        }
        result.skipped.push(file);
        continue;
      }

      if (NO_TX_MARKER.test(content)) {
        // Every statement of such a file must be idempotent (IF NOT EXISTS ...)
        const statements = content.split(/-->\s*statement-breakpoint/).map((s) => s.trim()).filter(Boolean);
        for (const statement of statements) await client.query(statement);
        await record(client, file, sum, null);
        result.applied.push(file);
        logger.info("db", `Applied migration ${file} (without transaction)`);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(content);
        await record(client, file, sum, null);
        await client.query("COMMIT");
        result.applied.push(file);
        logger.info("db", `Applied migration ${file}`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (!isAlreadyExists(err)) {
          logger.critical("db", `Migration ${file} failed and was rolled back`, err);
          throw err;
        }
        // Applied by the runner of earlier versions (no journal): keep the schema as it is, record the file
        await record(client, file, sum, "already applied before the migration journal existed");
        result.baselined.push(file);
        logger.info("db", `Migration ${file} was already applied (recorded in the migration journal)`);
      }
    }
  } finally {
    try {
      await client.query(`SELECT pg_advisory_unlock(${LOCK_KEY})`);
      await client.query(`RESET statement_timeout`);
    } catch (err) {
      // Connection broken: drop it from the pool instead of reusing it
      client.release(err);
      released = true;
    }
    if (!released) client.release();
  }
  return result;
}
