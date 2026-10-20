import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { Client, BASE_URL, ADMIN_USER, ADMIN_PASSWORD, RUN_ID, PNG_1X1, uploadProfileImage, expectStatus } from "./client";
import {
  AuthUser,
  makeUser,
  freshClient,
  uniqueName,
  uniqueIp,
  tryRegister,
  requestWithTimeout,
  cloneSession,
  SESSION_COOKIE,
  assertNoInternals,
} from "./helpers/auth";

const admin = freshClient();

before(async () => {
  assert.ok(ADMIN_USER && ADMIN_PASSWORD, "E2E_ADMIN_USER and E2E_ADMIN_PASSWORD must be set");
  const res = await admin.login(ADMIN_USER, ADMIN_PASSWORD);
  assert.equal(res.status, 200, `admin login failed: ${await res.text()}`);
});

async function expectValidationError(res: Response, field?: string) {
  const text = await res.text();
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${text.slice(0, 200)}`);
  assertNoInternals(text);
  const body = JSON.parse(text);
  assert.equal(body.code, "VALIDATION_ERROR");
  if (field) assert.ok(body.issues.some((i: any) => i.path === field), `no issue for ${field}: ${text}`);
}

async function me(client: Client) {
  const res = await client.get("/api/user");
  assert.equal(res.status, 200, "session should be logged in");
  return res.json();
}

function sessionCookieHeader(res: Response): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
}

// ---------------------------------------------------------------------------------------------
describe("AUTH register: validation", () => {
  test("happy path returns 201 JSON with a safe user shape and logs the user in", async () => {
    const c = freshClient();
    const username = uniqueName("reg");
    const res = await c.register(username, "E2e-Passw0rd!", { email: `${username}@e2e.test` });
    assert.equal(res.status, 201);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    const body = await res.json();
    assert.equal(body.username, username);
    assert.equal(body.email, `${username}@e2e.test`);
    assert.equal(body.role, "user");
    assert.equal(body.karma, 0);
    assert.equal(typeof body.id, "number");
    assert.equal(body.password, undefined);
    assert.equal((await me(c)).id, body.id);
  });

  test("username length: 2 chars and 31 chars are rejected, 3 and 30 chars are accepted", async () => {
    await expectValidationError(await tryRegister({ username: "ab", email: `ab${RUN_ID}@e2e.test`, password: "E2e-Passw0rd!" }), "username");
    const long31 = `l${RUN_ID}`.padEnd(31, "x");
    await expectValidationError(await tryRegister({ username: long31, email: `l31${RUN_ID}@e2e.test`, password: "E2e-Passw0rd!" }), "username");
    const long30 = long31.slice(0, 30);
    await expectStatus(await tryRegister({ username: long30, email: `l30${RUN_ID}@e2e.test`, password: "E2e-Passw0rd!" }), 201);
    // 3-char names: random so repeated runs do not collide
    const short = Math.random().toString(36).slice(2, 5).replace(/^[^a-z]/, "q");
    const res = await tryRegister({ username: short, email: `s3${RUN_ID}@e2e.test`, password: "E2e-Passw0rd!" });
    assert.ok(res.status === 201 || (res.status === 400 && /already exists/.test(await res.text())), `3 chars: ${res.status}`);
  });

  test("username charset: spaces, markup, slashes, unicode, emoji, RTL and null bytes are rejected", async () => {
    const bad = ["has space", "<script>", "a/../b", "ünïcödé", "emoji😀x", "‮abc", "nul\u0000byte", "semi;colon", "quo'te"];
    for (const username of bad) {
      const res = await tryRegister({ username, email: `${uniqueName("cs")}@e2e.test`, password: "E2e-Passw0rd!" });
      await expectValidationError(res, "username");
    }
  });

  test("username is trimmed before validation and storage", async () => {
    const name = uniqueName("trim");
    const res = await tryRegister({ username: `  ${name}  `, email: `${name}@e2e.test`, password: "E2e-Passw0rd!" });
    assert.equal(res.status, 201, await res.clone().text());
    assert.equal((await res.json()).username, name);
  });

  test("usernames that differ only in case are treated as duplicates", async () => {
    const name = uniqueName("Case");
    await expectStatus(await tryRegister({ username: name, email: `${name}a@e2e.test`, password: "E2e-Passw0rd!" }), 201);
    const res = await tryRegister({ username: name.toLowerCase(), email: `${name}b@e2e.test`, password: "E2e-Passw0rd!" });
    assert.equal(res.status, 400, `"${name.toLowerCase()}" was registered next to "${name}" (impersonation)`);
  });

  test("duplicate email is rejected, also with different case", async () => {
    const name = uniqueName("mail");
    const email = `${name}@e2e.test`;
    await expectStatus(await tryRegister({ username: name, email, password: "E2e-Passw0rd!" }), 201);
    const exact = await tryRegister({ username: `${name}x`, email, password: "E2e-Passw0rd!" });
    assert.equal(exact.status, 400);
    assert.match(await exact.text(), /Email already registered/);
    const upper = await tryRegister({ username: `${name}y`, email: email.toUpperCase(), password: "E2e-Passw0rd!" });
    assert.equal(upper.status, 400, `${email.toUpperCase()} was accepted although ${email} exists`);
  });

  test("invalid email formats are rejected", async () => {
    for (const email of ["not-an-email", "a@", "@b.c", "a b@c.de", "", "x".repeat(300)]) {
      await expectValidationError(await tryRegister({ username: uniqueName("em"), email, password: "E2e-Passw0rd!" }), "email");
    }
  });

  test("password length: 7 and 129 chars are rejected, 8 and 128 chars are accepted", async () => {
    await expectValidationError(await tryRegister({ username: uniqueName("pw"), email: `${uniqueName("pw")}@e2e.test`, password: "Aa1!xyz" }), "password");
    await expectValidationError(await tryRegister({ username: uniqueName("pw"), email: `${uniqueName("pw")}@e2e.test`, password: "A".repeat(129) }), "password");
    await expectStatus(await tryRegister({ username: uniqueName("pw"), email: `${uniqueName("pw")}@e2e.test`, password: "Aa1!xyzw" }), 201);
    await expectStatus(await tryRegister({ username: uniqueName("pw"), email: `${uniqueName("pw")}@e2e.test`, password: "A".repeat(128) }), 201);
  });

  test("missing fields and wrong JSON types answer 400, never 500", async () => {
    const name = uniqueName("ty");
    const bodies: unknown[] = [
      {},
      { username: name },
      { username: name, email: `${name}@e2e.test` },
      { username: 12345, email: `${name}@e2e.test`, password: "E2e-Passw0rd!" },
      { username: [name], email: `${name}@e2e.test`, password: "E2e-Passw0rd!" },
      { username: { $gt: "" }, email: `${name}@e2e.test`, password: "E2e-Passw0rd!" },
      { username: null, email: `${name}@e2e.test`, password: "E2e-Passw0rd!" },
      { username: name, email: `${name}@e2e.test`, password: 12345678 },
      { username: name, email: true, password: "E2e-Passw0rd!" },
      [name, "x@y.z", "E2e-Passw0rd!"],
      "just a string",
    ];
    for (const body of bodies) {
      const res = await tryRegister(body);
      const text = await res.text();
      assert.equal(res.status, 400, `${JSON.stringify(body).slice(0, 60)} → ${res.status} ${text.slice(0, 120)}`);
      assertNoInternals(text);
      // Non-object JSON is refused by the body parser itself; objects go through zod.
      if (body && typeof body === "object" && !Array.isArray(body)) assert.equal(JSON.parse(text).code, "VALIDATION_ERROR");
    }
  });

  test("privileged and internal fields in the body are ignored", async () => {
    const c = freshClient();
    const name = uniqueName("mass");
    const res = await c.register(name, "E2e-Passw0rd!", {
      email: `${name}@e2e.test`,
      id: 1,
      role: "admin",
      isAdmin: true,
      verified: 1,
      karma: 5000,
      adminGroupId: 1,
      isShadowBanned: 1,
      isFrozen: 1,
      createdAt: "2000-01-01T00:00:00.000Z",
      bio: "injected bio",
      displayName: "Injected",
      avatarUrl: "https://evil.example/a.png",
    });
    assert.equal(res.status, 201);
    const u = await me(c);
    assert.notEqual(u.id, 1);
    assert.equal(u.role, "user");
    assert.ok(!u.isAdmin && !u.verified && !u.isShadowBanned && !u.isFrozen);
    assert.equal(u.karma, 0);
    assert.equal(u.adminGroupId, null);
    assert.notEqual(new Date(u.createdAt).getFullYear(), 2000);
    assert.equal(u.bio, null);
    assert.equal(u.displayName, null);
    assert.equal(u.avatarUrl, null);
  });

  test("__proto__ in the body does not pollute the created user", async () => {
    const c = freshClient();
    await c.refreshCsrf();
    const name = uniqueName("proto");
    const raw = `{"username":"${name}","email":"${name}@e2e.test","password":"E2e-Passw0rd!","__proto__":{"role":"owner","isAdmin":1},"constructor":{"prototype":{"role":"owner"}}}`;
    // Client.request always JSON.stringifies (which drops __proto__), so send the raw text by hand.
    const r = await fetch(BASE_URL + "/api/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": c.ip,
        cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        "x-csrf-token": c.csrfToken!,
      },
      body: raw,
    });
    assert.equal(r.status, 201, await r.clone().text());
    const body = await r.json();
    assert.equal(body.role, "user");
    assert.ok(!body.isAdmin);
  });

  test("registration is rate limited per IP (6th attempt within the hour → 429)", async () => {
    const c = freshClient();
    await c.refreshCsrf();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      // invalid bodies still count, so this does not create accounts
      statuses.push((await c.post("/api/register", { username: "x" })).status);
    }
    assert.deepEqual(statuses.slice(0, 5), [400, 400, 400, 400, 400]);
    assert.equal(statuses[5], 429);
  });

  test("register requires a CSRF token like every other state-changing request", async () => {
    const c = freshClient();
    await c.refreshCsrf();
    const name = uniqueName("csrfreg");
    const res = await c.post("/api/register", { username: name, email: `${name}@e2e.test`, password: "E2e-Passw0rd!" }, { csrf: false });
    assert.equal(res.status, 403, `register without CSRF token answered ${res.status}`);
  });

  test("registering a taken email answers 400 with a text message (documents email enumeration, info)", async () => {
    const u = await makeUser("enum");
    const res = await tryRegister({ username: uniqueName("enum2"), email: u.email, password: "E2e-Passw0rd!" });
    assert.equal(res.status, 400);
    // Documenting current behaviour: registration necessarily reveals taken usernames; for emails the
    // message is explicit. Not asserted as a failure (common trade-off), see findings (info).
    assert.match(await res.text(), /Email already registered/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("AUTH login", () => {
  let user: AuthUser;
  before(async () => {
    user = await makeUser("login");
  });

  test("login answers JSON user without password and sets a new session cookie", async () => {
    const c = freshClient();
    const res = await c.login(user.username, user.password);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, user.id);
    assert.equal(body.password, undefined);
    assert.ok(sessionCookieHeader(res), "login must set the session cookie");
    assert.ok(!JSON.stringify(body).includes(c.cookies.get(SESSION_COOKIE)!.slice(4, 20)), "session id must not be in the body");
  });

  test("unknown user and wrong password give the same status and message", async () => {
    const a = await freshClient().login(`nouser_${RUN_ID}`, "whatever-123");
    const b = await freshClient().login(user.username, "wrong-password-123");
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(await a.text(), await b.text());
  });

  test("login of an unknown user takes as long as a wrong password (no timing oracle)", async () => {
    const c1 = freshClient();
    const c2 = freshClient();
    await c1.refreshCsrf();
    await c2.refreshCsrf();
    const time = async (c: Client, username: string) => {
      const t = performance.now();
      await c.post("/api/login", { username, password: "wrong-password-123" });
      return performance.now() - t;
    };
    const median = (xs: number[]) => xs.sort((x, y) => x - y)[Math.floor(xs.length / 2)];
    const unknown: number[] = [];
    const known: number[] = [];
    const victim = await makeUser("timing");
    for (let i = 0; i < 5; i++) {
      unknown.push(await time(c1, `ghost_${RUN_ID}_${i}`));
      known.push(await time(c2, victim.username));
    }
    const u = median(unknown);
    const k = median(known);
    assert.ok(u > k * 0.5, `unknown user: ${u.toFixed(0)} ms, existing user: ${k.toFixed(0)} ms — existence is measurable`);
  });

  test("username lookup is not case-insensitive to a different account", async () => {
    const res = await freshClient().login(user.username.toUpperCase(), user.password);
    assert.ok(res.status === 200 || res.status === 401, `got ${res.status}`);
    if (res.status === 200) assert.equal((await res.json()).id, user.id);
  });

  test("missing and wrongly typed credentials answer 4xx, never 500", async () => {
    const bodies: unknown[] = [
      {},
      { username: user.username },
      { password: "x" },
      { username: { $gt: "" }, password: { $gt: "" } },
      { username: [user.username], password: [user.password] },
      { username: 123, password: 456 },
      { username: null, password: null },
      { username: "' OR 1=1 --", password: "' OR 1=1 --" },
      { username: "x".repeat(100_000), password: "y" },
    ];
    for (const body of bodies) {
      const c = freshClient();
      await c.refreshCsrf();
      const res = await c.post("/api/login", body);
      const text = await res.text();
      assert.ok(res.status >= 400 && res.status < 500, `${JSON.stringify(body).slice(0, 60)} → ${res.status} ${text.slice(0, 120)}`);
      assertNoInternals(text);
    }
  });

  test("NoSQL-style objects cannot log in as an existing user", async () => {
    const c = freshClient();
    await c.refreshCsrf();
    const res = await c.post("/api/login", { username: user.username, password: { $ne: "x" } });
    assert.notEqual(res.status, 200);
    assert.equal((await c.get("/api/user")).status, 401);
  });

  test("brute force: after the limit even the correct password gets 429", async () => {
    const victim = await makeUser("brute");
    const c = freshClient();
    await c.refreshCsrf();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await c.post("/api/login", { username: victim.username, password: `bad-${i}` })).status);
    assert.ok(statuses.slice(0, 20).every((s) => s === 401), statuses.join(","));
    assert.equal(statuses[20], 429);
    const correct = await c.post("/api/login", { username: victim.username, password: victim.password });
    assert.equal(correct.status, 429);
    assertNoInternals(await correct.text());
  });

  test("login requires a CSRF token (no login CSRF)", async () => {
    const c = freshClient();
    await c.refreshCsrf();
    const res = await c.post("/api/login", { username: user.username, password: user.password }, { csrf: false });
    assert.equal(res.status, 403, `login without CSRF token answered ${res.status}`);
  });

  test("an urlencoded cross-site form cannot log a browser into an account", async () => {
    // A plain HTML form on another site can send this without any preflight.
    const res = await fetch(BASE_URL + "/api/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": uniqueIp(), origin: "https://evil.example" },
      body: new URLSearchParams({ username: user.username, password: user.password }).toString(),
      redirect: "manual",
    });
    assert.notEqual(res.status, 200, "form login from a foreign origin succeeded");
  });

  // Bans live in the bans table; karma is reputation only (a single dislike can make it negative, INPUT-2).
  test("an account with an active account ban cannot log in and its session dies", async () => {
    const u = await makeUser("negkarma");
    await expectStatus(await admin.post("/api/admin/bans", { ban_type: "account", user_id: u.id, reason: "e2e", duration_hours: 1 }), 200);
    const res = await freshClient().login(u.username, u.password);
    assert.equal(res.status, 401);
    assert.match(await res.text(), /banned/i);
    assert.equal((await u.client.get("/api/user")).status, 401, "existing session must be invalidated");
  });

  test("negative karma alone is not a ban", async () => {
    const u = await makeUser("lowkarma");
    await expectStatus(await admin.patch(`/api/admin/users/${u.id}`, { karma: -1 }), 200);
    assert.equal((await freshClient().login(u.username, u.password)).status, 200);
    assert.equal((await u.client.get("/api/user")).status, 200);
  });
});

// ---------------------------------------------------------------------------------------------
describe("AUTH frozen accounts", () => {
  let u: AuthUser;
  before(async () => {
    u = await makeUser("frozen");
    await expectStatus(await admin.patch(`/api/admin/users/${u.id}`, { isFrozen: 1, freezeReason: `e2e-freeze-${RUN_ID}` }), 200);
  });

  test("a frozen account can still read but not write (comments → 403 ACCOUNT_FROZEN)", async () => {
    assert.equal((await u.client.get("/api/user")).status, 200);
    const res = await u.client.post("/api/comments", { content: "while frozen", postId: 1 });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, "ACCOUNT_FROZEN");
  });

  test("a frozen account cannot change its profile", async () => {
    const res = await u.client.patch("/api/profile", { bio: "changed while frozen" });
    assert.equal(res.status, 403, `PATCH /api/profile while frozen answered ${res.status}`);
  });

  test("a frozen account cannot change its password", async () => {
    const res = await u.client.patch("/api/profile/password", { currentPassword: u.password, newPassword: "Frozen-N3w-Pass!" });
    assert.equal(res.status, 403, `PATCH /api/profile/password while frozen answered ${res.status}`);
  });

  test("an account-banned user cannot change the profile with an old session", async () => {
    // Account bans set karma to -9999, so passport drops the session; check the profile route honours that.
    const b = await makeUser("acctban");
    const ban = await admin.post("/api/admin/bans", { ban_type: "account", user_id: b.id, reason: "e2e", duration_hours: 1 });
    await expectStatus(ban, 200);
    const res = await b.client.patch("/api/profile", { bio: "banned edit" });
    assert.equal(res.status, 401);
  });
});

// ---------------------------------------------------------------------------------------------
describe("AUTH sessions and cookies", () => {
  test("session cookie is HttpOnly, SameSite=Lax, Path=/ and has a bounded lifetime", async () => {
    const res = await fetch(BASE_URL + "/api/csrf-token", { headers: { "x-forwarded-for": uniqueIp() } });
    const cookie = sessionCookieHeader(res);
    assert.ok(cookie, "anonymous visit gets a session cookie (needed for CSRF)");
    assert.match(cookie!, /;\s*HttpOnly/i);
    assert.match(cookie!, /;\s*SameSite=(Lax|Strict)/i);
    assert.match(cookie!, /;\s*Path=\//i);
    const expires = /Expires=([^;]+)/i.exec(cookie!)?.[1];
    assert.ok(expires, "cookie has an expiry");
    const hours = (new Date(expires!).getTime() - Date.now()) / 3_600_000;
    assert.ok(hours > 0 && hours <= 24 * 31, `lifetime ${hours} h`);
  });

  test("behind an HTTPS reverse proxy the session cookie is marked Secure", async () => {
    // TRUST_PROXY=true is set for exactly this setup (nginx terminates TLS and sends X-Forwarded-Proto).
    const res = await fetch(BASE_URL + "/api/csrf-token", {
      headers: { "x-forwarded-for": uniqueIp(), "x-forwarded-proto": "https" },
    });
    const cookie = sessionCookieHeader(res);
    assert.ok(cookie);
    assert.match(cookie!, /;\s*Secure/i, `cookie over HTTPS proxy: ${cookie}`);
  });

  test("session id never appears in URLs or redirects", async () => {
    const u = await makeUser("nourl");
    const sid = u.client.cookies.get(SESSION_COOKIE)!;
    const res = await u.client.get("/api/user");
    assert.ok(!(await res.text()).includes(decodeURIComponent(sid).slice(2, 34)));
    assert.equal(res.headers.get("location"), null);
  });

  test("login issues a new session id (session fixation) and the old id is not logged in", async () => {
    const u = await makeUser("fix");
    const c = freshClient();
    await c.refreshCsrf();
    const before = c.cookies.get(SESSION_COOKIE);
    assert.ok(before);
    const preLogin = cloneSession(c);
    await expectStatus(await c.post("/api/login", { username: u.username, password: u.password }), 200);
    const after = c.cookies.get(SESSION_COOKIE);
    assert.notEqual(after, before, "session id must change on login");
    assert.equal((await preLogin.get("/api/user")).status, 401, "pre-login session id must not become authenticated");
  });

  test("register also issues a new session id", async () => {
    const c = freshClient();
    await c.refreshCsrf();
    const before = c.cookies.get(SESSION_COOKIE);
    const name = uniqueName("fixreg");
    await expectStatus(await c.post("/api/register", { username: name, email: `${name}@e2e.test`, password: "E2e-Passw0rd!" }), 201);
    assert.notEqual(c.cookies.get(SESSION_COOKIE), before);
  });

  test("CSRF token is rotated on login (privilege change)", async () => {
    const u = await makeUser("csrfrot");
    const c = freshClient();
    const anonToken = await c.refreshCsrf();
    await expectStatus(await c.post("/api/login", { username: u.username, password: u.password }), 200);
    const authToken = await c.refreshCsrf();
    assert.notEqual(authToken, anonToken, "pre-login CSRF token stays valid for the authenticated session");
  });

  test("logout destroys the session server-side: a copied cookie no longer works", async () => {
    const u = await makeUser("logout");
    const stolen = cloneSession(u.client);
    assert.equal((await stolen.get("/api/user")).status, 200);
    await expectStatus(await u.client.post("/api/logout"), 200);
    assert.equal((await stolen.get("/api/user")).status, 401, "old session cookie still authenticated after logout");
    const write = await stolen.patch("/api/profile", { bio: "after logout" });
    assert.ok(write.status === 401 || write.status === 403, `write after logout: ${write.status}`);
  });

  test("logout requires a CSRF token (no forced logout from other sites)", async () => {
    const u = await makeUser("logoutcsrf");
    const res = await u.client.post("/api/logout", undefined, { csrf: false });
    assert.equal(res.status, 403, `logout without CSRF token answered ${res.status}`);
  });

  test("logout without a session does not error", async () => {
    const c = freshClient();
    await c.refreshCsrf();
    const res = await c.post("/api/logout");
    assert.ok(res.status === 200 || res.status === 401, `got ${res.status}`);
  });

  test("a CSRF token from another session is rejected", async () => {
    const a = await makeUser("csrfa");
    const b = await makeUser("csrfb");
    const res = await a.client.patch("/api/profile", { bio: "cross token" }, { csrf: false, headers: { "x-csrf-token": b.client.csrfToken! } });
    assert.equal(res.status, 403);
    assert.notEqual((await me(a.client)).bio, "cross token");
  });

  test("CSRF token only works in the header, not in body or query", async () => {
    const a = await makeUser("csrfbody");
    const body = await a.client.patch("/api/profile", { bio: "via body", _csrf: a.client.csrfToken, csrfToken: a.client.csrfToken }, { csrf: false });
    assert.equal(body.status, 403);
    const query = await a.client.patch(`/api/profile?_csrf=${a.client.csrfToken}`, { bio: "via query" }, { csrf: false });
    assert.equal(query.status, 403);
  });

  test("CORS does not grant credentialed access to arbitrary origins", async () => {
    const u = await makeUser("cors");
    const res = await u.client.get("/api/user", { headers: { origin: "https://evil.example" } });
    const acao = res.headers.get("access-control-allow-origin");
    const acac = res.headers.get("access-control-allow-credentials");
    assert.ok(
      !(acao === "https://evil.example" && acac === "true"),
      `foreign origin may read authenticated responses: ACAO=${acao} ACAC=${acac}`,
    );
  });

  test("CORS preflight from a foreign origin does not allow the CSRF header", async () => {
    const res = await fetch(BASE_URL + "/api/profile", {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "x-csrf-token,content-type",
        "x-forwarded-for": uniqueIp(),
      },
    });
    const acao = res.headers.get("access-control-allow-origin");
    assert.notEqual(acao, "https://evil.example", "preflight approves a foreign origin");
  });
});

// ---------------------------------------------------------------------------------------------
describe("AUTH GET /api/user", () => {
  test("anonymous → 401", async () => {
    assert.equal((await freshClient().get("/api/user")).status, 401);
  });

  test("own user shape has the expected fields and no secrets", async () => {
    const u = await makeUser("shape");
    const res = await u.client.get("/api/user");
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    const body = await res.json();
    for (const key of ["id", "username", "email", "role", "karma", "createdAt"]) assert.ok(key in body, `missing ${key}`);
    assert.equal(body.email, u.email);
    for (const key of ["password", "passwordHash", "sid", "session", "csrfToken", "token", "verificationToken"]) {
      assert.equal(body[key], undefined, `${key} must not be returned`);
    }
    assert.ok(!/\$2[aby]\$/.test(JSON.stringify(body)), "no bcrypt hash anywhere");
  });

  test("a shadow-banned user cannot see the shadow ban in /api/user", async () => {
    const u = await makeUser("shadowme");
    await expectStatus(await admin.patch(`/api/admin/users/${u.id}`, { isShadowBanned: 1 }), 200);
    const body = await me(u.client);
    assert.ok(!body.isShadowBanned, "isShadowBanned is exposed to the affected user");
  });
});

// ---------------------------------------------------------------------------------------------
describe("AUTH public profile and privacy", () => {
  test("public profile of another user exposes no moderation or internal fields", async () => {
    const u = await makeUser("pubprof");
    await expectStatus(
      await admin.patch(`/api/admin/users/${u.id}`, { isFrozen: 1, freezeReason: `internal-note-${RUN_ID}`, isShadowBanned: 1 }),
      200,
    );
    const res = await freshClient().get(`/api/users/${u.username}`);
    assert.equal(res.status, 200);
    const profile = await res.json();
    assert.equal(profile.email, undefined);
    assert.equal(profile.password, undefined);
    const leaked = ["isShadowBanned", "isFrozen", "freezeReason", "frozenUntil", "adminGroupId", "emailVerified"].filter(
      (k) => k in profile,
    );
    assert.deepEqual(leaked, [], `public profile leaks: ${leaked.map((k) => `${k}=${JSON.stringify(profile[k])}`).join(", ")}`);
  });

  test("own profile includes the email, someone else's does not", async () => {
    const a = await makeUser("profa");
    const b = await makeUser("profb");
    assert.equal((await (await a.client.get(`/api/users/${a.username}`)).json()).email, a.email);
    assert.equal((await (await b.client.get(`/api/users/${a.username}`)).json()).email, undefined);
  });

  test("user search does not return other users' email addresses", async () => {
    const target = await makeUser("srchme");
    const searcher = await makeUser("srcher");
    const res = await searcher.client.get(`/api/users/search?q=${encodeURIComponent(target.username)}`);
    await expectStatus(res, 200);
    const hit = (await res.json()).find((x: any) => x.username === target.username);
    assert.ok(hit, "search finds the user");
    assert.equal(hit.email, undefined, `search leaks email ${hit.email}`);
    assert.equal(hit.password, undefined);
  });

  test("unknown profile → 404 without echoing markup", async () => {
    const res = await freshClient().get(`/api/users/${encodeURIComponent("<img src=x onerror=alert(1)>")}`);
    assert.equal(res.status, 404);
    assert.ok(!(await res.text()).includes("<img"));
  });

  test("a private account's posts are hidden from anonymous visitors", async () => {
    const u = await makeUser("private");
    const post = await u.client.post("/api/posts", { title: `Private ${RUN_ID}`, content: "only for members", category: "discussion" });
    await expectStatus(post, 201);
    await expectStatus(await u.client.patch("/api/profile", { isPrivate: true }), 200);
    const res = await freshClient().get(`/api/users/${u.username}/posts`);
    const posts = res.status === 200 ? await res.json() : [];
    assert.ok(
      res.status === 401 || res.status === 403 || (Array.isArray(posts) && posts.length === 0),
      `anonymous sees ${posts.length} post(s) of a private account (status ${res.status})`,
    );
  });

  test("isPrivate defaults to off and can be toggled with true/false and 1/0", async () => {
    const u = await makeUser("privtog");
    assert.ok(!(await me(u.client)).isPrivate);
    for (const [value, expected] of [[true, 1], [false, 0], [1, 1], [0, 0]] as const) {
      await expectStatus(await u.client.patch("/api/profile", { isPrivate: value }), 200);
      assert.equal(Number((await me(u.client)).isPrivate), expected);
    }
  });

  test("isPrivate only accepts boolean-like values", async () => {
    const u = await makeUser("privbad");
    for (const isPrivate of ["yes", { a: 1 }, [1]]) {
      await expectValidationError(await u.client.patch("/api/profile", { isPrivate }));
    }
    for (const isPrivate of [5, -1, 1.5]) {
      const res = await u.client.patch("/api/profile", { isPrivate });
      assert.equal(res.status, 400, `isPrivate=${isPrivate} accepted (stored ${(await me(u.client)).isPrivate})`);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("AUTH PATCH /api/profile", () => {
  test("anonymous → 401 and missing CSRF token → 403", async () => {
    const anon = freshClient();
    await anon.refreshCsrf();
    assert.equal((await anon.patch("/api/profile", { bio: "x" })).status, 401);
    const u = await makeUser("profcsrf");
    assert.equal((await u.client.patch("/api/profile", { bio: "x" }, { csrf: false })).status, 403);
  });

  test("all cosmetic fields are saved and returned without the password", async () => {
    const u = await makeUser("profall");
    const res = await u.client.patch("/api/profile", {
      displayName: "Display Ünïcode 😀",
      bio: "Bio with\nnewline",
      location: "Wien",
      website: "https://example.com/me",
    });
    await expectStatus(res, 200);
    const body = await res.json();
    assert.equal(body.password, undefined);
    assert.equal(body.displayName, "Display Ünïcode 😀");
    assert.equal(body.website, "https://example.com/me");
    const fresh = await me(u.client);
    assert.equal(fresh.location, "Wien");
    assert.equal(fresh.bio, "Bio with\nnewline");
  });

  test("an empty update answers promptly (no hanging request)", async () => {
    const u = await makeUser("profempty");
    const res = await requestWithTimeout(u.client, "PATCH", "/api/profile", {});
    assert.ok(res, "PATCH /api/profile with {} never answered");
    assert.ok(res!.status === 200 || res!.status === 400, `got ${res!.status}`);
  });

  for (const [field, max] of [["displayName", 100], ["bio", 2000], ["location", 100], ["website", 500]] as const) {
    test(`${field} with 100k characters is rejected (sane limit ≈ ${max})`, async () => {
      const u = await makeUser(`len${field.slice(0, 4)}`);
      const value = field === "website" ? `https://example.com/${"a".repeat(100_000)}` : "a".repeat(100_000);
      const res = await u.client.patch("/api/profile", { [field]: value });
      assert.equal(res.status, 400, `${field} of ${value.length} chars accepted`);
    });
  }

  test("website must be an http(s) URL — javascript:, data: and vbscript: are rejected", async () => {
    const u = await makeUser("profjs");
    for (const website of ["javascript:alert(document.cookie)", " JavaScript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"]) {
      const res = await u.client.patch("/api/profile", { website });
      assert.equal(res.status, 400, `website "${website}" accepted`);
    }
  });

  test("stored XSS payloads come back as plain JSON data", async () => {
    const u = await makeUser("profxss");
    const payload = `<script>alert(1)</script><img src=x onerror=alert(1)>`;
    await expectStatus(await u.client.patch("/api/profile", { bio: payload, displayName: payload, location: payload }), 200);
    const res = await freshClient().get(`/api/users/${u.username}`);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    const body = await res.json();
    assert.equal(body.bio, payload);
    assert.equal(body.displayName, payload);
  });

  test("fields can be cleared with null", async () => {
    const u = await makeUser("profnull");
    await expectStatus(await u.client.patch("/api/profile", { bio: "something", location: "x" }), 200);
    await expectStatus(await u.client.patch("/api/profile", { bio: null, location: null }), 200);
    const fresh = await me(u.client);
    assert.equal(fresh.bio, null);
    assert.equal(fresh.location, null);
  });

  test("wrong types are rejected with 400", async () => {
    const u = await makeUser("proftype");
    for (const body of [{ bio: 123 }, { bio: { $gt: "" } }, { displayName: ["a"] }, { website: true }, { avatarUrl: 5 }, { username: null }, { email: 42 }]) {
      await expectValidationError(await u.client.patch("/api/profile", body));
    }
  });

  test("privileged and internal fields are ignored (extended list)", async () => {
    const u = await makeUser("profmass");
    await expectStatus(
      await u.client.patch("/api/profile", {
        bio: "mass",
        id: 1,
        verified: 1,
        emailVerified: 0,
        isShadowBanned: 1,
        isFrozen: 1,
        adminGroupId: 1,
        createdAt: "2000-01-01T00:00:00.000Z",
        role: "admin",
        karma: 999,
      }),
      200,
    );
    const fresh = await me(u.client);
    assert.equal(fresh.id, u.id);
    assert.equal(fresh.role, "user");
    assert.equal(fresh.karma, 0);
    assert.ok(!fresh.verified && !fresh.isShadowBanned && !fresh.isFrozen);
    assert.equal(fresh.adminGroupId, null);
    assert.notEqual(new Date(fresh.createdAt).getFullYear(), 2000);
  });

  test("avatar/cover/profilePicture URLs: external, javascript: and traversal are rejected; own uploads accepted", async () => {
    const u = await makeUser("profimg");
    for (const field of ["coverUrl", "profilePictureUrl"]) {
      for (const value of ["https://evil.example/x.png", "javascript:alert(1)", "/uploads/../../etc/passwd", "//evil.example/x.png", "/uploads/a b.png"]) {
        const res = await u.client.patch("/api/profile", { [field]: value });
        assert.equal(res.status, 400, `${field}=${value} accepted`);
      }
    }
    const up = await uploadProfileImage(u.client, "avatar", PNG_1X1, "image/png", "a.png");
    await expectStatus(up, 200);
    const { url } = await up.json();
    await expectStatus(await u.client.patch("/api/profile", { avatarUrl: url }), 200);
    assert.equal((await me(u.client)).avatarUrl, url);
  });

  test("profile-upload is also reachable under /api/user/profile-upload with the same checks", async () => {
    const u = await makeUser("profup2");
    const form = new FormData();
    form.append("type", "avatar");
    form.append("image", new Blob([Buffer.from("<?php echo 1; ?>")], { type: "image/png" }), "x.php.png");
    const res = await u.client.request("POST", "/api/user/profile-upload", { form });
    assert.equal(res.status, 400);
    const anon = freshClient();
    await anon.refreshCsrf();
    const f2 = new FormData();
    f2.append("type", "avatar");
    f2.append("image", new Blob([PNG_1X1], { type: "image/png" }), "a.png");
    assert.equal((await anon.request("POST", "/api/user/profile-upload", { form: f2 })).status, 401);
  });

  test("username change works and the new name can log in", async () => {
    const u = await makeUser("rename");
    const newName = uniqueName("renamed");
    await expectStatus(await u.client.patch("/api/profile", { username: newName }), 200);
    assert.equal((await freshClient().login(newName, u.password)).status, 200);
    assert.equal((await freshClient().login(u.username, u.password)).status, 401);
  });

  test("username change to an existing name is rejected", async () => {
    const a = await makeUser("taken");
    const b = await makeUser("taker");
    const res = await b.client.patch("/api/profile", { username: a.username });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /already taken/);
  });

  test("username change to a case variant of an existing name is rejected", async () => {
    const a = await makeUser("CaseOwn");
    const b = await makeUser("casevar");
    const res = await b.client.patch("/api/profile", { username: a.username.toLowerCase() });
    assert.equal(res.status, 400, `renamed to "${a.username.toLowerCase()}" next to "${a.username}"`);
  });

  test("username change follows the registration rules (charset, length)", async () => {
    const u = await makeUser("renbad");
    const original = u.username;
    try {
      for (const username of ["<script>alert(1)</script>", "a b", "ab", "x".repeat(31), "../admin", "emoji😀"]) {
        const res = await requestWithTimeout(u.client, "PATCH", "/api/profile", { username });
        assert.ok(res, `rename to ${username} hung`);
        assert.equal(res!.status, 400, `renamed to "${username}"`);
      }
    } finally {
      await requestWithTimeout(u.client, "PATCH", "/api/profile", { username: original });
    }
  });

  test("username cannot be changed to an empty string", async () => {
    const u = await makeUser("renempty");
    const original = u.username;
    try {
      const res = await requestWithTimeout(u.client, "PATCH", "/api/profile", { username: "" });
      assert.ok(res, "rename to empty string never answered");
      assert.equal(res!.status, 400, `rename to "" answered ${res!.status}`);
    } finally {
      // release the empty name again so other runs are not affected
      await requestWithTimeout(u.client, "PATCH", "/api/profile", { username: original });
    }
  });

  test("a second account renamed to the same empty username gets a prompt 4xx (no hanging request)", async () => {
    const a = await makeUser("renemp1");
    const b = await makeUser("renemp2");
    try {
      await requestWithTimeout(a.client, "PATCH", "/api/profile", { username: "" });
      // The duplicate check is skipped for "", so the unique constraint fires inside an unguarded handler.
      const res = await requestWithTimeout(b.client, "PATCH", "/api/profile", { username: "" });
      assert.ok(res, "second rename to the empty username never answered");
      assert.ok(res!.status >= 400 && res!.status < 500, `got ${res!.status}`);
    } finally {
      await requestWithTimeout(a.client, "PATCH", "/api/profile", { username: a.username });
      await requestWithTimeout(b.client, "PATCH", "/api/profile", { username: b.username });
    }
  });

  test("email change: valid works, invalid format and duplicates (any case) are rejected", async () => {
    const a = await makeUser("mailown");
    const b = await makeUser("mailchg");
    const newEmail = `${uniqueName("newmail")}@e2e.test`;
    await expectStatus(await b.client.patch("/api/profile", { email: newEmail }), 200);
    assert.equal((await me(b.client)).email, newEmail);

    const dup = await b.client.patch("/api/profile", { email: a.email });
    assert.equal(dup.status, 400);

    const dupCase = await b.client.patch("/api/profile", { email: a.email.toUpperCase() });
    assert.equal(dupCase.status, 400, `email ${a.email.toUpperCase()} accepted although ${a.email} exists`);
  });

  test("email change rejects invalid addresses", async () => {
    const u = await makeUser("mailbad");
    const original = u.email;
    try {
      for (const email of ["not-an-email", "<script>@x", "a@"]) {
        const res = await requestWithTimeout(u.client, "PATCH", "/api/profile", { email });
        assert.ok(res, `email ${email} hung`);
        assert.equal(res!.status, 400, `email "${email}" accepted`);
      }
    } finally {
      await requestWithTimeout(u.client, "PATCH", "/api/profile", { email: original });
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("AUTH PATCH /api/profile/password", () => {
  test("anonymous → 401, missing CSRF → 403", async () => {
    const anon = freshClient();
    await anon.refreshCsrf();
    assert.equal((await anon.patch("/api/profile/password", { currentPassword: "a", newPassword: "N3w-Passw0rd!" })).status, 401);
    const u = await makeUser("pwcsrf");
    assert.equal((await u.client.patch("/api/profile/password", { currentPassword: u.password, newPassword: "N3w-Passw0rd!" }, { csrf: false })).status, 403);
  });

  test("new password length rules and missing fields → 400, password unchanged", async () => {
    const u = await makeUser("pwrules");
    await expectValidationError(await u.client.patch("/api/profile/password", { currentPassword: u.password, newPassword: "short7!" }), "newPassword");
    await expectValidationError(await u.client.patch("/api/profile/password", { currentPassword: u.password, newPassword: "x".repeat(129) }), "newPassword");
    await expectValidationError(await u.client.patch("/api/profile/password", { newPassword: "N3w-Passw0rd!" }), "currentPassword");
    await expectValidationError(await u.client.patch("/api/profile/password", { currentPassword: { $ne: "" }, newPassword: "N3w-Passw0rd!" }));
    assert.equal((await freshClient().login(u.username, u.password)).status, 200);
  });

  test("response has no password hash and the current session keeps working", async () => {
    const u = await makeUser("pwkeep");
    const res = await u.client.patch("/api/profile/password", { currentPassword: u.password, newPassword: "N3w-Passw0rd!" });
    await expectStatus(res, 200);
    const body = await res.json();
    assert.equal(body.password, undefined);
    assert.equal((await u.client.get("/api/user")).status, 200);
  });

  test("changing the password ends the user's other sessions", async () => {
    const u = await makeUser("pwother");
    const other = freshClient();
    await expectStatus(await other.login(u.username, u.password), 200);
    await expectStatus(await u.client.patch("/api/profile/password", { currentPassword: u.password, newPassword: "N3w-Passw0rd!" }), 200);
    assert.equal((await other.get("/api/user")).status, 401, "another (possibly stolen) session survives the password change");
  });

  test("password change attempts are rate limited (6th attempt per hour → 429)", async () => {
    const u = await makeUser("pwlimit");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await u.client.patch("/api/profile/password", { currentPassword: `wrong-${i}`, newPassword: "N3w-Passw0rd!" })).status);
    }
    assert.deepEqual(statuses.slice(0, 5), [400, 400, 400, 400, 400]);
    assert.equal(statuses[5], 429);
  });
});

// ---------------------------------------------------------------------------------------------
describe("AUTH account deletion", () => {
  test("a deleted account's session and credentials stop working", async () => {
    const u = await makeUser("delme");
    await expectStatus(await admin.delete(`/api/admin/users/${u.id}`), 200);
    assert.equal((await u.client.get("/api/user")).status, 401, "session of a deleted user still works");
    assert.equal((await freshClient().login(u.username, u.password)).status, 401);
    assert.equal((await freshClient().get(`/api/users/${u.username}`)).status, 404);
  });
});

// ---------------------------------------------------------------------------------------------
describe("AUTH security headers", () => {
  for (const path of ["/api/user", "/api/csrf-token", "/"]) {
    test(`${path}: CSP with frame-ancestors, X-Frame-Options, nosniff, no X-Powered-By`, async () => {
      const res = await fetch(BASE_URL + path, { headers: { "x-forwarded-for": uniqueIp() } });
      const csp = res.headers.get("content-security-policy") ?? "";
      assert.match(csp, /default-src 'self'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /object-src 'none'/);
      assert.ok(!/script-src[^;]*'unsafe-eval'/.test(csp), `production CSP allows unsafe-eval: ${csp}`);
      assert.ok(res.headers.get("x-frame-options"));
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      assert.equal(res.headers.get("x-powered-by"), null);
      assert.ok(res.headers.get("referrer-policy"));
    });
  }

});
