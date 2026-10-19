import { Client, BASE_URL, RUN_ID, ADMIN_USER, ADMIN_PASSWORD } from "../../e2e/client";

export { Client, BASE_URL, RUN_ID };

let seq = 0;

/**
 * Unique IP per client so per-IP rate limits don't bleed between tests. Uses the benchmarking
 * range 198.18.0.0/15 (RFC 2544), which no other suite hands out, so our rate-limit scenarios
 * start from a clean per-IP budget.
 */
export function attackIp(): string {
  const r = (n: number) => Math.floor(Math.random() * n);
  return `198.${18 + r(2)}.${r(256)}.${1 + r(254)}`;
}

export function freshClient(): Client {
  return new Client(attackIp());
}

/** Unique, valid username (<=30 chars, charset a-zA-Z0-9_.-) for this run. */
export function uniqueName(prefix: string): string {
  seq++;
  return `${prefix}${RUN_ID}${seq.toString(36)}`.slice(0, 30);
}

export type AttackUser = { client: Client; username: string; email: string; password: string; id: number };

export async function makeUser(prefix: string, password = "E2e-Passw0rd!"): Promise<AttackUser> {
  const client = freshClient();
  const username = uniqueName(prefix);
  const email = `${username}@e2e.test`;
  const res = await client.register(username, password, { email });
  if (res.status !== 201) throw new Error(`register ${username} failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return { client, username, email, password, id: body.id };
}

/** A fresh owner session on its own IP (the admin router has a per-IP request limit). */
export async function ownerSession(): Promise<Client> {
  const c = freshClient();
  const res = await c.login(ADMIN_USER, ADMIN_PASSWORD);
  if (res.status !== 200) throw new Error(`owner login failed: ${res.status} ${await res.text()}`);
  return c;
}

/** Copy of a client sharing the same session cookie (a second tab / a stolen cookie). */
export function cloneSession(client: Client): Client {
  const copy = new Client(client.ip);
  for (const [k, v] of client.cookies) copy.cookies.set(k, v);
  copy.csrfToken = client.csrfToken;
  return copy;
}

export const SESSION_COOKIE = "connect.sid";

// --- admin-driven state helpers (all restore-able) -------------------------------------------

type SettingRow = { id: number; category: string; key: string; value: string };

export async function getSetting(owner: Client, key: string): Promise<SettingRow> {
  const res = await owner.get("/api/admin/settings");
  if (!res.ok) throw new Error(`GET settings failed: ${res.status}`);
  const rows = (await res.json()) as SettingRow[];
  const row = rows.find((r) => r.key === key);
  if (!row) throw new Error(`setting ${key} not found`);
  return row;
}

export async function setSetting(owner: Client, id: number, value: unknown): Promise<void> {
  const res = await owner.patch(`/api/admin/settings/${id}`, { value });
  if (!res.ok) throw new Error(`PATCH setting ${id} failed: ${res.status} ${await res.text()}`);
  await owner.post("/api/admin/settings/clear-cache");
}

/** Creates a ban and returns its id (so it can be revoked in `after`). */
export async function createBan(
  owner: Client,
  body: { ban_type: "ip" | "account" | "shadow" | "hardware"; ip_address?: string; user_id?: number; device_fingerprint?: string; reason?: string; severity?: string },
): Promise<number> {
  const res = await owner.post("/api/admin/bans", { reason: "attack-test", severity: "high", ...body });
  if (!res.ok) throw new Error(`create ban failed: ${res.status} ${await res.text()}`);
  return (await res.json()).id as number;
}

export async function revokeBan(owner: Client, id: number): Promise<void> {
  await owner.patch(`/api/admin/bans/${id}/revoke`, {});
}

export async function setFrozen(owner: Client, userId: number, frozen: boolean): Promise<void> {
  const res = await owner.patch(`/api/admin/users/${userId}`, { isFrozen: frozen ? 1 : 0, frozenUntil: null });
  if (!res.ok) throw new Error(`freeze user ${userId} failed: ${res.status} ${await res.text()}`);
}

/** bcrypt only hashes the first 72 bytes of the password. */
export const BCRYPT_MAX_BYTES = 72;
