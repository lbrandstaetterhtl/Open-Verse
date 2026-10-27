import crypto from "node:crypto";
import { Client, newUser, ADMIN_USER, ADMIN_PASSWORD, RUN_ID, expectStatus } from "../client";

export type TestUser = Awaited<ReturnType<typeof newUser>>;

let seq = 0;
/** newUser() derives the username from the prefix, so every call needs its own prefix. */
export function uniqueUser(prefix: string): Promise<TestUser> {
  seq++;
  return newUser(`${prefix}${seq}`);
}

/** A fresh owner session on its own IP (the admin router has a 200 req / 15 min limit per IP). */
export async function ownerSession(): Promise<Client> {
  const c = new Client();
  const res = await c.login(ADMIN_USER, ADMIN_PASSWORD);
  if (res.status !== 200) throw new Error(`owner login failed: ${res.status} ${await res.text()}`);
  return c;
}

/** Addresses from TEST-NET-3 so IP bans can never hit the 10.x addresses the other suites use. */
export function testNetIp(): string {
  return `203.0.113.${Math.floor(Math.random() * 250) + 2}`;
}

/** Client that sends extra headers (User-Agent, Accept-Language) on every request. */
export class HeaderClient extends Client {
  constructor(ip: string, readonly extraHeaders: Record<string, string>) {
    super(ip);
  }
  override request(method: string, path: string, opts: Parameters<Client["request"]>[2] = {}) {
    return super.request(method, path, { ...opts, headers: { ...this.extraHeaders, ...opts?.headers } });
  }
}

/** Same algorithm as server/middleware/ban-check.ts generateFingerprint(). */
export function deviceFingerprint(userAgent: string, acceptLanguage: string): string {
  const os = /Windows/.test(userAgent) ? "Win"
    : /Mac/.test(userAgent) ? "Mac"
    : /Linux/.test(userAgent) ? "Lin"
    : /Android/.test(userAgent) ? "And"
    : /iPhone|iPad/.test(userAgent) ? "iOS" : "Unk";
  const browser = /Firefox/.test(userAgent) ? "FF"
    : /Edg/.test(userAgent) ? "Edge"
    : /Chrome/.test(userAgent) ? "Chr"
    : /Safari/.test(userAgent) ? "Saf" : "Oth";
  const lang = (acceptLanguage || "").split(",")[0].split("-")[0];
  return crypto.createHash("sha256").update(`${os}|${browser}|${lang}`).digest("hex").slice(0, 16);
}

/** Minimal RFC 4180 parser (quoted fields, doubled quotes, CRLF/LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Tracks everything a suite creates so `after` can undo it even when assertions fail midway. */
export class Cleanup {
  groups = new Set<number>();
  rules = new Set<number>();
  bans = new Set<number>();
  users = new Set<number>();
  owners = new Set<number>();

  async run(owner: Client): Promise<void> {
    for (const id of this.bans) await owner.patch(`/api/admin/bans/${id}/revoke`, { reason: "e2e cleanup" }).catch(() => {});
    for (const id of this.rules) await owner.delete(`/api/admin/auto-punishments/rules/${id}`).catch(() => {});
    for (const id of this.owners) await owner.patch(`/api/admin/users/${id}`, { role: "user", karma: 0 }).catch(() => {});
    for (const id of [...this.owners, ...this.users]) await owner.delete(`/api/admin/users/${id}`).catch(() => {});
    for (const id of this.groups) await owner.delete(`/api/admin/groups/${id}`).catch(() => {});
  }
}

export async function createGroup(owner: Client, cleanup: Cleanup, name: string, permissions: string[]): Promise<number> {
  const res = await owner.post("/api/admin/groups", {
    name: `${name}_${RUN_ID}`,
    description: "e2e group",
    permissions: JSON.stringify(permissions),
  });
  await expectStatus(res, 201);
  const id = (await res.json()).id;
  cleanup.groups.add(id);
  return id;
}

/** Registers a user and makes it an admin; with `permissions` it also gets its own admin group. */
export async function makeAdmin(owner: Client, cleanup: Cleanup, prefix: string, permissions?: string[]) {
  const u = await uniqueUser(prefix);
  cleanup.users.add(u.id);
  const groupId = permissions ? await createGroup(owner, cleanup, `${prefix}${seq}`, permissions) : null;
  await expectStatus(await owner.patch(`/api/admin/users/${u.id}`, { role: "admin", adminGroupId: groupId }), 200);
  return { ...u, groupId };
}

/** A second owner account so "admins can't touch owners" can be tested without touching the real owner. */
export async function makeOwner(owner: Client, cleanup: Cleanup, prefix: string) {
  const u = await uniqueUser(prefix);
  cleanup.owners.add(u.id);
  await expectStatus(await owner.patch(`/api/admin/users/${u.id}`, { role: "owner" }), 200);
  return u;
}

export async function getUserRow(owner: Client, id: number): Promise<any> {
  const list = await (await owner.get("/api/admin/users")).json();
  return list.find((u: any) => u.id === id);
}

export const LEAK_PATTERN = /Failed query|params:|select "|insert into|update "|syntax error|at [\w.<>]+ \(|\/home\/|node_modules/i;
