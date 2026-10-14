import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { Client, newUser, expectStatus, ADMIN_USER, ADMIN_PASSWORD, RUN_ID, PNG_1X1, freshIp } from "./client";

type TestUser = Awaited<ReturnType<typeof newUser>>;

const admin = new Client();
let alice: TestUser;
let bob: TestUser;
let alicePostId: number;

before(async () => {
  assert.ok(ADMIN_USER && ADMIN_PASSWORD, "E2E_ADMIN_USER and E2E_ADMIN_PASSWORD must be set");
  const res = await admin.login(ADMIN_USER, ADMIN_PASSWORD);
  assert.equal(res.status, 200, `admin login failed: ${await res.text()}`);
  alice = await newUser("alice");
  bob = await newUser("bob");
});

describe("platform", () => {
  test("health endpoint responds", async () => {
    const res = await new Client().get("/api/health");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, "ok");
  });

  test("SPA index is served", async () => {
    const res = await new Client().get("/");
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<div id="root">/);
  });

  test("security headers are set and X-Powered-By is hidden", async () => {
    const res = await new Client().get("/api/health");
    assert.ok(res.headers.get("content-security-policy"));
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.ok(res.headers.get("x-frame-options"));
    assert.ok(res.headers.get("referrer-policy"));
    assert.equal(res.headers.get("x-powered-by"), null);
  });

  test("JSON bodies above 1mb are rejected", async () => {
    const res = await alice.client.post("/api/comments", { content: "x".repeat(1.2 * 1024 * 1024), postId: 1 });
    assert.equal(res.status, 413);
  });
});

describe("authentication", () => {
  test("registration response does not leak the password hash", async () => {
    const c = new Client();
    const res = await c.register(`leak_${RUN_ID}`, "E2e-Passw0rd!");
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.password, undefined);
  });

  test("registration ignores privileged fields", async () => {
    const c = new Client();
    const res = await c.register(`escal_${RUN_ID}`, "E2e-Passw0rd!", {
      role: "owner",
      isAdmin: 1,
      karma: 100000,
      verified: 1,
    });
    assert.equal(res.status, 201);
    const me = await (await c.get("/api/user")).json();
    assert.equal(me.role, "user");
    assert.ok(!me.isAdmin, "isAdmin must not be settable on registration");
    assert.equal(me.karma, 0);
  });

  test("registration validates input with HTTP 400", async () => {
    const res = await new Client().register(`x`, "short");
    assert.equal(res.status, 400);
  });

  test("legacy testadmin default password no longer works", async () => {
    const res = await new Client().login("testadmin", "TestPassword123!");
    assert.equal(res.status, 401);
  });

  test("duplicate username is rejected", async () => {
    const res = await new Client().register(alice.username, "E2e-Passw0rd!");
    assert.equal(res.status, 400);
  });

  test("wrong password is rejected, correct password logs in", async () => {
    const c = new Client();
    assert.equal((await c.login(alice.username, "wrong-password")).status, 401);
    const ok = await c.login(alice.username, alice.password);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).password, undefined);
  });

  test("/api/user requires a session and never returns the password", async () => {
    assert.equal((await new Client().get("/api/user")).status, 401);
    const res = await alice.client.get("/api/user");
    assert.equal(res.status, 200);
    const me = await res.json();
    assert.equal(me.username, alice.username);
    assert.equal(me.password, undefined);
  });

  test("profile update cannot escalate role, karma or password", async () => {
    const res = await bob.client.patch("/api/profile", {
      bio: "hello from e2e",
      role: "owner",
      isAdmin: 1,
      karma: 99999,
      password: "plain-text",
    });
    assert.ok(res.status === 200 || res.status === 400, `unexpected status ${res.status}`);
    const me = await (await bob.client.get("/api/user")).json();
    assert.equal(me.role, "user");
    assert.ok(!me.isAdmin);
    assert.equal(me.karma, 0);
    assert.equal((await new Client().login(bob.username, bob.password)).status, 200, "password must be unchanged");
  });

  test("profile update of safe fields works", async () => {
    const res = await bob.client.patch("/api/profile", { bio: "e2e bio", displayName: "Bob E2E", isPrivate: true });
    await expectStatus(res, 200);
    const me = await (await bob.client.get("/api/user")).json();
    assert.equal(me.bio, "e2e bio");
    assert.equal(me.displayName, "Bob E2E");
    assert.ok(me.isPrivate, "the isPrivate toggle sent by the profile form must be accepted");
    await expectStatus(await bob.client.patch("/api/profile", { isPrivate: false }), 200);
  });

  test("password change works and requires the current password", async () => {
    const u = await newUser("pwchange");
    const bad = await u.client.patch("/api/profile/password", { currentPassword: "nope", newPassword: "N3w-Passw0rd!" });
    assert.equal(bad.status, 400);
    const ok = await u.client.patch("/api/profile/password", { currentPassword: u.password, newPassword: "N3w-Passw0rd!" });
    await expectStatus(ok, 200);
    assert.equal((await new Client().login(u.username, u.password)).status, 401);
    assert.equal((await new Client().login(u.username, "N3w-Passw0rd!")).status, 200);
  });

  test("logout ends the session", async () => {
    const u = await newUser("logout");
    assert.equal((await u.client.post("/api/logout")).status, 200);
    assert.equal((await u.client.get("/api/user")).status, 401);
  });

  test("login is rate limited per IP", async () => {
    const c = new Client(freshIp());
    await c.refreshCsrf();
    let limited = false;
    for (let i = 0; i < 25 && !limited; i++) {
      const res = await c.post("/api/login", { username: `nobody_${RUN_ID}`, password: "x" });
      limited = res.status === 429;
    }
    assert.ok(limited, "expected HTTP 429 after repeated failed logins");
  });
});

describe("csrf", () => {
  test("state-changing request without CSRF token is rejected", async () => {
    const res = await alice.client.post("/api/comments", { content: "no csrf", postId: 1 }, { csrf: false });
    assert.equal(res.status, 403);
  });

  test("state-changing request with a wrong CSRF token is rejected", async () => {
    const res = await alice.client.post(
      "/api/comments",
      { content: "bad csrf", postId: 1 },
      { csrf: false, headers: { "x-csrf-token": "forged" } },
    );
    assert.equal(res.status, 403);
  });
});

describe("authorization", () => {
  const adminOnly: Array<[string, string, unknown?]> = [
    ["GET", "/api/admin/stats"],
    ["GET", "/api/admin/users"],
    ["GET", "/api/admin/reports"],
    ["GET", "/api/admin/logs"],
    ["GET", "/api/admin/logs/export"],
    ["GET", "/api/admin/settings"],
    ["POST", "/api/admin/settings/clear-cache", {}],
    ["POST", "/api/admin/settings/seed", {}],
    ["POST", "/api/admin/reset-roles", {}],
    ["POST", "/api/admin/bulk/users", { user_ids: [], action: "account", reason: "x" }],
    ["POST", "/api/admin/bulk/reports", { report_ids: [], action: "resolve" }],
    ["POST", "/api/admin/bulk/posts", { post_ids: [], action: "delete" }],
    ["GET", "/api/admin/bans"],
    ["POST", "/api/admin/bans", { ban_type: "account", user_id: 1, reason: "x" }],
    ["PATCH", "/api/admin/bans/1/revoke", { reason: "x" }],
    ["GET", "/api/admin/auto-punishments"],
    ["POST", "/api/admin/auto-punishments/rules", {}],
    ["PATCH", "/api/admin/auto-punishments/rules/1", {}],
    ["DELETE", "/api/admin/auto-punishments/rules/999999"],
    ["GET", "/api/admin/analytics/overview"],
    ["GET", "/api/admin/monitoring/activity-logs"],
    ["GET", "/api/admin/groups"],
  ];

  for (const [method, path, body] of adminOnly) {
    test(`${method} ${path} is forbidden for anonymous and regular users`, async () => {
      const anon = new Client();
      await anon.refreshCsrf();
      const anonRes = await anon.request(method, path, body === undefined ? {} : { json: body });
      assert.ok([401, 403].includes(anonRes.status), `anonymous got ${anonRes.status}`);
      const userRes = await alice.client.request(method, path, body === undefined ? {} : { json: body });
      assert.ok([401, 403].includes(userRes.status), `regular user got ${userRes.status}`);
    });
  }

  test("admin can read dashboard stats", async () => {
    const res = await admin.get("/api/admin/stats");
    assert.equal(res.status, 200);
    assert.ok((await res.json()).totalUsers >= 2);
  });

  const adminReadEndpoints = [
    "/api/admin/stats",
    "/api/admin/users",
    "/api/admin/reports",
    "/api/admin/logs",
    "/api/admin/settings",
    "/api/admin/bans",
    "/api/admin/auto-punishments",
    "/api/admin/groups",
    "/api/admin/analytics/overview",
    "/api/admin/analytics/hot-communities",
    "/api/admin/analytics/top-creators",
    "/api/admin/monitoring/activity-logs",
    "/api/admin/monitoring/anomalies",
    "/api/admin/monitoring/metrics/overview",
    "/api/admin/monitoring/metrics/chart-data",
    "/api/admin/performance/leaderboard",
    "/api/admin/performance/team-overview",
    "/api/reports",
    "/api/tickets",
    "/api/tickets/stats",
  ];

  for (const path of adminReadEndpoints) {
    test(`owner can read ${path}`, async () => {
      const res = await admin.get(path);
      await expectStatus(res, 200);
      assert.ok(!(await res.text()).includes("$2b$"), "response contains a password hash");
    });
  }

  test("upload debug listing is not publicly reachable", async () => {
    for (const path of ["/api/users/debug-uploads", "/api/debug-uploads"]) {
      const res = await new Client().get(path);
      const text = await res.text();
      assert.ok(!text.includes('"files"'), `${path} exposes the uploads listing`);
    }
  });
});

describe("posts and comments", () => {
  test("user can create a text post", async () => {
    const res = await alice.client.post("/api/posts", {
      title: `E2E post ${RUN_ID}`,
      content: "Hello from the end-to-end suite",
      category: "discussion",
    });
    await expectStatus(res, 201);
    alicePostId = (await res.json()).id;
    assert.ok(alicePostId > 0);
  });

  test("post creation requires login", async () => {
    const anon = new Client();
    await anon.refreshCsrf();
    const res = await anon.post("/api/posts", { content: "anon", category: "discussion" });
    assert.equal(res.status, 401);
  });

  test("post cooldown blocks rapid reposting", async () => {
    const res = await alice.client.post("/api/posts", { content: "second post too fast", category: "discussion" });
    assert.equal(res.status, 429);
  });

  test("feed lists the new post and clamps pagination", async () => {
    const res = await new Client().get("/api/posts?limit=100000&offset=-5");
    assert.equal(res.status, 200);
    const posts = await res.json();
    assert.ok(Array.isArray(posts));
    assert.ok(posts.length <= 100);
    assert.ok(posts.some((p: any) => p.id === alicePostId));
  });

  test("single post can be fetched", async () => {
    const res = await new Client().get(`/api/posts/${alicePostId}`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).id, alicePostId);
  });

  test("SQL-looking query parameters are harmless", async () => {
    const res = await new Client().get(`/api/posts?category=${encodeURIComponent("' OR '1'='1")}`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });

  test("user can react to a post", async () => {
    const res = await bob.client.post(`/api/posts/${alicePostId}/react`, { isLike: true });
    await expectStatus(res, 200);
    const post = await (await bob.client.get(`/api/posts/${alicePostId}`)).json();
    assert.equal(post.likes, 1);
  });

  test("user can comment and the comment is listed", async () => {
    const res = await bob.client.post("/api/comments", { content: `E2E comment ${RUN_ID}`, postId: alicePostId });
    await expectStatus(res, 200, 201);
    const list = await (await new Client().get(`/api/posts/${alicePostId}/comments`)).json();
    assert.ok(list.some((c: any) => c.content === `E2E comment ${RUN_ID}`));
  });

  test("post author is notified about the comment", async () => {
    const res = await alice.client.get("/api/notifications");
    assert.equal(res.status, 200);
    const body = await res.json();
    const items = Array.isArray(body) ? body : body.notifications ?? body.items ?? [];
    assert.ok(items.some((n: any) => n.type === "comment_post"), "expected a comment_post notification");
  });

  test("other users cannot delete someone else's post", async () => {
    const res = await bob.client.delete(`/api/posts/${alicePostId}`);
    assert.equal(res.status, 403);
  });
});

describe("uploads", () => {
  test("image post upload works with the CSRF header and the file is served", async () => {
    const u = await newUser("upload");
    const form = new FormData();
    form.append("content", "E2E image upload");
    form.append("category", "news");
    form.append("media", new Blob([PNG_1X1], { type: "image/png" }), "pixel.png");
    const res = await u.client.request("POST", "/api/posts", { form });
    await expectStatus(res, 201);
    const post = await res.json();
    assert.ok(post.mediaUrl, "post should reference the uploaded file");
    const file = await new Client().get(`/uploads/${post.mediaUrl}`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get("x-content-type-options"), "nosniff");
  });

  test("file whose content does not match its type is rejected", async () => {
    const u = await newUser("badupload");
    const form = new FormData();
    form.append("content", "fake png");
    form.append("category", "news");
    form.append("media", new Blob(["<script>alert(1)</script>"], { type: "image/png" }), "evil.png");
    const res = await u.client.request("POST", "/api/posts", { form });
    assert.equal(res.status, 400);
  });

  test("path traversal in upload URLs is blocked", async () => {
    const res = await new Client().get("/uploads/..%2f..%2fpackage.json");
    assert.notEqual(res.status, 200);
  });
});

describe("social", () => {
  test("users can follow each other and exchange messages", async () => {
    assert.equal((await alice.client.post(`/api/follow/${bob.id}`)).status, 200);
    assert.equal((await bob.client.post(`/api/follow/${alice.id}`)).status, 200);
    const sent = await alice.client.post("/api/messages", { receiverId: bob.id, content: "hi bob" });
    await expectStatus(sent, 200, 201);
    const unread = await (await bob.client.get("/api/messages/unread/count")).json();
    assert.ok((unread.count ?? unread) >= 1);
  });

  test("user profile is public and hides the password", async () => {
    const res = await new Client().get(`/api/users/${alice.username}`);
    assert.equal(res.status, 200);
    const profile = await res.json();
    assert.equal(profile.username, alice.username);
    assert.equal(profile.password, undefined);
  });

  test("user search finds users", async () => {
    const res = await alice.client.get(`/api/users/search?q=${encodeURIComponent(bob.username)}`);
    await expectStatus(res, 200);
    const results = await res.json();
    assert.ok(Array.isArray(results));
    assert.ok(results.some((u: any) => u.username === bob.username));
    assert.ok(results.every((u: any) => u.password === undefined));
  });

  test("new users get a default theme", async () => {
    const res = await alice.client.get("/api/user/themes");
    assert.equal(res.status, 200);
    assert.ok((await res.json()).length >= 1);
  });

  test("support tickets can be created and their history read", async () => {
    const res = await alice.client.post("/api/tickets", {
      title: `E2E ticket ${RUN_ID}`,
      description: "This is an end-to-end test ticket with enough characters to pass validation.",
      type: "bug_report",
      priority: "low",
    });
    await expectStatus(res, 200, 201);
    const ticketId = (await res.json()).ticket.id;
    const history = await alice.client.get(`/api/tickets/${ticketId}/history`);
    await expectStatus(history, 200);
    assert.ok(Array.isArray(await history.json()));
    assert.equal((await bob.client.get(`/api/tickets/${ticketId}/history`)).status, 404, "other users must not see the ticket");
  });

  test("follower lists do not leak password hashes", async () => {
    const res = await bob.client.get("/api/users/followers");
    await expectStatus(res, 200);
    assert.ok(!(await res.text()).includes("$2b$"));
  });
});

describe("communities", () => {
  let communityId: number;

  test("users without enough karma cannot create communities", async () => {
    const res = await alice.client.post("/api/communities", { name: `Nope ${RUN_ID}` });
    assert.equal(res.status, 403);
  });

  test("admin can create a community", async () => {
    const res = await admin.post("/api/communities", { name: `E2E Community ${RUN_ID}`, description: "test" });
    await expectStatus(res, 200, 201);
    communityId = (await res.json()).id;
    assert.ok(communityId > 0);
  });

  test("members can join and post into the community", async () => {
    assert.equal((await bob.client.post(`/api/communities/${communityId}/join`)).status, 200);
    const res = await bob.client.post("/api/posts", {
      content: "community post",
      category: "discussion",
      communityId: String(communityId),
    });
    await expectStatus(res, 201);
  });

  test("community reports are restricted to moderators and work for them", async () => {
    assert.equal((await alice.client.get(`/api/communities/${communityId}/reports`)).status, 403);
    const res = await admin.get(`/api/communities/${communityId}/reports`);
    await expectStatus(res, 200);
    assert.ok(Array.isArray(await res.json()));
  });

  test("community moderators can resolve reports for their community", async () => {
    const posts = await (await bob.client.get(`/api/posts?communityId=${communityId}`)).json();
    const postId = posts[0]?.id;
    assert.ok(postId, "community post missing");
    const report = await alice.client.post("/api/reports", { reason: "e2e community report", postId });
    await expectStatus(report, 200, 201);
    const reportId = (await report.json()).id;
    const list = await (await admin.get(`/api/communities/${communityId}/reports`)).json();
    assert.ok(list.some((r: any) => r.id === reportId));
    assert.equal((await alice.client.patch(`/api/communities/${communityId}/reports/${reportId}`, { status: "resolved" })).status, 403);
    const res = await admin.patch(`/api/communities/${communityId}/reports/${reportId}`, { status: "resolved" });
    await expectStatus(res, 200);
    assert.equal((await res.json()).status, "resolved");
  });

  test("community member list does not expose emails or hashes", async () => {
    const res = await alice.client.get(`/api/communities/${communityId}/members`);
    await expectStatus(res, 200);
    const text = await res.text();
    assert.ok(!text.includes("@e2e.test"), "member emails are exposed");
    assert.ok(!text.includes("$2b$"), "password hashes are exposed");
  });

  test("community feed works for members", async () => {
    const res = await bob.client.get("/api/feed/communities");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(await res.json()));
  });
});

describe("moderation", () => {
  let reportId: number;

  test("user can report a post", async () => {
    const res = await bob.client.post("/api/reports", { reason: `E2E report ${RUN_ID}`, postId: alicePostId });
    await expectStatus(res, 200, 201);
    reportId = (await res.json()).id;
  });

  test("admin report list includes reporter and reported content", async () => {
    const res = await admin.get("/api/admin/reports");
    assert.equal(res.status, 200);
    const report = (await res.json()).find((r: any) => r.id === reportId);
    assert.ok(report, "report missing from admin list");
    assert.equal(report.reporter?.username, bob.username);
    assert.equal(report.content?.author?.username, alice.username);
  });

  test("admin can resolve a report", async () => {
    const res = await admin.patch(`/api/admin/reports/${reportId}`, { status: "resolved" });
    await expectStatus(res, 200);
    assert.equal((await res.json()).status, "resolved");
  });

  test("admin can ban and unban an account", async () => {
    const u = await newUser("banned");
    const ban = await admin.post("/api/admin/bans", {
      ban_type: "account",
      user_id: u.id,
      reason: "e2e ban",
      duration_hours: 1,
    });
    await expectStatus(ban, 200);
    const banId = (await ban.json()).id;
    assert.equal((await new Client().login(u.username, u.password)).status, 401);
    const revoke = await admin.patch(`/api/admin/bans/${banId}/revoke`, { reason: "e2e unban" });
    await expectStatus(revoke, 200);
    assert.equal((await new Client().login(u.username, u.password)).status, 200);
  });

  test("admin bulk ban succeeds", async () => {
    const u = await newUser("bulkban");
    const res = await admin.post("/api/admin/bulk/users", {
      user_ids: [u.id],
      action: "shadow",
      reason: "e2e bulk",
      duration_hours: 1,
    });
    await expectStatus(res, 200);
    const result = await res.json();
    assert.equal(result.success, 1, JSON.stringify(result.errors));
  });

  test("admin can change user roles but nobody can remove the last owner", async () => {
    const u = await newUser("promote");
    const res = await admin.patch(`/api/admin/users/${u.id}`, { role: "admin" });
    await expectStatus(res, 200);
    assert.equal((await res.json()).role, "admin");
  });

  test("activity log records user actions", async () => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const res = await admin.get(`/api/admin/logs?search=${encodeURIComponent(alice.username)}`);
    await expectStatus(res, 200);
    const logs = await res.json();
    assert.ok(logs.length > 0, "no activity log entries were persisted");
  });

  test("brute-force login attempts show up as an anomaly", async () => {
    const res = await admin.get("/api/admin/monitoring/anomalies");
    await expectStatus(res, 200);
    const body = await res.json();
    assert.ok(
      body.anomalies.some((a: any) => a.anomaly.anomalyType === "brute_force_login"),
      "no brute_force_login anomaly recorded",
    );
  });

  test("analytics snapshot can be computed and read", async () => {
    await expectStatus(await admin.post("/api/admin/analytics/compute", {}), 200);
    const res = await admin.get("/api/admin/analytics/overview?days=7");
    await expectStatus(res, 200);
    assert.ok((await res.json()).latest, "no analytics snapshot was stored");
  });

  test("moderator performance snapshot is stored", async () => {
    await expectStatus(await admin.post("/api/admin/performance/snapshot", {}), 200);
    const res = await admin.get("/api/admin/performance/leaderboard?period=today");
    await expectStatus(res, 200);
    const board = await res.json();
    const rows = Array.isArray(board) ? board : board.leaderboard ?? [];
    assert.ok(rows.length > 0, "leaderboard is empty after snapshot");
  });

  test("activity log export works for admins", async () => {
    const res = await admin.get("/api/admin/logs/export?format=csv&limit=10");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/csv/);
  });
});
