// Regression tests for the API exposure fixes (findings EXP-API-*, the server-side EXP-BUNDLE items and
// EXP-DB-3 / EXP-DB-7 / EXP-DB-9 / EXP-DB-13): what anonymous visitors, users, community moderators and
// staff without a permission can learn from API answers, headers, cookies and WebSocket events, and what
// anonymous traffic writes into the database.
//
//   E2E_BASE_URL, E2E_ADMIN_USER, E2E_ADMIN_PASSWORD as for the other suites; E2E_DATABASE_URL (optional)
//   enables the checks that count session / activity_logs rows directly in Postgres.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Client, BASE_URL, ADMIN_USER, ADMIN_PASSWORD, RUN_ID, newUser, expectStatus, freshIp } from "./client";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const WS_URL = BASE_URL.replace(/^http/, "ws") + "/ws";
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "";
const needsDb = DATABASE_URL ? false : "E2E_DATABASE_URL not set";

type TestUser = Awaited<ReturnType<typeof newUser>>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let pg: any;
async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!pg) {
    const { default: P } = await import("pg");
    pg = new P.Client({ connectionString: DATABASE_URL });
    await pg.connect();
  }
  return (await pg.query(text, params)).rows;
}

const owner = new Client();
const created: TestUser[] = [];
async function mkUser(tag: string) {
  const u = await newUser(`xa${tag}`);
  created.push(u);
  return u;
}

before(async () => {
  await expectStatus(await owner.login(ADMIN_USER, ADMIN_PASSWORD), 200);
});

after(async () => {
  for (const u of created) await owner.delete(`/api/admin/users/${u.id}`);
  await pg?.end();
});

async function text(res: Response) {
  return { status: res.status, body: await res.text(), type: res.headers.get("content-type") };
}

// ---------------------------------------------------------------------------------------------
describe("operational data", () => {
  test("/api/health only says ok (no uptime)", async () => {
    const res = await fetch(BASE_URL + "/api/health");
    assert.deepEqual(await res.json(), { status: "ok" });
  });

  test("no X-RateLimit-* / RateLimit-* headers (API, login)", async () => {
    const c = new Client();
    const answers = [await c.get("/api/posts"), await c.get("/api/csrf-token")];
    await c.refreshCsrf();
    answers.push(await c.post("/api/login", { username: `nobody_${RUN_ID}`, password: "x" }));
    for (const res of answers) {
      const names = [...res.headers.keys()].filter((h) => /ratelimit/i.test(h));
      assert.deepEqual(names, [], `${res.url}: ${names.join(",")}`);
    }
  });

  test("unknown /api paths answer one generic 404 JSON, never 'User not found'", async () => {
    for (const p of ["/api/nope", "/api/comments?postId=1", "/api/routeowner", "/api/user/routeowner", "/api/admin-x"]) {
      const res = await new Client().get(p);
      assert.equal(res.status, 404, p);
      assert.deepEqual(await res.json(), { error: "Not found" }, p);
    }
    // the real profile route still works
    assert.equal((await new Client().get(`/api/users/${ADMIN_USER}`)).status, 200);
  });

  test("public user objects carry no isAdmin flag", async () => {
    const profile = await (await new Client().get(`/api/users/${ADMIN_USER}`)).json();
    assert.equal(profile.isAdmin, undefined);
    const u = await mkUser("pub");
    const found = await (await u.client.get(`/api/users/search?q=${ADMIN_USER}`)).json();
    assert.ok(found.length > 0 && found.every((x: any) => x.isAdmin === undefined));
    const me = await (await u.client.get("/api/user")).json();
    assert.equal(me.isAdmin, undefined);
  });
});

// ---------------------------------------------------------------------------------------------
describe("staff routes are invisible to non-staff", () => {
  const STAFF = [
    ["GET", "/api/admin/stats"],
    ["GET", "/api/admin/users"],
    ["GET", "/api/admin/monitoring/activity-logs"],
    ["GET", "/api/admin/analytics/overview"],
    ["GET", "/api/admin/performance/leaderboard"],
    ["GET", "/api/security/stress-test/available"],
    ["POST", "/api/security/stress-test/authz-probe"],
    ["GET", "/api/security/zzz"],
    ["GET", "/api/reports"],
    ["GET", "/api/tickets/stats"],
    ["DELETE", "/api/tickets/1"],
  ] as const;

  async function compare(c: Client) {
    const wrong: string[] = [];
    for (const [m, p] of STAFF) {
      const unknown = await text(await c.request(m, `/api/unknown-${RUN_ID}`, m === "GET" ? {} : { json: {} }));
      const res = await text(await c.request(m, p, m === "GET" ? {} : { json: {} }));
      if (res.status !== 404 || res.body !== unknown.body || res.type !== unknown.type) wrong.push(`${m} ${p} → ${res.status} ${res.body.slice(0, 80)}`);
    }
    assert.deepEqual(wrong, []);
  }

  test("anonymous (with a CSRF token)", async () => {
    const c = new Client();
    await c.refreshCsrf();
    await compare(c);
  });

  test("a logged-in user", async () => {
    await compare((await mkUser("nst")).client);
  });

  test("staff without the permission still get 403", async () => {
    const admin = await mkUser("adm0");
    await expectStatus(await owner.patch(`/api/admin/users/${admin.id}`, { role: "admin" }), 200);
    await admin.client.login(admin.username, admin.password);
    assert.equal((await admin.client.get("/api/admin/stats")).status, 403);
    assert.equal((await admin.client.get("/api/security/zzz")).status, 404);
  });
});

// ---------------------------------------------------------------------------------------------
describe("sessions and cookies of anonymous visitors", () => {
  test("browsing (pages, static files, translations, GET API) sets no cookie", async () => {
    const ip = freshIp();
    for (const p of ["/", "/feed", "/robots.txt", "/locales/en/translation.json", "/api/posts", "/api/user", "/api/public/settings", "/api/communities"]) {
      const res = await fetch(BASE_URL + p, { headers: { "x-forwarded-for": ip } });
      assert.deepEqual(res.headers.getSetCookie(), [], `${p} set ${res.headers.getSetCookie().join(" | ")}`);
    }
  });

  test("cookieless requests store no session rows; /api/csrf-token creates one", { skip: needsDb }, async () => {
    const [{ n: before }] = await sql("select count(*)::int as n from session");
    const ip = freshIp();
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
      fetch(BASE_URL + (i % 2 ? "/api/posts" : "/robots.txt"), { headers: { "x-forwarded-for": ip } }).then((r) => r.arrayBuffer())));
    const [{ n: afterBrowse }] = await sql("select count(*)::int as n from session");
    assert.ok(afterBrowse - before <= 2, `session rows grew by ${afterBrowse - before} (other suites may run in parallel)`);
    const c = new Client();
    const token = await c.refreshCsrf();
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.ok(c.cookies.has("connect.sid"));
  });

  test("login still works (token from /api/csrf-token), and only then the device cookie is set", async () => {
    const u = await mkUser("dev");
    const c = new Client();
    await c.refreshCsrf();
    assert.ok(!c.cookies.has("ov_device"), "anonymous visitors get no device id");
    const res = await c.post("/api/login", { username: u.username, password: u.password });
    assert.equal(res.status, 200);
    const cookie = res.headers.getSetCookie().find((x) => x.startsWith("ov_device="));
    assert.ok(cookie, "login sets the device id");
    const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie!)?.[1]);
    assert.ok(maxAge > 0 && maxAge <= 366 * 24 * 3600, `device cookie lifetime ${maxAge}s`);
  });
});

// ---------------------------------------------------------------------------------------------
describe("database writes by anonymous traffic", () => {
  test("anonymous 401s (GET /api/user on every page load) write no activity_logs rows", { skip: needsDb }, async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) await fetch(BASE_URL + "/api/user", { headers: { "x-forwarded-for": ip } });
    await sleep(2500); // activity log batches are flushed every 2 s
    const rows = await sql("select count(*)::int as n from activity_logs where ip_address = $1", [ip]);
    assert.equal(rows[0].n, 0);
  });

  test("stored user agents are cut to 300 characters", { skip: needsDb }, async () => {
    const u = await mkUser("ua");
    const longUa = "Mozilla/5.0 " + "x".repeat(12_000);
    const res = await u.client.post("/api/follow/999999999", undefined, { headers: { "user-agent": longUa } });
    assert.ok(res.status >= 400);
    await u.client.patch("/api/profile", { bio: "ua test" }, { headers: { "user-agent": longUa } });
    await u.client.request("POST", "/api/logout", { headers: { "user-agent": longUa } });
    await sleep(2500);
    const rows = await sql("select max(length(user_agent))::int as n from activity_logs where user_id = $1", [u.id]);
    assert.ok(rows[0].n !== null && rows[0].n <= 300, `stored user agent length ${rows[0].n}`);
  });

  test("a failed login for an unknown name does not store the typed name", { skip: needsDb }, async () => {
    const typed = `MyS3cret-Passw0rd-${RUN_ID}`;
    const c = new Client();
    await c.refreshCsrf();
    assert.equal((await c.post("/api/login", { username: typed, password: "whatever" })).status, 401);
    await sleep(2500);
    const rows = await sql("select count(*)::int as n from activity_logs where metadata like $1 or description like $1", [`%${typed}%`]);
    assert.equal(rows[0].n, 0);
  });

  test("requests that fail the CSRF check are rate limited too", async () => {
    const ip = freshIp();
    let limited = false;
    for (let batch = 0; batch < 22 && !limited; batch++) {
      const statuses = await Promise.all(Array.from({ length: 50 }, () =>
        fetch(BASE_URL + "/api/posts", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body: "{}" }).then((r) => r.status)));
      limited = statuses.includes(429);
    }
    assert.ok(limited, "1100 CSRF failures from one address were never answered with 429");
  });
});

// ---------------------------------------------------------------------------------------------
describe("reports: reporter identity and IP", () => {
  let reporter: TestUser;
  let modUser: TestUser;
  let communityId = 0;
  let reportId = 0;

  before(async () => {
    modUser = await mkUser("cmod");
    reporter = await mkUser("rep");
    const author = await mkUser("rau");
    const comm = await modUser.client.post("/api/communities", { name: `xa comm ${RUN_ID}`, description: "exposure" });
    await expectStatus(comm, 201);
    communityId = (await comm.json()).id;
    for (const u of [author, reporter]) await expectStatus(await u.client.post(`/api/communities/${communityId}/join`), 200, 201);
    const post = await author.client.post("/api/posts", { category: "discussion", content: `xa reported ${RUN_ID}`, communityId });
    await expectStatus(post, 201);
    const rep = await reporter.client.post("/api/reports", { reason: "exposure test report", postId: (await post.json()).id });
    await expectStatus(rep, 201);
    reportId = (await rep.json()).id;
  });

  test("a community moderator's PATCH answer has no IP, reporter or staff id", async () => {
    const res = await modUser.client.patch(`/api/communities/${communityId}/reports/${reportId}`, { status: "pending" });
    await expectStatus(res, 200);
    const body = await res.json();
    for (const f of ["ipAddress", "reporterId", "resolvedBy"]) assert.equal(body[f], undefined, f);
  });

  test("staff answers carry no raw reporter IP (admin list: masked)", async () => {
    const list = await (await owner.get("/api/admin/reports?status=pending")).json();
    const row = list.find((r: any) => r.id === reportId);
    assert.ok(row, "report missing in the admin list");
    assert.ok(row.ipAddress === null || /\.x$|::\/48$|^::1$/.test(row.ipAddress), `ip ${row.ipAddress}`);
    const patched = await (await owner.patch(`/api/reports/${reportId}`, { status: "pending" })).json();
    assert.equal(patched.ipAddress, undefined);
    const all = await (await owner.get("/api/reports")).json();
    assert.ok(all.every((r: any) => r.ipAddress === undefined));
    const community = await (await owner.get(`/api/communities/${communityId}/reports`)).json();
    assert.ok(community.every((r: any) => r.ipAddress === undefined));
  });

  test("the reporter's outcome notification does not name the staff member", async () => {
    await expectStatus(await owner.patch(`/api/reports/${reportId}`, { status: "rejected" }), 200);
    await sleep(300);
    const list = await (await reporter.client.get("/api/notifications")).json();
    const n = list.find((x: any) => x.type === "report_rejected");
    assert.ok(n, "no report_rejected notification");
    assert.equal(n.actorId, null);
    assert.equal(n.actor, null);
  });

  test("admin lists are paged (limit + X-Total-Count)", async () => {
    for (const p of ["/api/admin/users", "/api/admin/reports", "/api/admin/bans"]) {
      const res = await owner.get(`${p}?limit=1`);
      await expectStatus(res, 200);
      const rows = await res.json();
      assert.ok(Array.isArray(rows) && rows.length <= 1, p);
      assert.match(res.headers.get("x-total-count") ?? "", /^\d+$/, p);
    }
    const users = await (await owner.get("/api/admin/users?limit=500")).json();
    assert.ok(users.every((u: any) => u.password === undefined));
  });
});

// ---------------------------------------------------------------------------------------------
describe("activity logs in admin answers", () => {
  test("no user agent, email, session/fingerprint ids; masked IPs", async () => {
    const u = await mkUser("lg");
    await u.client.patch("/api/profile", { bio: "log me" });
    await sleep(2500);
    const logs = await (await owner.get("/api/admin/logs")).json();
    const mon = await (await owner.get("/api/admin/monitoring/activity-logs?limit=50")).json();
    const rows = [...logs, ...mon.logs.map((x: any) => x.log)];
    assert.ok(rows.length > 0);
    for (const r of rows) {
      for (const f of ["userAgent", "userEmail", "sessionId", "deviceFingerprint"]) assert.equal(r[f], undefined, f);
      assert.ok(r.ipAddress == null || /\.x$|::\/48$|^::1$|^unknown$/.test(r.ipAddress), `ip ${r.ipAddress}`);
      assert.ok(!/@e2e\.test/.test(JSON.stringify(r)), "an email address in a log row");
    }
    assert.ok(mon.logs.every((x: any) => !x.user || x.user.email === undefined));
  });
});

// ---------------------------------------------------------------------------------------------
describe("shadow-banned accounts", () => {
  let host: TestUser;
  let shadow: TestUser;
  let hostPostId = 0;

  before(async () => {
    host = await mkUser("sh");
    shadow = await mkUser("ss");
    const post = await host.client.post("/api/posts", { category: "discussion", content: `xa host post ${RUN_ID}` });
    await expectStatus(post, 201);
    hostPostId = (await post.json()).id;
    await expectStatus(await owner.post("/api/admin/bulk/users", { user_ids: [shadow.id], action: "shadow", reason: "exposure e2e", duration_hours: 1 }), 200);
    await shadow.client.login(shadow.username, shadow.password);
  });

  test("their comment, like, mention and follow create no notifications and no WS events for others", async () => {
    const ws = new WebSocket(WS_URL, { headers: { cookie: [...host.client.cookies].map(([k, v]) => `${k}=${v}`).join("; "), origin: BASE_URL } });
    const events: any[] = [];
    ws.on("message", (m: Buffer) => events.push(JSON.parse(m.toString())));
    await new Promise((r) => ws.on("open", r));
    try {
      await expectStatus(await shadow.client.post("/api/comments", { postId: hostPostId, content: `shadow says hi @${host.username}` }), 201);
      await expectStatus(await shadow.client.post(`/api/posts/${hostPostId}/react`, { isLike: true }), 200);
      await expectStatus(await shadow.client.post(`/api/follow/${host.id}`), 200);
      await sleep(800);
    } finally {
      ws.close();
    }
    const list = await (await host.client.get("/api/notifications")).json();
    assert.ok(!list.some((n: any) => n.actorId === shadow.id), JSON.stringify(list.map((n: any) => n.type)));
    assert.ok(!events.some((e) => e.type === "new_comment" && e.postId === hostPostId), "new_comment event about a hidden comment");
    assert.ok(!events.some((e) => e.type === "notification"), "a notification event reached the host");
  });

  test("counts leave them out for others, but not for the shadow-banned user", async () => {
    const anonDetail = await (await new Client().get(`/api/posts/${hostPostId}`)).json();
    assert.equal(anonDetail.likes, 0, "like of the shadow-banned user counted");
    const feed = await (await new Client().get("/api/posts?limit=100")).json();
    const card = feed.find((p: any) => p.id === hostPostId);
    assert.ok(card, "host post not in the feed");
    assert.equal(card.commentCount, 0);
    assert.equal(card.reactions.likes, 0);
    const profile = await (await new Client().get(`/api/users/${host.username}`)).json();
    assert.equal(profile.stats.followers, 0);
    const followers = await (await host.client.get("/api/followers")).json();
    assert.ok(!followers.some((f: any) => f.id === shadow.id));
    // the shadow-banned user still sees their own activity
    const own = await (await shadow.client.get("/api/posts?limit=100")).json();
    assert.equal(own.find((p: any) => p.id === hostPostId)?.commentCount, 1);
  });
});

// ---------------------------------------------------------------------------------------------
describe("new_report WebSocket event", () => {
  test("only reaches staff with the reports permission, and only carries the id", async () => {
    const logsAdmin = await mkUser("wsl");
    const g = await owner.post("/api/admin/groups", { name: `xa_logs_${RUN_ID}`, description: "exposure", permissions: JSON.stringify(["logs"]) });
    await expectStatus(g, 201);
    const groupId = (await g.json()).id;
    try {
      await expectStatus(await owner.patch(`/api/admin/users/${logsAdmin.id}`, { role: "admin" }), 200);
      await expectStatus(await owner.post("/api/admin/groups/assign", { userId: logsAdmin.id, groupId }), 200);
      await logsAdmin.client.login(logsAdmin.username, logsAdmin.password);
      const open = (c: Client) => new Promise<{ ws: any; events: any[] }>((resolve) => {
        const ws = new WebSocket(WS_URL, { headers: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join("; "), origin: BASE_URL } });
        const events: any[] = [];
        ws.on("message", (m: Buffer) => events.push(JSON.parse(m.toString())));
        ws.on("open", () => resolve({ ws, events }));
      });
      const [a, o] = [await open(logsAdmin.client), await open(owner)];
      const author = await mkUser("wsa");
      const reporter = await mkUser("wsr");
      const post = await author.client.post("/api/posts", { category: "discussion", content: `xa ws report ${RUN_ID}` });
      await expectStatus(post, 201);
      await expectStatus(await reporter.client.post("/api/reports", { reason: "ws exposure", postId: (await post.json()).id }), 201);
      await sleep(800);
      a.ws.close();
      o.ws.close();
      assert.ok(!a.events.some((e) => e.type === "new_report"), "an admin without 'reports' got new_report");
      const ev = o.events.find((e) => e.type === "new_report");
      assert.ok(ev, "the owner got no new_report");
      assert.deepEqual(Object.keys(ev.data), ["id"]);
    } finally {
      await owner.delete(`/api/admin/groups/${groupId}`);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("support tickets as their creator sees them", () => {
  test("no staff ids/names, no internal metrics, non-sequential ticket numbers", async () => {
    const u = await mkUser("tk");
    const body = { title: `Exposure ticket ${RUN_ID}`, description: "x".repeat(60), type: "other", priority: "low" };
    const t1 = await (await u.client.post("/api/tickets", body)).json();
    const t2 = await (await u.client.post("/api/tickets", body)).json();
    assert.match(t1.ticket.ticketNumber, /^TKT-\d{4}-[2-9A-HJKMNP-Z]{6}$/);
    assert.notEqual(t1.ticket.ticketNumber, t2.ticket.ticketNumber);
    const ownerId = (await (await owner.get("/api/user")).json()).id;
    await expectStatus(await owner.patch(`/api/tickets/${t1.ticket.id}`, { assignedTo: ownerId }), 200);
    await expectStatus(await owner.post(`/api/tickets/${t1.ticket.id}/comments`, { content: "staff reply" }), 201);
    const view = await (await u.client.get(`/api/tickets/${t1.ticket.id}`)).json();
    assert.equal(view.ticket.assignedTo, true);
    assert.equal(view.ticket.responseTimeSeconds, undefined);
    assert.equal(view.ticket.resolutionTimeSeconds, undefined);
    const s = JSON.stringify(view);
    assert.ok(!s.includes(ADMIN_USER), "the staff account name is visible to the creator");
    const staffComments = view.comments.filter((c: any) => c.content === "staff reply" || c.changeType === "assignment_change");
    assert.ok(staffComments.length >= 2 && staffComments.every((c: any) => c.authorId === null), JSON.stringify(staffComments));
    const list = await (await u.client.get("/api/tickets")).json();
    assert.ok(list.tickets.every((t: any) => t.assignedTo === null || t.assignedTo === true));
    const notes = await (await u.client.get("/api/notifications")).json();
    assert.ok(!notes.some((n: any) => n.actorId === ownerId), "reply notification names the staff member");
    // staff still see everything
    const staffView = await (await owner.get(`/api/tickets/${t1.ticket.id}`)).json();
    assert.equal(staffView.ticket.assignedTo, ownerId);
  });
});

// ---------------------------------------------------------------------------------------------
describe("errors", () => {
  test("a broken JSON body gets a 4xx without internals", async () => {
    const c = new Client();
    await c.refreshCsrf();
    const res = await c.request("POST", "/api/login", { headers: { "content-type": "application/json" }, json: undefined });
    const raw = await fetch(BASE_URL + "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": c.csrfToken!, cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join("; "), "x-forwarded-for": c.ip },
      body: "{broken",
    });
    assert.ok(res.status >= 400);
    assert.equal(raw.status, 400);
    const t = await raw.text();
    assert.ok(!/stack|at \/|node_modules/i.test(t), t);
  });
});
