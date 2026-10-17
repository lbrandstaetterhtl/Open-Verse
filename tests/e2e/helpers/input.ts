// Helpers for the input robustness suite (tests/e2e/input-fuzz.test.ts).
import { BASE_URL, Client, freshIp, newUser } from "../client";

export type Sent = { status: number; text: string; contentType: string; timedOut: boolean; ms: number };
export type Payload = { label: string; json?: unknown; raw?: string };

const TIMEOUT_MS = 15_000;

/** Sends a request with the client's session, CSRF token and IP; `raw` sends the text unchanged as JSON. */
export async function send(client: Client, method: string, path: string, body?: Payload, ip = client.ip): Promise<Sent> {
  const headers: Record<string, string> = { "x-forwarded-for": ip };
  if (client.cookies.size > 0) headers.cookie = [...client.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  if (method !== "GET" && client.csrfToken) headers["x-csrf-token"] = client.csrfToken;
  let data: string | undefined;
  if (body && (body.raw !== undefined || body.json !== undefined)) {
    headers["content-type"] = "application/json";
    data = body.raw ?? JSON.stringify(body.json);
  }
  const started = Date.now();
  try {
    const res = await fetch(BASE_URL + path, { method, headers, body: data, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { status: res.status, text: await res.text(), contentType: res.headers.get("content-type") ?? "", timedOut: false, ms: Date.now() - started };
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { status: 0, text: "", contentType: "", timedOut: true, ms: Date.now() - started };
    }
    throw err;
  }
}

/** A second client on the same session but another IP, so per-IP rate limits of long batteries don't kick in. */
export function withIp(client: Client): Client {
  const copy = new Client(freshIp());
  for (const [k, v] of client.cookies) copy.cookies.set(k, v);
  copy.csrfToken = client.csrfToken;
  return copy;
}

// Things that must never show up in an answer: database/driver errors, stack traces, server paths, password hashes.
const LEAKS: Array<[RegExp, string]> = [
  [/Failed query|syntax error at or near|invalid input syntax|violates (?:not-null|unique|foreign key|check)|duplicate key value|out of range for type|PostgresError|DrizzleError|No values to set/i, "database error text"],
  [/\n\s+at [^\n]+:\d+:\d+|\bat (?:async )?[\w.<>]+ \([^)]*:\d+:\d+\)/, "stack trace"],
  [/\/home\/|node_modules|[\w-]+\.ts:\d+/, "server file path"],
  [/TypeError|ReferenceError|RangeError|Cannot read propert/i, "JavaScript error text"],
  [/\$2[aby]\$\d\d\$/, "password hash"],
];

/** Returns a problem description, or null when the answer is a clean 2xx/3xx/4xx. */
export function problem(r: Sent): string | null {
  if (r.timedOut) return `no answer within ${TIMEOUT_MS / 1000}s`;
  if (r.status >= 500) return `HTTP ${r.status} ${r.text.slice(0, 120)}`;
  for (const [re, what] of LEAKS) {
    const m = r.text.match(re);
    if (m) return `HTTP ${r.status} leaks ${what}: …${r.text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + 80)}…`;
  }
  return null;
}

export function failMessage(route: string, failures: string[]): string {
  return `${route}: ${failures.length} unsafe answer(s)\n  ` + failures.slice(0, 25).join("\n  ") + (failures.length > 25 ? `\n  … ${failures.length - 25} more` : "");
}

// ---------------------------------------------------------------------------------------------
// Payloads

const nested = (depth: number): unknown => (depth === 0 ? "leaf" : { a: nested(depth - 1) });
const nestedArray = (depth: number): unknown => (depth === 0 ? 1 : [nestedArray(depth - 1)]);

/** Whole-body shapes that are never a valid request. */
export const SHAPES: Payload[] = [
  { label: "{}", json: {} },
  { label: "[]", json: [] },
  { label: "null", raw: "null" },
  { label: '"string"', raw: '"string"' },
  { label: "123", raw: "123" },
  { label: "true", raw: "true" },
  { label: "[1,2,3]", json: [1, 2, 3] },
  { label: "[{}]", json: [{}] },
  { label: "object nested 50 deep", json: nested(50) },
  { label: "array nested 50 deep", json: nestedArray(50) },
  { label: "broken JSON", raw: '{"a":' },
  { label: "__proto__ pollution", raw: '{"__proto__":{"isAdmin":true,"role":"owner","karma":99999}}' },
  { label: "constructor.prototype pollution", raw: '{"constructor":{"prototype":{"isAdmin":true,"role":"owner"}}}' },
];

export const SQLI = "' OR '1'='1' --";
export const SQLI_UNION = "1 UNION SELECT password FROM users--";
export const SQLI_STACKED = "1; DROP TABLE users; --";
export const UNICODE = "𝔘𝔫𝔦𝔠𝔬𝔡𝔢 🙂👍🏽 عربى ‮gnp.exe‬ zero​width﻿";
export const NUL = "before\u0000after";
export const CRLF = "line1\r\nSet-Cookie: injected=1\r\n\r\nbody";
export const TRAVERSAL = "../../../../etc/passwd";
export const XSS = "<script>alert(1)</script><img src=x onerror=alert(1)>";

/** Values of the wrong type or at a boundary for any field. */
export const WRONG_TYPES: unknown[] = [
  null, 0, -1, 1.5, 1e20, 2147483648, true, false, "", "   ", "abc", [], [1, 2], {}, { $gt: "" }, { $ne: null },
];
/** Hostile strings: injection, unicode, control characters. */
export const HOSTILE_STRINGS: string[] = [SQLI, SQLI_UNION, SQLI_STACKED, '{"$where":"sleep(1000)"}', UNICODE, NUL, CRLF, TRAVERSAL, XSS];
export const FIELD_VALUES: unknown[] = [...WRONG_TYPES, ...HOSTILE_STRINGS];

/** Values for fields holding a user/post/... id; `valid` is an id we own, so a value that happens to parse never hits someone else's data. */
export function idValues(valid: number): unknown[] {
  return [
    null, 0, -1, -2147483649, 2147483648, 1e20, 1.5, `${valid}`, `${valid}.9`, `${valid}abc`, "abc", "", true, false,
    [], [valid, valid], {}, { $gt: "" }, SQLI, NUL, "NaN", "Infinity",
  ];
}

export const HUGE = "x".repeat(200_000);

export function describeValue(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v.length > 40 ? v.slice(0, 37) + "…" : v);
  if (typeof v === "number" && !Number.isFinite(v)) return String(v);
  const s = JSON.stringify(v);
  return s === undefined ? String(v) : s.length > 40 ? s.slice(0, 37) + "…" : s;
}

/** One payload per (field, value): the base body with that field replaced. */
export function fieldPayloads(base: () => Record<string, unknown>, fields: Record<string, unknown[]>): Array<{ field: string; value: unknown; make: () => Payload }> {
  const out: Array<{ field: string; value: unknown; make: () => Payload }> = [];
  for (const [field, values] of Object.entries(fields)) {
    for (const value of values) {
      out.push({ field, value, make: () => ({ label: `${field}=${describeValue(value)}`, json: { ...base(), [field]: value } }) });
    }
  }
  return out;
}

/** The base body plus a raw `__proto__` key (an object literal would set the prototype instead of sending the key). */
export function withProtoKey(base: Record<string, unknown>): Payload {
  const json = JSON.stringify(base);
  const inner = '"__proto__":{"isAdmin":true,"role":"owner","karma":99999}';
  return { label: "base + __proto__", raw: json === "{}" ? `{${inner}}` : json.slice(0, -1) + "," + inner + "}" };
}

// ---------------------------------------------------------------------------------------------
// Actors

/**
 * Hands out a logged-in user and replaces it with a fresh one after `perUser` successful requests.
 * Posting has a 30 s cooldown and content/report counters feed anomaly detection, so creating routes rotate users.
 */
export class UserPool {
  private current: Awaited<ReturnType<typeof newUser>> | undefined;
  private used = 0;
  private static counter = 0;
  constructor(private readonly prefix: string, private readonly perUser: number) {}
  async get() {
    if (!this.current || this.used >= this.perUser) {
      this.current = await newUser(`${this.prefix}${UserPool.counter++}`);
      this.used = 0;
    }
    return this.current;
  }
  success() {
    this.used++;
  }
}

/** Runs a list of payloads against one route; returns the unsafe answers. */
export async function runPayloads(
  route: string,
  method: string,
  path: string | (() => string),
  payloads: Array<Payload | (() => Payload)>,
  actor: () => Promise<Client> | Client,
  onAnswer?: (r: Sent, p: Payload) => void,
): Promise<string[]> {
  const failures: string[] = [];
  for (const item of payloads) {
    const p = typeof item === "function" ? item() : item;
    const client = await actor();
    const r = await send(client, method, typeof path === "function" ? path() : path, p);
    const bad = problem(r);
    if (bad) failures.push(`${p.label} → ${bad}`);
    onAnswer?.(r, p);
  }
  return failures;
}

export function json(r: Sent): any {
  try {
    return JSON.parse(r.text);
  } catch {
    return undefined;
  }
}
