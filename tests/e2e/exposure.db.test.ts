// Regression tests for the database / exposure findings (EXP-DB-*): log sanitising, secrets at rest, token
// hashing, migration journal and indexes, pool robustness, data retention and account data purge, SQLite file
// protection. Tests that need direct database access run only with E2E_DATABASE_URL (the database of the
// server under test) and only touch rows they create.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Client, RUN_ID, ADMIN_USER, ADMIN_PASSWORD, newUser, expectStatus } from "./client";

const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "";
const needsDb = DATABASE_URL ? false : "E2E_DATABASE_URL not set";
const needsAdmin = ADMIN_USER && ADMIN_PASSWORD ? false : "E2E_ADMIN_USER / E2E_ADMIN_PASSWORD not set";
const REPO = path.resolve(import.meta.dirname, "../..");

// The server modules read DATABASE_URL when they are first imported
if (DATABASE_URL) {
  process.env.DATABASE_URL = DATABASE_URL;
  process.env.USE_SQLITE = "false";
  process.env.SESSION_SECRET ??= "exposure-db-test-secret-0123456789abcdef";
  process.env.DATA_RETENTION_DISABLED = "true";
}

let pgClient: any = null;
async function q(text: string, values: unknown[] = []): Promise<any[]> {
  if (!pgClient) {
    const pg = (await import("pg")).default;
    pgClient = new pg.Client({ connectionString: DATABASE_URL });
    await pgClient.connect();
  }
  return (await pgClient.query(text, values)).rows;
}

after(async () => {
  await pgClient?.end().catch(() => undefined);
  if (DATABASE_URL) {
    const { closeDb } = await import("../../server/db");
    await closeDb().catch(() => undefined);
  }
});

// ---------------------------------------------------------------------------------------------
describe("EXP-DB-5: logs never contain query parameters, secrets or emails", () => {
  test("Drizzle 'Failed query' errors lose their params; pg code and constraint stay", async () => {
    const { serializeError, redact, sanitizeText } = await import("../../server/logger/redact");
    const { DrizzleQueryError } = await import("drizzle-orm/errors");
    const cause = Object.assign(new Error('duplicate key value violates unique constraint "users_email_unique"'), {
      code: "23505", constraint: "users_email_unique", table: "users", detail: "Key (email)=(victim@example.com) already exists.",
    });
    const err = new DrizzleQueryError("insert into users (email, password) values ($1, $2)", ["victim@example.com", "$2b$12$secrethash"], cause);
    assert.match(err.message, /params:/, "precondition: drizzle puts params into the message");
    const out = serializeError(err, true) as Record<string, any>;
    const text = JSON.stringify(out);
    assert.match(out.message, /^Failed query: insert into users/);
    assert.equal(out.code, "23505");
    assert.equal(out.constraint, "users_email_unique");
    assert.ok(!text.includes("victim@example.com"), text);
    assert.ok(!text.includes("secrethash"), text);
    assert.ok(!text.includes("params:"), text);

    const data = redact({ password: "hunter2", csrfToken: "abc", body: { a: 1 }, nested: { email: "alice@example.com", apiKey: "k" }, ok: 1 }) as any;
    assert.equal(data.password, "[redacted]");
    assert.equal(data.csrfToken, "[redacted]");
    assert.equal(data.body, "[omitted]");
    assert.equal(data.nested.apiKey, "[redacted]");
    assert.equal(data.nested.email, "a***@example.com");
    assert.equal(data.ok, 1);
    assert.equal(sanitizeText("Failed query: select 1\nparams: x@y.de,secret"), "Failed query: select 1");
  });

  test("console.error output of the server process is sanitised too", () => {
    const script = `
      import { logger } from "./server/logger/index.ts";
      import { DrizzleQueryError } from "drizzle-orm/errors";
      console.error("Failed to fetch:", new DrizzleQueryError("select * from users where email = $1", ["leak@example.com"], new Error("boom")));
      logger.error("db", "query failed", new DrizzleQueryError("update users set password = $1", ["$2b$12$leakedhash"], new Error("x")), { password: "pw-leak" });
      logger.shutdown();`;
    const r = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      cwd: REPO, encoding: "utf8", env: { ...process.env, NODE_ENV: "production" },
    });
    const out = r.stdout + r.stderr;
    assert.match(out, /Failed query: select \* from users/);
    assert.ok(!out.includes("leak@example.com"), out);
    assert.ok(!out.includes("leakedhash"), out);
    assert.ok(!out.includes("pw-leak"), out);
  });

  test("log files are not world-readable (0640)", { skip: fs.existsSync(path.join(REPO, "logs/combined.log")) ? false : "no logs/ in this checkout" }, () => {
    const mode = fs.statSync(path.join(REPO, "logs/combined.log")).mode & 0o777;
    assert.equal(mode & 0o007, 0, `combined.log mode ${mode.toString(8)}`);
  });
});

// ---------------------------------------------------------------------------------------------
describe("EXP-DB-11 / EXP-DB-14: secrets at rest", () => {
  test("secret settings are AES-GCM encrypted, legacy clear text is still readable", async () => {
    process.env.SESSION_SECRET ??= "exposure-db-test-secret-0123456789abcdef";
    const { encryptSecret, decryptSecret, isEncryptedSecret } = await import("../../server/db-maintenance/secret-box");
    const enc = encryptSecret("smtp-pass-123");
    assert.ok(isEncryptedSecret(enc));
    assert.ok(!enc.includes("smtp-pass-123"));
    assert.notEqual(encryptSecret("smtp-pass-123"), enc, "random IV");
    assert.equal(decryptSecret(enc), "smtp-pass-123");
    assert.equal(decryptSecret("legacy-plain"), "legacy-plain");
    assert.equal(decryptSecret(enc.slice(0, -2) + "AA"), null, "tampered value is rejected");
    assert.equal(encryptSecret(""), "");
  });

  test("verification tokens are hashed (sha256) and compared in constant time", async () => {
    const { hashToken, tokenMatchesHash } = await import("../../server/db-maintenance/token-hash");
    const token = "a".repeat(64);
    const h = hashToken(token);
    assert.match(h, /^[a-f0-9]{64}$/);
    assert.notEqual(h, token);
    assert.ok(tokenMatchesHash(token, h));
    assert.ok(!tokenMatchesHash("b".repeat(64), h));
  });

  test("SCRAM verifier for the app role has the pg_authid format", async () => {
    const { scramVerifier } = await import("../../server/db-maintenance/app-role");
    assert.match(scramVerifier("pw"), /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]{24}\$[A-Za-z0-9+/=]{44}:[A-Za-z0-9+/=]{44}$/);
  });

  test("smtp_password: masked in the API, encrypted in the database, the mask never overwrites it", { skip: needsDb || needsAdmin }, async () => {
    const owner = new Client();
    await expectStatus(await owner.login(ADMIN_USER, ADMIN_PASSWORD), 200);
    const list = await (await owner.get("/api/admin/settings")).json();
    const setting = list.find((s: any) => s.category === "email" && s.key === "smtp_password");
    assert.ok(setting, "smtp_password setting exists");
    const [before] = await q(`SELECT value FROM admin_settings WHERE id = $1`, [setting.id]);
    const secret = `smtp-${RUN_ID}-secret`;
    try {
      await expectStatus(await owner.patch(`/api/admin/settings/${setting.id}`, { value: secret }), 200);
      const [row] = await q(`SELECT value FROM admin_settings WHERE id = $1`, [setting.id]);
      assert.match(row.value, /^enc:v1:/);
      assert.ok(!row.value.includes(secret));
      const text = await (await owner.get("/api/admin/settings")).text();
      assert.ok(!text.includes(secret), "secret is never returned");
      await expectStatus(await owner.patch(`/api/admin/settings/${setting.id}`, { value: "********" }), 200);
      const [after] = await q(`SELECT value FROM admin_settings WHERE id = $1`, [setting.id]);
      assert.equal(after.value, row.value, "saving the mask keeps the stored secret");
      const logs = await q(`SELECT old_value, new_value FROM activity_logs WHERE action = 'admin.settings_change' AND target_id = 'smtp_password' ORDER BY id DESC LIMIT 3`);
      for (const l of logs) assert.ok(!`${l.old_value}${l.new_value}`.includes(secret));
    } finally {
      await q(`UPDATE admin_settings SET value = $2 WHERE id = $1`, [setting.id, before?.value ?? ""]);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("EXP-DB-1 / EXP-DB-12: migrations, journal and indexes", { skip: needsDb }, () => {
  test("every migration file is recorded in the journal", async () => {
    const files = fs.readdirSync(path.join(REPO, "migrations")).filter((f) => f.endsWith(".sql")).sort();
    const rows = await q(`SELECT name FROM openverse_schema_migrations`);
    const done = new Set(rows.map((r) => r.name));
    for (const f of files) assert.ok(done.has(f), `${f} not in the journal`);
  });

  test("the hot-lookup indexes of 0004 exist and are used", async () => {
    const sqlText = fs.readFileSync(path.join(REPO, "migrations/0004_hot_indexes.sql"), "utf8");
    const names = [...sqlText.matchAll(/CREATE INDEX IF NOT EXISTS "([^"]+)"/g)].map((m) => m[1]);
    assert.ok(names.length >= 25);
    const existing = new Set((await q(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`)).map((r) => r.indexname));
    for (const n of names) assert.ok(existing.has(n), `index ${n} missing`);

    // Index availability for the per-request checks (seq scans disabled so the small test tables don't hide it)
    await q("BEGIN");
    try {
      await q("SET LOCAL enable_seqscan = off");
      const plan = async (sql: string) => (await q(`EXPLAIN ${sql}`)).map((r) => r["QUERY PLAN"]).join("\n");
      assert.match(await plan(`SELECT * FROM bans WHERE is_active = 1 AND (ip_address = '1.2.3.4' OR device_fingerprint = 'x' OR user_id = 1)`), /bans_(ip|device|user)_idx/);
      assert.match(await plan(`SELECT count(*) FROM activity_logs WHERE action = 'auth.login_failed' AND (user_id = 1 OR ip_address = '1.2.3.4') AND created_at > now() - interval '15 minutes'`), /activity_logs_\w+_idx/);
      assert.match(await plan(`SELECT * FROM notifications WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20`), /notifications_user_created_idx/);
    } finally {
      await q("ROLLBACK");
    }
  });

  test("reports.ip_address of existing reports was cleared by 0005", async () => {
    const [m] = await q(`SELECT applied_at FROM openverse_schema_migrations WHERE name = '0005_privacy_cleanup.sql'`);
    const [r] = await q(`SELECT count(*)::int AS n FROM reports WHERE ip_address IS NOT NULL AND created_at < $1`, [m.applied_at]);
    assert.equal(r.n, 0);
  });

  test("the migration runner is idempotent: a second run applies nothing", async () => {
    const { runSqlMigrations } = await import("../../server/db-maintenance/sql-migrations");
    const { getMigrationPool } = await import("../../server/db");
    const result = await runSqlMigrations(getMigrationPool() as any, path.join(REPO, "migrations"));
    assert.deepEqual(result.applied, []);
    assert.deepEqual(result.baselined, []);
  });

  test("a file that fails inside its transaction leaves no partial schema", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ovmig-"));
    const table = `exp_db_tx_${RUN_ID}`;
    fs.writeFileSync(path.join(dir, "9999_broken.sql"), `CREATE TABLE "${table}" (id int);\n--> statement-breakpoint\nSELECT * FROM "no_such_table_${RUN_ID}";`);
    const { runSqlMigrations } = await import("../../server/db-maintenance/sql-migrations");
    const { getMigrationPool } = await import("../../server/db");
    await assert.rejects(runSqlMigrations(getMigrationPool() as any, dir));
    const [t] = await q(`SELECT to_regclass($1) AS t`, [table]);
    assert.equal(t.t, null, "the CREATE TABLE was rolled back");
    const [j] = await q(`SELECT count(*)::int AS n FROM openverse_schema_migrations WHERE name = '9999_broken.sql'`);
    assert.equal(j.n, 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------------------------
describe("EXP-DB-6: the app survives dropped database connections", { skip: needsDb }, () => {
  test("terminating the server's connections (as a Postgres restart does) does not take it down", async () => {
    const c = new Client();
    for (let i = 0; i < 10; i++) await c.get("/api/posts");
    const killed = await q(`SELECT count(pg_terminate_backend(pid))::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND application_name = 'open-verse' AND pid <> pg_backend_pid()`);
    assert.ok(killed[0].n > 0, "no server connections found (application_name open-verse)");
    await new Promise((r) => setTimeout(r, 500));
    for (let i = 0; i < 5; i++) {
      const res = await c.get("/api/posts");
      assert.equal(res.status, 200);
    }
    assert.equal((await c.get("/api/health")).status, 200);
  });

  test("runtime connections have statement and idle-in-transaction timeouts", async () => {
    const { db } = await import("../../server/db");
    const { sql } = await import("drizzle-orm");
    const r = await db.execute(sql`SELECT current_setting('statement_timeout') AS st, current_setting('idle_in_transaction_session_timeout') AS it`);
    const row = (r as any).rows[0];
    assert.notEqual(row.st, "0");
    assert.notEqual(row.it, "0");
  });
});

// ---------------------------------------------------------------------------------------------
describe("EXP-DB-4: retention and account data purge", { skip: needsDb }, () => {
  let userId = 0;
  let username = "";
  before(async () => {
    const u = await newUser("expdb");
    userId = u.id;
    username = u.username;
  });
  after(async () => {
    if (!userId) return;
    for (const t of ["activity_logs", "anomaly_events", "reports", "verification_tokens", "saved_posts", "notification_preferences", "themes"]) {
      const col = t === "reports" ? "reporter_id" : "user_id";
      await q(`DELETE FROM ${t} WHERE ${col} = $1`, [userId]).catch(() => undefined);
    }
    await q(`DELETE FROM bans WHERE user_id = $1`, [userId]);
    await q(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  test("daily retention deletes old activity logs / anomaly events and expired tokens, keeps recent ones", async () => {
    const old = await q(`INSERT INTO activity_logs (user_id, action, category, description, ip_address, created_at)
      VALUES ($1, 'exp.old', 'auth', 'old', '198.51.100.7', now() - interval '400 days'),
             ($1, 'exp.new', 'auth', 'new', '198.51.100.8', now()) RETURNING id, action`, [userId]);
    const [anomaly] = await q(`INSERT INTO anomaly_events (user_id, anomaly_type, title, description, created_at)
      VALUES ($1, 'exp_old', 'old', 'old', now() - interval '400 days') RETURNING id`, [userId]);
    await q(`INSERT INTO verification_tokens (token, user_id, expires_at) VALUES ($1, $2, now() - interval '1 day')`, [`exp-${RUN_ID}-expired`, userId]);
    const { runDataRetention } = await import("../../server/db-maintenance/retention");
    const summary = await runDataRetention();
    assert.ok(summary.retentionDays > 0);
    const left = await q(`SELECT action FROM activity_logs WHERE id = ANY($1)`, [old.map((r) => r.id)]);
    assert.deepEqual(left.map((r) => r.action), ["exp.new"]);
    assert.equal((await q(`SELECT 1 FROM anomaly_events WHERE id = $1`, [anomaly.id])).length, 0);
    assert.equal((await q(`SELECT 1 FROM verification_tokens WHERE token = $1`, [`exp-${RUN_ID}-expired`])).length, 0);
  });

  test("purgeAccountData removes / anonymises the account's personal data", async () => {
    await q(`INSERT INTO activity_logs (user_id, user_email, user_username, action, category, description, ip_address, user_agent)
      VALUES ($1, 'p@example.com', $2, 'post.create', 'content', 'own action', '198.51.100.9', 'UA'),
             ($1, 'p@example.com', $2, 'admin.ban', 'admin', 'staff action', '198.51.100.9', 'UA')`, [userId, username]);
    await q(`INSERT INTO activity_logs (action, category, description, target_type, target_id, target_label, old_value)
      VALUES ('admin.user_update', 'users', 'about the account', 'User', $1, $2, 'p@example.com')`, [String(userId), username]);
    await q(`INSERT INTO anomaly_events (user_id, anomaly_type, title, description, evidence) VALUES ($1, 'exp_purge', 't', 'IP 198.51.100.9', '{"ip":"198.51.100.9"}')`, [userId]);
    const [ban] = await q(`INSERT INTO bans (ban_type, user_id, ip_address, device_fingerprint, reason) VALUES ('account', $1, '198.51.100.9', $2, 'exp test') RETURNING id`, [userId, "f".repeat(32)]);
    await q(`INSERT INTO reports (reason, reporter_id, ip_address) VALUES ('exp test', $1, '198.51.100.9')`, [userId]);
    await q(`INSERT INTO verification_tokens (token, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')`, [`exp-${RUN_ID}-live`, userId]);

    const { db } = await import("../../server/db");
    const { purgeAccountData } = await import("../../server/db-maintenance/account-data");
    const summary = await db.transaction((tx: any) => purgeAccountData(tx, userId));
    assert.ok(summary.activityLogsDeleted >= 1);
    assert.equal(summary.activityLogsAnonymised, 1);

    assert.equal((await q(`SELECT 1 FROM activity_logs WHERE user_id = $1`, [userId])).length, 0);
    const staff = await q(`SELECT user_email, user_username, ip_address, user_agent FROM activity_logs WHERE description = 'staff action' AND action = 'admin.ban' AND user_id IS NULL ORDER BY id DESC LIMIT 1`);
    assert.deepEqual(staff[0], { user_email: null, user_username: null, ip_address: null, user_agent: null });
    const about = await q(`SELECT target_label, old_value FROM activity_logs WHERE target_type = 'User' AND target_id = $1`, [String(userId)]);
    for (const a of about) assert.deepEqual(a, { target_label: null, old_value: null });
    assert.equal((await q(`SELECT 1 FROM anomaly_events WHERE user_id = $1`, [userId])).length, 0);
    const [b] = await q(`SELECT ip_address, device_fingerprint, reason FROM bans WHERE id = $1`, [ban.id]);
    assert.deepEqual(b, { ip_address: null, device_fingerprint: null, reason: "exp test" }, "the ban stays, without IP/device");
    assert.equal((await q(`SELECT 1 FROM reports WHERE reporter_id = $1`, [userId])).length, 0);
    assert.equal((await q(`SELECT 1 FROM verification_tokens WHERE user_id = $1`, [userId])).length, 0);
    assert.equal((await q(`SELECT 1 FROM session WHERE sess LIKE $1`, [`%"passport":{"user":${userId}}%`])).length, 0, "sessions of the account are gone");
  });
});

// ---------------------------------------------------------------------------------------------
describe("EXP-DB-10: SQLite database file protection", () => {
  const run = (sqlitePath: string) => spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `await import("./server/db.ts"); process.exit(0);`], {
    cwd: REPO, encoding: "utf8",
    env: { ...process.env, USE_SQLITE: "true", SQLITE_PATH: sqlitePath, NODE_ENV: "production", DATABASE_URL: "" },
  });

  test("a database path inside the public uploads folder is refused", () => {
    const target = path.join(REPO, "uploads", `exp-db-${RUN_ID}.db`);
    const r = run(target);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /inside the public uploads folder/);
    assert.ok(!fs.existsSync(target), "no file was created in uploads/");
  });

  test("the database file is created with mode 0600", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ovsqlite-"));
    const file = path.join(dir, "data", "local.db");
    const r = run(file);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    for (const extra of [`${file}-wal`, `${file}-shm`]) {
      if (fs.existsSync(extra)) assert.equal(fs.statSync(extra).mode & 0o077, 0, extra);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
