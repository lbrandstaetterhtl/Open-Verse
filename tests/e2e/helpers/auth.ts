import { Client, BASE_URL, RUN_ID } from "../client";

let seq = 0;

// IPs from 172.16.0.0/12 so they never collide with the 10.x addresses that client.ts hands out to
// other test files running against the same server (registration is limited to 5 per IP and hour).
export function uniqueIp(): string {
  const r = (n: number) => Math.floor(Math.random() * n);
  return `172.${16 + r(16)}.${r(256)}.${1 + r(254)}`;
}

export function freshClient(): Client {
  return new Client(uniqueIp());
}

/** Unique, valid username (max 30 chars) for this run. */
export function uniqueName(prefix: string): string {
  seq++;
  return `${prefix}${RUN_ID}${seq.toString(36)}`.slice(0, 30);
}

export type AuthUser = { client: Client; username: string; email: string; password: string; id: number };

export async function makeUser(prefix: string, password = "E2e-Passw0rd!"): Promise<AuthUser> {
  const client = freshClient();
  const username = uniqueName(prefix);
  const email = `${username}@e2e.test`;
  const res = await client.register(username, password, { email });
  if (res.status !== 201) throw new Error(`register ${username} failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return { client, username, email, password, id: body.id };
}

/** Registers with a fresh IP and fresh session; returns the raw response. */
export async function tryRegister(body: unknown): Promise<Response> {
  const c = freshClient();
  await c.refreshCsrf();
  return c.post("/api/register", body);
}

/**
 * Like Client.request, but gives up after `timeoutMs` and returns null instead of waiting forever.
 * Some handlers have no error handling and never answer when the database throws.
 */
export async function requestWithTimeout(
  client: Client,
  method: string,
  path: string,
  json?: unknown,
  timeoutMs = 5000,
): Promise<Response | null> {
  const headers: Record<string, string> = { "x-forwarded-for": client.ip };
  if (client.cookies.size > 0) headers.cookie = [...client.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  if (method !== "GET" && client.csrfToken) headers["x-csrf-token"] = client.csrfToken;
  let body: string | undefined;
  if (json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(json);
  }
  try {
    return await fetch(BASE_URL + path, { method, headers, body, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") return null;
    throw err;
  }
}

/** Copy of a client that shares the same session cookie (a second tab / a stolen cookie). */
export function cloneSession(client: Client): Client {
  const copy = new Client(client.ip);
  for (const [k, v] of client.cookies) copy.cookies.set(k, v);
  copy.csrfToken = client.csrfToken;
  return copy;
}

export const SESSION_COOKIE = "connect.sid";

/** Body must be a JSON/text error without stack traces or SQL. */
export function assertNoInternals(text: string): void {
  if (/at [\w.<>]+ \(|\/home\/|node_modules|Failed query|syntax error|relation "|duplicate key|violates/i.test(text)) {
    throw new Error(`response leaks internals: ${text.slice(0, 300)}`);
  }
}
