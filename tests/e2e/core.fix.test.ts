// Regression tests for the core fixes (auth, session, CORS/CSP, WebSocket, settings) that had no test before.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { createRequire } from "node:module";
import { Client, BASE_URL, ADMIN_USER, ADMIN_PASSWORD, expectStatus } from "./client";
import { makeUser, freshClient, uniqueIp, uniqueName } from "./helpers/auth";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const WS_URL = BASE_URL.replace(/^http/, "ws") + "/ws";
const HOST = new URL(BASE_URL).host;
// Optional direct DB access (e.g. postgres://user:pw@127.0.0.1:5434/db) for checks that need a clock jump
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "";

async function ownerSession(ip?: string): Promise<Client> {
  const c = new Client(ip);
  const res = await c.login(ADMIN_USER, ADMIN_PASSWORD);
  assert.equal(res.status, 200, `owner login failed: ${res.status}`);
  return c;
}

async function setting(owner: Client, key: string) {
  const rows = (await (await owner.get("/api/admin/settings")).json()) as Array<{ id: number; key: string; value: string }>;
  const row = rows.find((r) => r.key === key);
  assert.ok(row, `setting ${key} missing`);
  return row!;
}

async function setSetting(owner: Client, id: number, value: unknown) {
  await expectStatus(await owner.patch(`/api/admin/settings/${id}`, { value }), 200);
  await owner.post("/api/admin/settings/clear-cache");
}

function cookieHeader(c: Client) {
  return [...c.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
}

function openWs(headers: Record<string, string>): Promise<{ ok: boolean; ws?: any; status?: number }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL, { headers });
    let done = false;
    const finish = (r: { ok: boolean; ws?: any; status?: number }) => { if (!done) { done = true; resolve(r); } };
    ws.on("open", () => finish({ ok: true, ws }));
    ws.on("unexpected-response", (_q: any, res: any) => finish({ ok: false, status: res.statusCode }));
    ws.on("error", () => finish({ ok: false }));
    setTimeout(() => finish({ ok: false }), 4000);
  });
}

async function serverUp() {
  try {
    return (await fetch(BASE_URL + "/api/health", { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
describe("CORS and security headers", () => {
  test("the app's own origin still gets credentialed CORS; other origins and 'null' get none", async () => {
    const own = await fetch(BASE_URL + "/api/csrf-token", { headers: { origin: BASE_URL, "x-forwarded-for": uniqueIp() } });
    assert.equal(own.headers.get("access-control-allow-origin"), BASE_URL);
    for (const origin of ["https://evil.example", "null", `http://${HOST}.evil.example`]) {
      const res = await fetch(BASE_URL + "/api/csrf-token", { headers: { origin, "x-forwarded-for": uniqueIp() } });
      assert.equal(res.headers.get("access-control-allow-origin"), null, `${origin} got ACAO`);
    }
  });

  test("CSP connect-src only allows WebSockets to this host (no bare ws:/wss:)", async () => {
    for (const path of ["/api/health", "/api/user", "/"]) {
      const csp = (await fetch(BASE_URL + path, { headers: { "x-forwarded-for": uniqueIp() } })).headers.get("content-security-policy") ?? "";
      const connect = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src")) ?? "";
      assert.ok(connect, `${path}: no connect-src in ${csp}`);
      assert.ok(!/(^|\s)wss?:(\s|$)/.test(connect), `${path}: connect-src allows any WebSocket host: ${connect}`);
    }
  });

  test("an urlencoded body is not parsed (no form posts to the API)", async () => {
    const c = freshClient();
    await c.refreshCsrf();
    const res = await fetch(BASE_URL + "/api/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": c.ip, cookie: cookieHeader(c), "x-csrf-token": c.csrfToken! },
      body: "username=routeowner&password=x",
    });
    assert.equal(res.status, 401, "form fields must not reach the login");
  });

  test("over plain HTTP (no HTTPS proxy) the session cookie is not Secure, so local use keeps working", async () => {
    const res = await fetch(BASE_URL + "/api/csrf-token", { headers: { "x-forwarded-for": uniqueIp() } });
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("connect.sid="));
    assert.ok(cookie);
    assert.ok(!/;\s*Secure/i.test(cookie!), cookie);
  });
});

// ---------------------------------------------------------------------------------------------
describe("WebSocket robustness", () => {
  test("an upgrade to a path other than /ws is answered and closed (no lingering socket)", async () => {
    const answer = await new Promise<string>((resolve) => {
      const url = new URL(BASE_URL);
      const sock = net.connect(Number(url.port || 80), url.hostname, () => {
        sock.write(`GET /not-ws HTTP/1.1\r\nHost: ${HOST}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`);
      });
      let data = "";
      sock.on("data", (d) => { data += d.toString(); });
      sock.on("close", () => resolve(data || "closed"));
      sock.on("error", () => resolve(data || "error"));
      setTimeout(() => { sock.destroy(); resolve(data || "timeout"); }, 4000);
    });
    assert.match(answer, /^HTTP\/1\.1 404/, `answer: ${answer.slice(0, 80)}`);
  });

  test("an oversized frame closes only that socket; the server stays up", async () => {
    const u = await makeUser("wsbig");
    const r = await openWs({ cookie: cookieHeader(u.client), origin: BASE_URL });
    assert.ok(r.ok, "socket should open");
    const closed = new Promise<number>((resolve) => r.ws.on("close", (code: number) => resolve(code)));
    r.ws.on("error", () => {});
    r.ws.send(Buffer.alloc(200 * 1024, 1));
    const code = await Promise.race([closed, new Promise<number>((res) => setTimeout(() => res(-1), 4000))]);
    assert.notEqual(code, -1, "an oversized frame was accepted");
    assert.equal(await serverUp(), true);
  });

  test("a socket of a session that ended with a password change on another device is closed", async () => {
    const u = await makeUser("wspw");
    const other = freshClient();
    await expectStatus(await other.login(u.username, u.password), 200);
    const r = await openWs({ cookie: cookieHeader(other), origin: BASE_URL });
    assert.ok(r.ok);
    const closed = new Promise<boolean>((resolve) => r.ws.on("close", () => resolve(true)));
    await expectStatus(await u.client.patch("/api/profile/password", { currentPassword: u.password, newPassword: "Wspw-N3w-Passw0rd!" }), 200);
    assert.equal(await Promise.race([closed, new Promise<boolean>((res) => setTimeout(() => res(false), 3000))]), true);
    const again = await openWs({ cookie: cookieHeader(other), origin: BASE_URL });
    assert.equal(again.ok, false, "the old session can open a new socket after the password change");
  });
});

// ---------------------------------------------------------------------------------------------
describe("device bans (random device id instead of a header fingerprint)", () => {
  test("a hardware ban blocks exactly that browser, not everyone with the same browser and language", async () => {
    const owner = await ownerSession();
    const headers = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36", "accept-language": "de-DE,de;q=0.9" };
    const banned = freshClient();
    await banned.get("/api/csrf-token", { headers });
    const deviceId = banned.cookies.get("ov_device");
    assert.match(deviceId ?? "", /^[a-f0-9]{32}$/, "the browser gets a random device id cookie");
    const ban = await owner.post("/api/admin/bans", { ban_type: "hardware", device_fingerprint: deviceId, reason: "core fix test", severity: "low" });
    await expectStatus(ban, 200);
    const banId = (await ban.json()).id;
    try {
      assert.equal((await banned.get("/api/csrf-token", { headers })).status, 403);
      const bystander = freshClient();
      assert.equal((await bystander.get("/api/csrf-token", { headers })).status, 200, "a different browser with the same UA/language is banned too");
    } finally {
      await owner.patch(`/api/admin/bans/${banId}/revoke`, { reason: "cleanup" });
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("account bans expire", () => {
  test("after a temporary account ban expired the user can log in again", { skip: DATABASE_URL ? false : "E2E_DATABASE_URL not set (needs to move the ban expiry into the past)" }, async () => {
    const pg = (await import("pg")).default;
    const owner = await ownerSession();
    const u = await makeUser("banexp");
    const ban = await owner.post("/api/admin/bans", { ban_type: "account", user_id: u.id, reason: "core fix test", duration_hours: 1 });
    await expectStatus(ban, 200);
    const banId = (await ban.json()).id;
    assert.equal((await freshClient().login(u.username, u.password)).status, 401, "banned user logged in");
    const db = new pg.Client({ connectionString: DATABASE_URL });
    await db.connect();
    try {
      await db.query("update bans set expires_at = now() - interval '1 minute' where id = $1", [banId]);
    } finally {
      await db.end();
    }
    const res = await freshClient().login(u.username, u.password);
    assert.equal(res.status, 200, `expired ban still blocks the login: ${res.status}`);
    assert.equal((await res.json()).karma, 0);
  });
});

// ---------------------------------------------------------------------------------------------
// Start-up migrations, run against E2E_DATABASE_URL in a child process (as on a server start)
const ROOT = new URL("../..", import.meta.url).pathname;
async function runStartupStep(code: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const script = `${code}\nprocess.exit(0);`;
  await promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL, USE_SQLITE: "false", NODE_ENV: "production" },
    timeout: 60_000,
  });
}
const migrations = `${ROOT}server/db-migrations.ts`;

async function withDb<T>(fn: (db: any) => Promise<T>): Promise<T> {
  const pg = (await import("pg")).default;
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

describe("start-up migrations", { skip: DATABASE_URL ? false : "E2E_DATABASE_URL not set" }, () => {
  test("an account restricted by the old dashboard (karma -9999, no bans row) stays banned", async () => {
    const owner = await ownerSession();
    const u = await makeUser("legacyban");
    // The migration runs once (marker row); forget the marker so it runs again, as on the first start after
    // the update. Run twice without the marker: the second run must not add a second ban.
    const forgetMarker = () => withDb((db) => db.query("delete from admin_settings where category = 'system' and key = 'migration.legacy_ban_karma'"));
    await withDb((db) => db.query("update users set karma = -9999 where id = $1", [u.id]));
    await forgetMarker();
    await runStartupStep(`const m = await import(${JSON.stringify(migrations)}); await m.resetLegacyBanKarma();`);
    await withDb((db) => db.query("update users set karma = -9999 where id = $1", [u.id]));
    await forgetMarker();
    await runStartupStep(`const m = await import(${JSON.stringify(migrations)}); await m.resetLegacyBanKarma();`);
    const marker = await withDb(async (db) => (await db.query("select is_readonly from admin_settings where category = 'system' and key = 'migration.legacy_ban_karma'")).rows);
    assert.equal(marker.length, 1, "the migration is marked as done");
    const rows = await withDb(async (db) => (await db.query(
      "select id, is_permanent, created_by_type, reason from bans where user_id = $1 and ban_type = 'account' and is_active = 1", [u.id])).rows);
    try {
      assert.equal(rows.length, 1, "exactly one active account ban");
      assert.equal(rows[0].is_permanent, 1);
      assert.equal(rows[0].created_by_type, "migration");
      assert.equal(rows[0].reason, "Restricted before the ban system update");
      const users = (await (await owner.get("/api/admin/users")).json()) as any[];
      const row = users.find((x) => x.id === u.id);
      assert.equal(row.karma, 0, "legacy karma marker reset");
      assert.equal(row.isBanned, true);
      assert.equal((await freshClient().login(u.username, u.password)).status, 401, "the legacy-restricted user can log in");

      // Afterwards karma is reputation only: a very negative karma set later bans nobody
      const later = await makeUser("negkarma");
      await withDb((db) => db.query("update users set karma = -20000 where id = $1", [later.id]));
      await runStartupStep(`const m = await import(${JSON.stringify(migrations)}); await m.resetLegacyBanKarma();`);
      const laterBans = await withDb(async (db) => (await db.query("select id from bans where user_id = $1", [later.id])).rows);
      assert.equal(laterBans.length, 0, "no ban for karma set after the migration");
      await expectStatus(await later.client.get("/api/user"), 200);
    } finally {
      for (const r of rows) await owner.patch(`/api/admin/bans/${r.id}/revoke`, { reason: "core fix test" });
    }
  });

  test("device bans with the old 16-character header hash are deactivated with a note", async () => {
    const id = await withDb(async (db) => (await db.query(
      "insert into bans (ban_type, device_fingerprint, reason, is_permanent, is_active, created_at, updated_at) values ('hardware', 'abcdef0123456789', 'old device ban', 1, 1, now(), now()) returning id")).rows[0].id);
    const current = await withDb(async (db) => (await db.query(
      "insert into bans (ban_type, device_fingerprint, reason, is_permanent, is_active, created_at, updated_at) values ('hardware', $1, 'new device ban', 1, 1, now(), now()) returning id",
      ["0123456789abcdef0123456789abcdef"])).rows[0].id);
    try {
      await runStartupStep(`const m = await import(${JSON.stringify(migrations)}); await m.deactivateLegacyDeviceBans(); await m.deactivateLegacyDeviceBans();`);
      const rows = await withDb(async (db) => (await db.query("select id, is_active, reason, revoke_reason from bans where id = any($1) order by id", [[id, current]])).rows);
      assert.equal(rows[0].is_active, 0, "old-format device ban is inactive");
      assert.match(rows[0].reason, /^old device ban \[Deactivated automatically: old device ID format/);
      assert.ok(rows[0].revoke_reason, "revoke reason is set");
      assert.equal((rows[0].reason.match(/Deactivated automatically/g) ?? []).length, 1, "the note is added once");
      assert.equal(rows[1].is_active, 1, "a current device ban stays active");
    } finally {
      await withDb((db) => db.query("delete from bans where id = any($1)", [[id, current]]));
    }
  });

  test("the untouched idle-timeout default of 60 minutes becomes 0 (off); an admin's own 60 is kept", async () => {
    const owner = await ownerSession();
    const settings = `${ROOT}server/services/settings.ts`;
    const seed = `const { SettingsService } = await import(${JSON.stringify(settings)}); await SettingsService.seed();`;
    const read = () => withDb(async (db) => (await db.query(
      "select value, updated_by from admin_settings where category = 'security' and key = 'session_timeout_minutes'")).rows[0]);
    const before = await read();
    try {
      await withDb((db) => db.query("update admin_settings set value = '60', updated_by = null where category = 'security' and key = 'session_timeout_minutes'"));
      await runStartupStep(seed);
      assert.equal((await read()).value, "0", "the untouched seed value is switched off");
      const row = await setting(owner, "session_timeout_minutes");
      await setSetting(owner, row.id, "60"); // an admin chooses 60 deliberately
      await runStartupStep(seed);
      assert.equal((await read()).value, "60", "the admin's value is kept");
    } finally {
      await withDb((db) => db.query("update admin_settings set value = $1, updated_by = $2 where category = 'security' and key = 'session_timeout_minutes'", [before.value, before.updated_by]));
      await owner.post("/api/admin/settings/clear-cache");
    }
  });
});

describe("a database error during the ban check", { skip: DATABASE_URL ? false : "E2E_DATABASE_URL not set" }, () => {
  test("fails the request (500) instead of ending the session; a login fails closed", async () => {
    const u = await makeUser("bandberr");
    await expectStatus(await u.client.get("/api/user"), 200);
    // The bans table is briefly unavailable: every ban lookup fails
    await withDb((db) => db.query("alter table bans rename to bans_unavailable"));
    let during = 0;
    let login = 0;
    try {
      during = (await u.client.get("/api/user")).status;
      login = (await freshClient().login(u.username, u.password)).status;
    } finally {
      await withDb((db) => db.query("alter table bans_unavailable rename to bans"));
    }
    assert.equal(during, 500, "a failed ban check answers 500");
    assert.equal(login, 500, "a login with a failed ban check must not succeed");
    // The session survived the hiccup
    await expectStatus(await u.client.get("/api/user"), 200);
  });
});

// ---------------------------------------------------------------------------------------------
describe("admin settings that are enforced", () => {
  let owner: Client;
  before(async () => {
    owner = await ownerSession();
  });

  test("default_user_karma is the starting karma of new accounts", async () => {
    const row = await setting(owner, "default_user_karma");
    await setSetting(owner, row.id, 7);
    try {
      const u = await makeUser("karma");
      assert.equal((await (await u.client.get("/api/user")).json()).karma, 7);
    } finally {
      await setSetting(owner, row.id, 0);
    }
  });

  test("admin_ip_allowlist blocks the admin API from other addresses", async () => {
    const allowedIp = uniqueIp();
    const allowed = await ownerSession(allowedIp);
    const elsewhere = await ownerSession();
    const row = await setting(allowed, "admin_ip_allowlist");
    await setSetting(allowed, row.id, allowedIp);
    try {
      assert.equal((await elsewhere.get("/api/admin/settings")).status, 403, "admin API reachable from outside the allowlist");
      assert.equal((await allowed.get("/api/admin/settings")).status, 200);
    } finally {
      await setSetting(allowed, row.id, "");
    }
    assert.equal((await elsewhere.get("/api/admin/settings")).status, 200);
  });

  test("registration can be closed and opened again", async () => {
    const row = await setting(owner, "registration_enabled");
    await setSetting(owner, row.id, false);
    try {
      const c = freshClient();
      await c.refreshCsrf();
      const name = uniqueName("closed");
      const res = await c.post("/api/register", { username: name, email: `${name}@e2e.test`, password: "E2e-Passw0rd!" });
      assert.equal(res.status, 403);
      assert.equal((await res.json()).code, "REGISTRATION_DISABLED");
    } finally {
      await setSetting(owner, row.id, true);
    }
    await makeUser("reopened");
  });
});

// ---------------------------------------------------------------------------------------------
describe("auth odds and ends", () => {
  test("a frozen account can still log out", async () => {
    const owner = await ownerSession();
    const u = await makeUser("frzout");
    await expectStatus(await owner.patch(`/api/admin/users/${u.id}`, { isFrozen: 1 }), 200);
    try {
      await expectStatus(await u.client.post("/api/logout"), 200);
      assert.equal((await u.client.get("/api/user")).status, 401);
    } finally {
      await owner.patch(`/api/admin/users/${u.id}`, { isFrozen: 0, frozenUntil: null });
    }
  });

  test("a common password is rejected on password change too", async () => {
    const u = await makeUser("commonpw");
    const res = await u.client.patch("/api/profile/password", { currentPassword: u.password, newPassword: "Password123" });
    assert.equal(res.status, 400);
  });

  test("a bare domain as website is stored as https URL; profile answers have no moderation fields", async () => {
    const u = await makeUser("webdom");
    const res = await u.client.patch("/api/profile", { website: "example.com/me" });
    await expectStatus(res, 200);
    const body = await res.json();
    assert.equal(body.website, "https://example.com/me");
    assert.equal(body.isShadowBanned, undefined);
    assert.equal(body.password, undefined);
  });

  test("the account lock after 20 failed logins does not depend on the client address and also blocks the right password", async () => {
    const u = await makeUser("lock");
    for (let i = 0; i < 20; i++) {
      const c = freshClient();
      await c.refreshCsrf();
      assert.equal((await c.post("/api/login", { username: u.username.toUpperCase(), password: `nope-${i}` })).status, 401);
    }
    const res = await freshClient().login(u.username, u.password);
    assert.equal(res.status, 429);
    // the existing session is not affected
    assert.equal((await u.client.get("/api/user")).status, 200);
  });
});

after(() => {
  // node:test keeps the process alive while sockets are open; nothing else to clean up
});
