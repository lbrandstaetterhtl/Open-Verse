// Optional least-privilege database role (DB_APP_PASSWORD).
//
// Run by the migrations with the owner/superuser connection (DATABASE_URL). Creates or updates the role
// `openverse_app` (DB_APP_USER) with the password DB_APP_PASSWORD and only DML rights:
//   SELECT/INSERT/UPDATE/DELETE on all tables of schema public, USAGE/SELECT on its sequences, the same as
//   default privileges for tables/sequences the migration user creates later. No DDL, no TRUNCATE, no
//   superuser/createdb/createrole, no CREATE on the schema. Server-side timeouts are set for the role too.
// Idempotent: runs on every migration; the password is (re)set each time, so changing DB_APP_PASSWORD only
// needs `docker compose up -d`.
// The password is sent as a SCRAM-SHA-256 verifier, never in clear text (so it cannot appear in a failed
// statement in the Postgres log either).
import crypto from "node:crypto";
import { logger } from "../logger";
import { dbTimeouts } from "../db";

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;

/** SCRAM-SHA-256 verifier as stored in pg_authid (RFC 5802 / 7677), accepted by CREATE/ALTER ROLE PASSWORD. */
export function scramVerifier(password: string, iterations = 4096): string {
  const salt = crypto.randomBytes(16);
  // No SASLprep: node-postgres does not apply it when it logs in either, so both sides use the same bytes
  const salted = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = crypto.createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = crypto.createHash("sha256").update(clientKey).digest();
  const serverKey = crypto.createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  if (value.includes("\0")) throw new Error("invalid character in value");
  return `'${value.replace(/'/g, "''")}'`;
}

function interval(ms: number): string {
  return ms > 0 ? `${ms}ms` : "0";
}

export async function ensureAppRole(client: Queryable, role: string, password: string): Promise<void> {
  if (!IDENT.test(role)) throw new Error("DB_APP_USER must be a lower-case PostgreSQL identifier");
  if (password.length < 12) {
    logger.warn("security", "DB_APP_PASSWORD is shorter than 12 characters; use e.g. `openssl rand -hex 24`");
  }
  const r = quoteIdent(role);
  const me = (await client.query(`SELECT current_user AS u, current_database() AS d, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS su`)).rows[0];
  if (me.u === role) throw new Error(`DATABASE_URL already connects as ${role}; migrations need the owner/superuser credentials`);

  try {
    const existing = (await client.query(
      `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1`, [role],
    )).rows[0];
    const verifier = quoteLiteral(scramVerifier(password));
    if (!existing) {
      await client.query(`CREATE ROLE ${r} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD ${verifier}`);
      logger.info("db", `Created the database role ${role} for the app (least privilege)`);
    } else {
      await client.query(`ALTER ROLE ${r} WITH LOGIN PASSWORD ${verifier}`);
      const extra = ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls"].filter((k) => existing[k]);
      if (extra.length > 0) {
        if (me.su) {
          await client.query(`ALTER ROLE ${r} WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
        } else {
          logger.warn("security", `Role ${role} has extra attributes (${extra.join(", ")}) that only a superuser can remove`);
        }
      }
    }
  } catch (err: any) {
    // Do not pass the error on: a failed CREATE/ALTER ROLE statement contains the (hashed) password
    const code = err?.code ?? err?.cause?.code;
    const reason = code === "42501" ? "the DATABASE_URL user may not create roles (needs CREATEROLE or superuser)" : `error code ${code ?? "unknown"}`;
    throw new Error(`Could not create/update the database role ${role}: ${reason}`);
  }

  const statements = [
    `ALTER ROLE ${r} SET statement_timeout = '${interval(dbTimeouts.statementTimeoutMs)}'`,
    `ALTER ROLE ${r} SET idle_in_transaction_session_timeout = '${interval(dbTimeouts.idleInTransactionTimeoutMs)}'`,
    `GRANT CONNECT ON DATABASE ${quoteIdent(me.d)} TO ${r}`,
    `GRANT USAGE ON SCHEMA public TO ${r}`,
    // Up to PostgreSQL 14 every role may create tables in schema public
    `REVOKE CREATE ON SCHEMA public FROM PUBLIC`,
    `REVOKE CREATE ON SCHEMA public FROM ${r}`,
    `REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM ${r}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${r}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${r}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${r}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${r}`,
  ];
  for (const statement of statements) {
    await client.query(statement);
  }
  logger.info("db", `Database role ${role}: DML rights on schema public granted (no DDL)`);
}
