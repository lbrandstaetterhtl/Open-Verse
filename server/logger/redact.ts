// server/logger/redact.ts
// Removes personal data and secrets from everything the logger writes (files and stdout).
//
// - Drizzle's query errors carry the bound parameters ("Failed query: <sql>\nparams: <values>"): emails,
//   password hashes, message texts ... Only the SQL text and the Postgres error code / constraint are kept.
// - Values under keys that name secrets (password, token, cookie, session, ...) are replaced by "[redacted]",
//   request/response bodies are never logged, email addresses are masked (a***@example.com).

const SECRET_KEY = /pass(word|wd)?$|^pwd$|secret|token|^authorization$|^cookie$|^set-cookie$|^sess(ion)?$|^session[-_]?id$|^sid$|api[-_]?key|private[-_]?key|^hash$|credential/i;
const BODY_KEY = /^(body|rawBody|requestBody|responseBody|payload)$/i;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const MAX_DEPTH = 6;
const MAX_STRING = 4000;

/** "alice@example.com" -> "a***@example.com" (also inside longer texts). */
export function maskEmails(text: string): string {
  return text.replace(EMAIL, (_m, first: string, domain: string) => `${first}***@${domain}`);
}

/** Drops the "params: ..." part of a Drizzle "Failed query" message (it can span several lines). */
export function stripQueryParams(text: string): string {
  return text.replace(/\nparams:[\s\S]*$/, "");
}

/** Same for a stack trace: the parameter block sits between the message and the first "    at" frame. */
function stripStackParams(stack: string): string {
  return stack.replace(/\nparams:[\s\S]*?(?=\n\s+at\s)/, "");
}

// Postgres messages may quote the offending input after a colon (invalid input syntax for type integer: "abc")
function redactPgMessage(text: string): string {
  return maskEmails(text.replace(/:\s*"[^"]*"/g, ': "[redacted]"'));
}

function truncate(text: string, max = MAX_STRING): string {
  return text.length > max ? `${text.slice(0, max)}... [${text.length - max} more chars]` : text;
}

export function sanitizeText(text: string): string {
  return truncate(maskEmails(stripQueryParams(text)));
}

/** Error -> plain object for the log: name, message (no query params), pg code/constraint, optional stack. */
export function serializeError(err: unknown, withStack: boolean): Record<string, unknown> | string {
  if (!(err instanceof Error)) return sanitizeText(typeof err === "string" ? err : safeString(err));
  const e = err as Error & { code?: unknown; cause?: any; constraint?: unknown; table?: unknown; column?: unknown };
  const out: Record<string, unknown> = { name: e.name, message: sanitizeText(e.message) };
  const cause = e.cause && typeof e.cause === "object" ? e.cause : undefined;
  const code = e.code ?? cause?.code;
  if (typeof code === "string" || typeof code === "number") out.code = code;
  for (const field of ["constraint", "table", "column", "routine"] as const) {
    const v = (e as any)[field] ?? cause?.[field];
    if (typeof v === "string") out[field] = v;
  }
  if (cause instanceof Error && cause !== err) {
    // The pg error: its message names the problem (relation/column/constraint); its `detail` (with the
    // conflicting values) is never logged.
    out.cause = truncate(redactPgMessage(cause.message), 500);
  }
  if (withStack && e.stack) out.stack = truncate(maskEmails(stripStackParams(e.stack)), 8000);
  return out;
}

function safeString(value: unknown): string {
  try { return String(value); } catch { return "[unprintable]"; }
}

/** Deep copy of `value` with secrets, bodies and emails removed. Never throws. */
export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return value;
  if (value instanceof Error) return serializeError(value, false);
  if (typeof value !== "object") return safeString(value);
  if (seen.has(value as object)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[nested]";
  seen.add(value as object);
  if (Buffer.isBuffer(value)) return `[buffer ${value.length} bytes]`;
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => redact(v, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (BODY_KEY.test(key)) { out[key] = "[omitted]"; continue; }
    if (SECRET_KEY.test(key) && v != null && v !== "") { out[key] = "[redacted]"; continue; }
    out[key] = redact(v, depth + 1, seen);
  }
  return out;
}
