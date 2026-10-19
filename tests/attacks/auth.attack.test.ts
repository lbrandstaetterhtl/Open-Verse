import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  Client,
  RUN_ID,
  attackIp,
  freshClient,
  uniqueName,
  makeUser,
  ownerSession,
  cloneSession,
  getSetting,
  setSetting,
  createBan,
  revokeBan,
  setFrozen,
  SESSION_COOKIE,
  BCRYPT_MAX_BYTES,
  type AttackUser,
} from "./helpers/auth";
import { ADMIN_USER, ADMIN_PASSWORD } from "../e2e/client";

// Every test asserts the SAFE behaviour. A failing test documents a reproduced vulnerability
// (see scratchpad/audit2/findings-auth.json) that must pass once the app is fixed.

const STRONG = "Str0ng-Attack-Pw!9";

// ---------------------------------------------------------------------------------------------
describe("Angriff: Brute force / credential stuffing", () => {
  // Attacker: anonymous. Goal: guess one victim's password without being throttled.
  // Steps: fail many logins, but rotate X-Forwarded-For so the per-IP limiter sees a new IP
  //        each time (TRUST_PROXY=true trusts the header).

  test("per-IP login limiter fires when the IP is NOT rotated (baseline: the limiter exists)", async () => {
    const ip = attackIp();
    let got429 = false;
    for (let i = 0; i < 30; i++) {
      const c = new Client(ip);
      await c.refreshCsrf();
      const r = await c.post("/api/login", { username: `ghost_${RUN_ID}_${i}`, password: "x" });
      if (r.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.ok(got429, "the per-IP login rate limiter never triggered even from a single IP");
  });

  test("rotating X-Forwarded-For does NOT let an attacker brute force a victim's password unthrottled", async () => {
    const victim = await makeUser("bfvictim", STRONG);
    const statuses: number[] = [];
    for (let i = 0; i < 30; i++) {
      const c = freshClient(); // fresh IP every attempt
      await c.refreshCsrf();
      const r = await c.post("/api/login", { username: victim.username, password: `guess-${i}` });
      statuses.push(r.status);
    }
    const blocked = statuses.filter((s) => s === 429 || s === 403).length;
    assert.ok(
      blocked > 0,
      `30 wrong-password logins against one account from 30 spoofed IPs were all accepted for scoring (statuses ${statuses.join(",")}); per-IP limiter and per-account anomaly detection are both bypassed by X-Forwarded-For rotation`,
    );
  });

  test("after a burst of failed logins the correct password should not simply keep working (account protection)", async () => {
    // Even if the limiter is per-IP, a targeted account should become protected (lockout / step-up)
    // after a flood of failures. Here we show it does not: guessing stays open indefinitely.
    const victim = await makeUser("bflock", STRONG);
    for (let i = 0; i < 20; i++) {
      const c = freshClient();
      await c.refreshCsrf();
      await c.post("/api/login", { username: victim.username, password: `nope-${i}` });
    }
    const atk = freshClient();
    await atk.refreshCsrf();
    const good = await atk.post("/api/login", { username: victim.username, password: STRONG });
    // SAFE would be: the account is locked/step-up required (not a plain 200) after 20 failures.
    assert.notEqual(
      good.status,
      200,
      "20 failed logins from spoofed IPs triggered no lockout; an attacker can keep guessing forever and log in once they hit the password",
    );
  });

  test("registration is rate-limited even when X-Forwarded-For is rotated (no mass account creation)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      const c = freshClient();
      await c.refreshCsrf();
      const name = `spam${RUN_ID}x${i}`.slice(0, 30);
      const r = await c.post("/api/register", { username: name, email: `${name}@e2e.test`, password: STRONG });
      statuses.push(r.status);
    }
    const blocked = statuses.filter((s) => s === 429).length;
    assert.ok(
      blocked > 0,
      `15 registrations from 15 spoofed IPs all succeeded (statuses ${statuses.join(",")}); the 5/hour register limiter is per-IP and is bypassed by X-Forwarded-For rotation`,
    );
  });

  test("current-password brute force on PATCH /api/profile/password is throttled despite X-Forwarded-For rotation", async () => {
    // Attacker stole a session cookie but not the password and wants to change it (needs currentPassword).
    const victim = await makeUser("pwbf", STRONG);
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      // New client on a fresh IP, reusing the stolen session cookie (rotate the IP the limiter keys on).
      const c = new Client(attackIp());
      for (const [k, v] of victim.client.cookies) c.cookies.set(k, v);
      await c.refreshCsrf();
      const r = await c.patch("/api/profile/password", {
        currentPassword: `guess-${i}`,
        newPassword: "Totally-New-Pw-1!",
      });
      statuses.push(r.status);
    }
    const blocked = statuses.filter((s) => s === 429).length;
    assert.ok(
      blocked > 0,
      `10 wrong currentPassword attempts from rotating IPs were all processed (statuses ${statuses.join(",")}); the 5/hour password-change limiter is per-IP and bypassed by X-Forwarded-For rotation`,
    );
  });
});

// ---------------------------------------------------------------------------------------------
describe("Angriff: User enumeration", () => {
  // Attacker: anonymous. Goal: learn which usernames/emails exist and which accounts are banned.

  test("registering a taken username does not confirm it exists (generic error)", async () => {
    const victim = await makeUser("enumname", STRONG);
    const c = freshClient();
    await c.refreshCsrf();
    const r = await c.post("/api/register", {
      username: victim.username,
      email: `other_${RUN_ID}@e2e.test`,
      password: STRONG,
    });
    const text = await r.text();
    assert.ok(
      !/already exists|taken/i.test(text),
      `registration reveals the username is taken: ${r.status} "${text}"`,
    );
  });

  test("registering a taken email does not confirm it exists (generic error)", async () => {
    const victim = await makeUser("enummail", STRONG);
    const c = freshClient();
    await c.refreshCsrf();
    const r = await c.post("/api/register", {
      username: uniqueName("enumx"),
      email: victim.email,
      password: STRONG,
    });
    const text = await r.text();
    assert.ok(
      !/already registered|exists/i.test(text),
      `registration reveals the email is taken: ${r.status} "${text}"`,
    );
  });

  test("login of a banned account returns the same generic error as a wrong password (no ban-status oracle)", async () => {
    const owner = await ownerSession();
    const victim = await makeUser("enumban", STRONG);
    const banId = await createBan(owner, { ban_type: "account", user_id: victim.id });
    try {
      const atk = freshClient();
      await atk.refreshCsrf();
      const r = await atk.post("/api/login", { username: victim.username, password: "wrong" });
      const text = await r.text();
      assert.ok(
        !/banned/i.test(text),
        `login of a banned account reveals the ban via a distinct message: "${text}" (an attacker can enumerate which accounts are banned)`,
      );
    } finally {
      await revokeBan(owner, banId);
    }
  });

  test("user search does not return other users' email addresses", async () => {
    const victim = await makeUser("srchmail", STRONG);
    const viewer = await makeUser("srchview", STRONG);
    const r = await viewer.client.get(`/api/users/search?q=${victim.username}`);
    const text = await r.text();
    assert.equal(r.status, 200, text);
    const rows = JSON.parse(text) as any[];
    const hit = rows.find((u) => u.username === victim.username);
    assert.ok(hit, "search did not find the user");
    assert.ok(
      !("email" in hit) || hit.email == null,
      `search leaks another user's email: ${hit.email}`,
    );
  });

  test("public profile does not expose moderation/internal fields", async () => {
    const owner = await ownerSession();
    const victim = await makeUser("profleak", STRONG);
    await setFrozen(owner, victim.id, true);
    try {
      const anon = freshClient();
      const r = await anon.get(`/api/users/${victim.username}`);
      const text = await r.text();
      assert.equal(r.status, 200, text);
      const body = JSON.parse(text) as any;
      const leaked = ["isShadowBanned", "isFrozen", "freezeReason", "adminGroupId", "emailVerified", "email"].filter(
        (f) => body[f] !== undefined && body[f] !== null,
      );
      assert.deepEqual(
        leaked,
        [],
        `anonymous public profile exposes internal fields: ${leaked.map((f) => `${f}=${JSON.stringify(body[f])}`).join(", ")}`,
      );
    } finally {
      await setFrozen(owner, victim.id, false);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("Angriff: Session attacks", () => {
  test("session id is rotated on login (no session fixation)", async () => {
    const victim = await makeUser("fixation", STRONG);
    // log out, then capture the anonymous session id and the post-login id
    await victim.client.post("/api/logout");
    await victim.client.refreshCsrf();
    const before = victim.client.cookies.get(SESSION_COOKIE);
    await victim.client.login(victim.username, STRONG);
    const afterLogin = victim.client.cookies.get(SESSION_COOKIE);
    assert.notEqual(before, afterLogin, "session id was not rotated on login (session fixation possible)");
  });

  test("logout destroys the server session so a stolen pre-logout cookie cannot be replayed", async () => {
    const victim = await makeUser("logoutkill", STRONG);
    const stolen = cloneSession(victim.client);
    await victim.client.post("/api/logout");
    const r = await stolen.get("/api/user");
    assert.equal(r.status, 401, "an old session cookie still authenticates after logout (session not destroyed server-side)");
  });

  test("changing the password invalidates the user's other sessions", async () => {
    const victim = await makeUser("pwsessions", STRONG);
    // attacker has a parallel session on the same account (stolen cookie)
    const attacker = cloneSession(victim.client);
    const chk1 = await attacker.get("/api/user");
    assert.equal(chk1.status, 200, "setup: attacker session should start valid");
    // victim changes the password
    const pw = await victim.client.patch("/api/profile/password", {
      currentPassword: STRONG,
      newPassword: "Rotated-Pw-After-Theft-1!",
    });
    assert.equal(pw.status, 200, await pw.text());
    const chk2 = await attacker.get("/api/user");
    assert.equal(
      chk2.status,
      401,
      "the attacker's parallel session is still valid after the password change; changing the password does not kick out other sessions",
    );
  });

  test("an account ban invalidates the banned user's existing session", async () => {
    const owner = await ownerSession();
    const victim = await makeUser("bansession", STRONG);
    const banId = await createBan(owner, { ban_type: "account", user_id: victim.id });
    try {
      const r = await victim.client.get("/api/user");
      assert.equal(r.status, 401, "a banned user's existing session still works");
    } finally {
      await revokeBan(owner, banId);
    }
  });

  test("deleting an account invalidates its existing session", async () => {
    const owner = await ownerSession();
    const victim = await makeUser("delsession", STRONG);
    const del = await owner.delete(`/api/admin/users/${victim.id}`);
    assert.equal(del.status, 200, await del.text());
    const r = await victim.client.get("/api/user");
    assert.equal(r.status, 401, "a deleted user's session still authenticates");
  });

  test("session cookie carries HttpOnly, SameSite and (behind an HTTPS proxy) Secure", async () => {
    const c = freshClient();
    const res = await c.request("GET", "/api/csrf-token", { headers: { "x-forwarded-proto": "https" } });
    const setCookie = res.headers.getSetCookie().find((x) => x.startsWith(SESSION_COOKIE));
    assert.ok(setCookie, "no session cookie was set");
    assert.match(setCookie!, /HttpOnly/i, "session cookie is missing HttpOnly");
    assert.match(setCookie!, /SameSite=/i, "session cookie is missing SameSite");
    assert.match(
      setCookie!,
      /Secure/i,
      `behind an HTTPS reverse proxy (X-Forwarded-Proto: https, trust proxy on) the session cookie is not marked Secure: "${setCookie}"`,
    );
  });

  test("two fresh session ids are distinct and high-entropy (not predictable)", async () => {
    const a = freshClient();
    const b = freshClient();
    await a.refreshCsrf();
    await b.refreshCsrf();
    const ca = a.cookies.get(SESSION_COOKIE) ?? "";
    const cb = b.cookies.get(SESSION_COOKIE) ?? "";
    assert.ok(ca.length > 20 && cb.length > 20, "session cookie suspiciously short");
    assert.notEqual(ca, cb, "two independent sessions share the same id");
  });
});

// ---------------------------------------------------------------------------------------------
describe("Angriff: CSRF and CORS", () => {
  test("POST /api/login requires a CSRF token (no login CSRF)", async () => {
    const victim = await makeUser("csrflogin", STRONG);
    const c = freshClient();
    await c.refreshCsrf(); // establishes a session + token that we deliberately DO NOT send
    const r = await c.post("/api/login", { username: victim.username, password: STRONG }, { csrf: false });
    assert.equal(
      r.status,
      403,
      `login succeeded without a CSRF token (status ${r.status}); a cross-site form can log a victim's browser into an attacker-controlled account (login CSRF)`,
    );
  });

  test("POST /api/register requires a CSRF token", async () => {
    const c = freshClient();
    await c.refreshCsrf();
    const name = uniqueName("csrfreg");
    const r = await c.post("/api/register", { username: name, email: `${name}@e2e.test`, password: STRONG }, { csrf: false });
    assert.equal(r.status, 403, `register succeeded without a CSRF token (status ${r.status})`);
  });

  test("POST /api/logout requires a CSRF token (no forced logout from other sites)", async () => {
    const victim = await makeUser("csrflogout", STRONG);
    const r = await victim.client.post("/api/logout", undefined, { csrf: false });
    assert.equal(r.status, 403, `logout succeeded without a CSRF token (status ${r.status}); any site can log the victim out`);
  });

  test("PATCH /api/profile rejects a CSRF token that belongs to another session", async () => {
    const victim = await makeUser("csrfcross", STRONG);
    const other = await makeUser("csrfother", STRONG);
    // csrf:false stops the client from auto-injecting victim's own token, so only the foreign token is sent.
    const r = await victim.client.patch(
      "/api/profile",
      { bio: "x" },
      { csrf: false, headers: { "x-csrf-token": other.client.csrfToken! } },
    );
    assert.equal(r.status, 403, "a CSRF token from a different session was accepted (token not bound to the session)");
  });

  test("CORS does not reflect an arbitrary Origin with credentials", async () => {
    const victim = await makeUser("corsevil", STRONG);
    const origin = "https://evil.example";
    const r = await victim.client.request("GET", "/api/user", { headers: { origin } });
    const acao = r.headers.get("access-control-allow-origin");
    const acac = r.headers.get("access-control-allow-credentials");
    assert.ok(
      !(acao === origin && acac === "true"),
      `CORS reflected the evil origin with credentials (ACAO=${acao}, ACAC=${acac}); any web page can read the authenticated /api/user and /api/csrf-token responses`,
    );
  });

  test("CORS does not grant credentialed access to the 'null' origin", async () => {
    const victim = await makeUser("corsnull", STRONG);
    const r = await victim.client.request("GET", "/api/user", { headers: { origin: "null" } });
    const acao = r.headers.get("access-control-allow-origin");
    const acac = r.headers.get("access-control-allow-credentials");
    assert.ok(
      !(acao === "null" && acac === "true"),
      `CORS reflected the null origin with credentials (ACAO=${acao}, ACAC=${acac}); sandboxed iframes / data: documents can read authenticated responses`,
    );
  });
});

// ---------------------------------------------------------------------------------------------
describe("Angriff: Account takeover and privilege escalation", () => {
  test("registration ignores privilege fields in the body (no self-promotion at signup)", async () => {
    const c = freshClient();
    await c.refreshCsrf();
    const name = uniqueName("escreg");
    const r = await c.post("/api/register", {
      username: name,
      email: `${name}@e2e.test`,
      password: STRONG,
      role: "owner",
      isAdmin: 1,
      karma: 99999,
      verified: 1,
      emailVerified: 1,
      adminGroupId: 1,
    });
    const text = await r.text();
    assert.equal(r.status, 201, text);
    const body = JSON.parse(text) as any;
    assert.equal(body.role ?? "user", "user", "register let the body set role");
    assert.ok(!body.isAdmin, "register let the body set isAdmin");
    assert.equal(body.karma ?? 0, 0, "register let the body set karma");
    assert.ok(!body.verified, "register let the body set verified");
  });

  test("PATCH /api/profile ignores privilege fields (no self-promotion)", async () => {
    const victim = await makeUser("escprof", STRONG);
    // Include a cosmetic field so the update is non-empty (an all-stripped body hangs — AUTH-8).
    const r = await victim.client.patch("/api/profile", {
      bio: "hello",
      role: "owner",
      isAdmin: 1,
      karma: 99999,
      verified: 1,
      emailVerified: 1,
      adminGroupId: 1,
    });
    const text = await r.text();
    assert.ok(r.status === 200 || r.status === 400, text);
    const me = await (await victim.client.get("/api/user")).json();
    assert.equal(me.role, "user", "PATCH /api/profile changed the caller's role");
    assert.ok(!me.isAdmin, "PATCH /api/profile set isAdmin");
    assert.equal(me.karma, 0, "PATCH /api/profile changed karma");
  });

  test("PATCH /api/profile cannot change another user via an id in the body (no cross-account write)", async () => {
    const victim = await makeUser("tgtvictim", STRONG);
    const attacker = await makeUser("tgtatk", STRONG);
    const newName = uniqueName("hijack");
    await attacker.client.patch("/api/profile", { id: victim.id, username: newName });
    const stillThere = await attacker.client.get(`/api/users/${victim.username}`);
    assert.equal(stillThere.status, 200, "victim username changed — cross-account write via body id");
  });

  test("password change requires the current password (cannot set a new password without the old one)", async () => {
    const victim = await makeUser("nooldpw", STRONG);
    const r = await victim.client.patch("/api/profile/password", { newPassword: "No-Old-Pw-Needed-1!" });
    assert.equal(r.status, 400, `password changed without currentPassword (status ${r.status})`);
    // the original password must still work
    const c = freshClient();
    const login = await c.login(victim.username, STRONG);
    assert.equal(login.status, 200, "original password no longer works after the no-old-password attempt");
  });

  test("usernames differing only in case are treated as the same (no case-variant impersonation)", async () => {
    const base = `Case${RUN_ID}`.slice(0, 20);
    const a = freshClient();
    await a.refreshCsrf();
    const r1 = await a.post("/api/register", { username: base, email: `${base}@e2e.test`, password: STRONG });
    assert.equal(r1.status, 201, await r1.text());
    const b = freshClient();
    await b.refreshCsrf();
    const r2 = await b.post("/api/register", {
      username: base.toLowerCase(),
      email: `lc_${RUN_ID}@e2e.test`,
      password: STRONG,
    });
    assert.equal(
      r2.status,
      400,
      `"${base.toLowerCase()}" was registered although "${base}" exists; usernames are unique only case-sensitively, enabling impersonation`,
    );
  });

  test("trailing-whitespace username variant is rejected (schema trims)", async () => {
    const base = `Trim${RUN_ID}`.slice(0, 20);
    const a = freshClient();
    await a.refreshCsrf();
    await a.post("/api/register", { username: base, email: `${base}@e2e.test`, password: STRONG });
    const b = freshClient();
    await b.refreshCsrf();
    const r = await b.post("/api/register", { username: `${base}  `, email: `ws_${RUN_ID}@e2e.test`, password: STRONG });
    assert.equal(r.status, 400, "a trailing-space username variant created a second account");
  });

  test.todo(
    "INITIAL_OWNER bootstrap can be squatted: pre-registering the owner username before first boot blocks owner creation (needs a fresh, un-bootstrapped DB; see finding ATK-AUTH-17)",
  );
});

// ---------------------------------------------------------------------------------------------
describe("Angriff: Password policy", () => {
  test("weak/common passwords are rejected", async () => {
    const c = freshClient();
    await c.refreshCsrf();
    const name = uniqueName("weakpw");
    const r = await c.post("/api/register", { username: name, email: `${name}@e2e.test`, password: "password" });
    assert.equal(
      r.status,
      400,
      `the common password "password" was accepted (status ${r.status}); there is no strength/blocklist policy beyond min length 8`,
    );
  });

  test("bcrypt 72-byte truncation: two passwords sharing the first 72 bytes are NOT interchangeable", async () => {
    const name = uniqueName("bcrypt72");
    const prefix = "A".repeat(BCRYPT_MAX_BYTES); // 72 bytes
    const realPw = prefix + "-REAL-TAIL";
    const reg = freshClient();
    await reg.refreshCsrf();
    const r = await reg.post("/api/register", { username: name, email: `${name}@e2e.test`, password: realPw });
    assert.equal(r.status, 201, await r.text());

    // control: a password differing within the first 72 bytes must fail
    const ctrl = freshClient();
    const bad = await ctrl.login(name, "B".repeat(BCRYPT_MAX_BYTES) + "-REAL-TAIL");
    assert.equal(bad.status, 401, "control login unexpectedly succeeded");

    // attack: same first 72 bytes, different tail → bcrypt ignores the tail
    const atk = freshClient();
    const forged = await atk.login(name, prefix + "-COMPLETELY-DIFFERENT-TAIL");
    assert.equal(
      forged.status,
      401,
      "a password sharing only the first 72 bytes logged in; bcrypt silently truncates to 72 bytes and no pre-hash is used, so long passwords share collisions",
    );
  });
});

// ---------------------------------------------------------------------------------------------
describe("Angriff: Banned / frozen account bypass", () => {
  // Attacker: a user/IP the admins have banned or frozen. Goal: keep acting via the auth routes,
  // which are registered before banCheckMiddleware and therefore skip it.

  test("an IP-banned attacker cannot register a new account", async () => {
    const owner = await ownerSession();
    const atkIp = attackIp();
    const banId = await createBan(owner, { ban_type: "ip", ip_address: atkIp });
    try {
      // sanity: a normal feature route is blocked for this IP
      const c = new Client(atkIp);
      const feed = await c.get("/api/feed/communities");
      assert.ok(feed.status === 403, `setup: IP ban not effective on feature route (got ${feed.status})`);
      // the attack: register from the banned IP
      await c.refreshCsrf();
      const name = uniqueName("ipbanreg");
      const r = await c.post("/api/register", { username: name, email: `${name}@e2e.test`, password: STRONG });
      assert.equal(
        r.status,
        403,
        `an IP-banned client registered a fresh account (status ${r.status}); /api/register runs before banCheckMiddleware, so IP/device bans do not cover it`,
      );
    } finally {
      await revokeBan(owner, banId);
    }
  });

  test("an IP-banned attacker cannot log in", async () => {
    const owner = await ownerSession();
    const victim = await makeUser("ipbanlogin", STRONG);
    const atkIp = attackIp();
    const banId = await createBan(owner, { ban_type: "ip", ip_address: atkIp });
    try {
      const c = new Client(atkIp);
      await c.refreshCsrf();
      const r = await c.post("/api/login", { username: victim.username, password: STRONG });
      assert.equal(
        r.status,
        403,
        `an IP-banned client logged in (status ${r.status}); /api/login runs before banCheckMiddleware`,
      );
    } finally {
      await revokeBan(owner, banId);
    }
  });

  test("a frozen account cannot change its profile", async () => {
    const owner = await ownerSession();
    const victim = await makeUser("frzprof", STRONG);
    await setFrozen(owner, victim.id, true);
    try {
      // sanity: a normal write is blocked
      const comment = await victim.client.post("/api/comments", { content: "x", postId: 1 });
      assert.equal(comment.status, 403, `setup: freeze not effective (comment ${comment.status})`);
      const r = await victim.client.patch("/api/profile", { bio: "frozen edit" });
      assert.equal(
        r.status,
        403,
        `a frozen account changed its profile (status ${r.status}); PATCH /api/profile runs before banCheckMiddleware`,
      );
    } finally {
      await setFrozen(owner, victim.id, false);
    }
  });

  test("a frozen account cannot change its password", async () => {
    const owner = await ownerSession();
    const victim = await makeUser("frzpw", STRONG);
    await setFrozen(owner, victim.id, true);
    try {
      const r = await victim.client.patch("/api/profile/password", {
        currentPassword: STRONG,
        newPassword: "Frozen-New-Pw-1!",
      });
      assert.equal(
        r.status,
        403,
        `a frozen account changed its password (status ${r.status}); PATCH /api/profile/password runs before banCheckMiddleware`,
      );
    } finally {
      await setFrozen(owner, victim.id, false);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("Angriff: Maintenance mode and registration-closed bypass", () => {
  // Attacker: anonymous / logged-in non-staff. Goal: act while admins believe the site is closed.
  let owner: Client;
  let maintId: number;
  let regId: number;

  before(async () => {
    owner = await ownerSession();
    maintId = (await getSetting(owner, "maintenance_mode")).id;
    regId = (await getSetting(owner, "registration_enabled")).id;
  });

  after(async () => {
    // Always restore the global settings, whatever the tests did.
    await setSetting(owner, maintId, false);
    await setSetting(owner, regId, true);
  });

  test("maintenance mode blocks normal feature routes for non-admins (baseline)", async () => {
    const user = await makeUser("maintok", STRONG);
    await setSetting(owner, maintId, true);
    try {
      const r = await user.client.get("/api/feed/communities");
      assert.equal(r.status, 503, `maintenance mode did not block a feature route (got ${r.status})`);
    } finally {
      await setSetting(owner, maintId, false);
    }
  });

  test("maintenance mode blocks new registrations", async () => {
    await setSetting(owner, maintId, true);
    try {
      const c = freshClient();
      await c.refreshCsrf();
      const name = uniqueName("maintreg");
      const r = await c.post("/api/register", { username: name, email: `${name}@e2e.test`, password: STRONG });
      assert.equal(
        r.status,
        503,
        `registration succeeded during maintenance (status ${r.status}); /api/register is registered before the maintenance middleware, so its 503 branch is unreachable`,
      );
    } finally {
      await setSetting(owner, maintId, false);
    }
  });

  test("maintenance mode blocks non-admin profile and password edits", async () => {
    const user = await makeUser("maintedit", STRONG);
    await setSetting(owner, maintId, true);
    try {
      const prof = await user.client.patch("/api/profile", { bio: "edited during maintenance" });
      const pw = await user.client.patch("/api/profile/password", {
        currentPassword: STRONG,
        newPassword: "Maint-New-Pw-1!",
      });
      assert.ok(
        prof.status === 503 && pw.status === 503,
        `profile/password edits worked during maintenance (profile ${prof.status}, password ${pw.status}); both routes run before the maintenance middleware`,
      );
    } finally {
      await setSetting(owner, maintId, false);
    }
  });

  test("disabling registration (registration_enabled=false) actually blocks new accounts", async () => {
    await setSetting(owner, regId, false);
    try {
      const c = freshClient();
      await c.refreshCsrf();
      const name = uniqueName("regoff");
      const r = await c.post("/api/register", { username: name, email: `${name}@e2e.test`, password: STRONG });
      assert.notEqual(
        r.status,
        201,
        "registration succeeded while registration_enabled=false; the setting is exposed but never enforced by POST /api/register",
      );
    } finally {
      await setSetting(owner, regId, true);
    }
  });
});
