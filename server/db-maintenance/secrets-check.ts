// Startup warnings for placeholder or weak secrets. Never refuses to start (existing .env files keep working),
// but the warning is printed to stdout (`docker compose logs app`) with instructions.
import { logger } from "../logger";

// Values shipped in .env.example / docs over time
const PLACEHOLDERS = new Set([
  "change-me-to-a-long-random-string",
  "change-me-to-a-strong-password",
  "change-me",
  "changeme",
  "secret",
  "password",
  "postgres",
  "openverse",
  "your-secret",
  "your-session-secret",
  "keyboard cat",
]);

function weakness(value: string | undefined, minLength: number): string | null {
  if (!value) return null;
  const v = value.trim();
  if (PLACEHOLDERS.has(v.toLowerCase()) || /^change[-_ ]?me/i.test(v) || /^your[-_ ]/i.test(v)) return "is a placeholder value from the example configuration";
  if (v.length < minLength) return `is shorter than ${minLength} characters`;
  if (new Set(v).size < 6) return "has too few different characters";
  return null;
}

function passwordFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const p = new URL(url).password;
    return p ? decodeURIComponent(p) : undefined;
  } catch {
    return undefined;
  }
}

let checked = false;

export function warnAboutWeakSecrets(): void {
  if (checked) return;
  checked = true;
  const problems: string[] = [];

  const session = weakness(process.env.SESSION_SECRET, 32);
  if (session) problems.push(`SESSION_SECRET ${session}. Generate one with: openssl rand -hex 32 (all users are logged out once when it changes).`);

  if (process.env.USE_SQLITE !== "true") {
    const dbPassword = passwordFromUrl(process.env.DATABASE_URL);
    const db = weakness(dbPassword, 16);
    if (db) problems.push(`The database password (POSTGRES_PASSWORD / DATABASE_URL) ${db}. Generate one with: openssl rand -hex 24 — changing POSTGRES_PASSWORD in .env does NOT change an already initialised database; see DEPLOYMENT.md ("Passwörter ändern").`);
  }
  const appPassword = weakness(process.env.DB_APP_PASSWORD, 16);
  if (appPassword) problems.push(`DB_APP_PASSWORD ${appPassword}. Generate one with: openssl rand -hex 24`);

  for (const problem of problems) {
    logger.warn("security", `Weak secret: ${problem}`);
  }
}
