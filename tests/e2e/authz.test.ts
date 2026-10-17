// Access control across all API routes. The routes come from the source (tests/security/routes.ts) and are
// classified in helpers/authz.ts, so a new route is covered by these tests without editing this file.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client, newUser, expectStatus, ADMIN_USER, ADMIN_PASSWORD, RUN_ID } from "./client";
import {
  PERMISSIONS,
  type Permission,
  type ClassifiedRoute,
  classifiedRoutes,
  roleOnlyRoutes,
  NUMERIC_PARAMS,
  paramsOf,
  fillPath,
  LEAK,
} from "./helpers/authz";

type TestUser = Awaited<ReturnType<typeof newUser>>;

const ROUTES = classifiedRoutes();
const NONEXISTENT = 99999990;
// A name no stress test has: if the guard ever lets a caller through, nothing is started.
const STRESS_PROBE = "authz-probe-does-not-exist";

const owner = new Client();
let victim: TestUser; // owns the objects other callers poke at
let user: TestUser; // plain user, the "attacker"
let csrfUser: TestUser;
let logoutUser: TestUser;
let ownerB: TestUser; // second platform owner, created by the test so owner-protection can be tried safely
let adminNone: TestUser; // role admin, no group
let adminAll: TestUser; // role admin, group with every permission
const adminWith = {} as Record<Permission, TestUser>; // role admin, group with exactly that permission
const groupOf = {} as Record<Permission | "all", number>;
const createdGroups: number[] = [];
const createdUsers: TestUser[] = [];

const fx = {
  postId: 0,
  ownerPostId: 0,
  commentId: 0,
  reportId: 0,
  notificationId: 0,
  ticketId: 0,
  ticketCommentId: 0,
  themeId: 0,
  communityId: 0,
  communitySlug: "",
  privateCommunityId: 0,
};

type Res = { status: number; text: string; headers: Headers };

async function call(c: Client, method: string, path: string, body?: unknown, opts: { csrf?: boolean } = {}): Promise<Res> {
  const m = method.toUpperCase();
  const res = await c.request(m, path, m === "GET" ? opts : { json: body ?? {}, ...opts });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

async function mkUser(prefix: string): Promise<TestUser> {
  const u = await newUser(prefix);
  createdUsers.push(u);
  return u;
}

async function mkGroup(name: string, permissions: string[]): Promise<number> {
  const res = await owner.post("/api/admin/groups", {
    name: `az_${RUN_ID}_${name}`,
    description: "authz e2e",
    permissions: JSON.stringify(permissions),
  });
  await expectStatus(res, 201);
  const id = (await res.json()).id as number;
  createdGroups.push(id);
  return id;
}

async function makeAdmin(u: TestUser, groupId: number | null) {
  await expectStatus(await owner.patch(`/api/admin/users/${u.id}`, { role: "admin" }), 200);
  if (groupId !== null) await expectStatus(await owner.post("/api/admin/groups/assign", { userId: u.id, groupId }), 200);
}

async function setGroup(u: TestUser, groupId: number | null) {
  await expectStatus(await owner.patch(`/api/admin/users/${u.id}`, { adminGroupId: groupId }), 200);
}

async function ownerView(id: number): Promise<any> {
  const list = await (await owner.get("/api/admin/users")).json();
  return list.find((x: any) => x.id === id);
}

/** An existing object id for a path parameter (or a harmless value for non-id params). */
function existing(route: ClassifiedRoute, param: string): string | number {
  const p = route.path;
  if (param === "username") return victim.username;
  if (param === "slug") return fx.communitySlug;
  if (param === "testName") return STRESS_PROBE;
  if (param === "fileRef") return "authz-none.webp";
  if (p.startsWith("/api/admin/users")) return victim.id;
  if (p.startsWith("/api/admin/groups")) return groupOf.all;
  if (p.startsWith("/api/admin/reports") || p.startsWith("/api/reports")) return fx.reportId;
  if (p.startsWith("/api/admin/performance/moderator")) return user.id;
  if (p.startsWith("/api/admin")) return NONEXISTENT; // settings, bans, rules are shared — never point at real ones
  if (p.startsWith("/api/posts")) return fx.postId;
  if (p.startsWith("/api/comments")) return fx.commentId;
  if (p.startsWith("/api/communities")) return param === "id" ? fx.communityId : param === "userId" ? victim.id : NONEXISTENT;
  if (/\/follow\/|\/messages\//.test(p)) return victim.id;
  if (p.startsWith("/api/notifications")) return fx.notificationId;
  if (p.startsWith("/api/user/themes")) return fx.themeId;
  if (p.startsWith("/api/tickets")) return param === "cId" ? fx.ticketCommentId : fx.ticketId;
  return 1;
}

/** For mutating calls by privileged users, ids point at nothing so a broken guard cannot touch real data. */
const safeId = (route: ClassifiedRoute, param: string) =>
  route.method === "get" ? existing(route, param) : NUMERIC_PARAMS.has(param) ? NONEXISTENT : existing(route, param);

before(async () => {
  assert.ok(ADMIN_USER && ADMIN_PASSWORD, "E2E_ADMIN_USER and E2E_ADMIN_PASSWORD must be set");
  assert.equal((await owner.login(ADMIN_USER, ADMIN_PASSWORD)).status, 200, "owner login failed");

  [victim, user, csrfUser, logoutUser, ownerB, adminNone, adminAll] = await Promise.all(
    ["azvictim", "azuser", "azcsrf", "azlogout", "azownerb", "aza_none", "aza_all"].map(mkUser),
  );
  const permAdmins = await Promise.all(PERMISSIONS.map((p) => mkUser(`aza_${p}`)));
  PERMISSIONS.forEach((p, i) => (adminWith[p] = permAdmins[i]));

  groupOf.all = await mkGroup("all", [...PERMISSIONS]);
  for (const p of PERMISSIONS) groupOf[p] = await mkGroup(p, [p]);
  await makeAdmin(adminNone, null);
  await makeAdmin(adminAll, groupOf.all);
  for (const p of PERMISSIONS) await makeAdmin(adminWith[p], groupOf[p]);
  await expectStatus(await owner.patch(`/api/admin/users/${ownerB.id}`, { role: "owner" }), 200);

  const post = await victim.client.post("/api/posts", { title: `authz ${RUN_ID}`, content: "authz post", category: "discussion" });
  await expectStatus(post, 201);
  fx.postId = (await post.json()).id;
  const ownerPost = await ownerB.client.post("/api/posts", { title: `authz owner ${RUN_ID}`, content: "owner post", category: "discussion" });
  await expectStatus(ownerPost, 201);
  fx.ownerPostId = (await ownerPost.json()).id;

  const comment = await victim.client.post("/api/comments", { content: "authz comment", postId: fx.postId });
  await expectStatus(comment, 201);
  fx.commentId = (await comment.json()).id;

  const report = await user.client.post("/api/reports", { reason: `authz report ${RUN_ID}`, postId: fx.postId });
  await expectStatus(report, 201);
  fx.reportId = (await report.json()).id;

  await expectStatus(await user.client.post(`/api/follow/${victim.id}`), 200);
  const notes = await (await victim.client.get("/api/notifications")).json();
  const note = (Array.isArray(notes) ? notes : notes.notifications).find((n: any) => n.actorId === user.id);
  assert.ok(note, "victim got no follow notification");
  fx.notificationId = note.id;

  const ticket = await victim.client.post("/api/tickets", {
    title: `authz ticket ${RUN_ID}`,
    description: "Ticket created by the access-control suite, long enough to pass validation.",
    type: "bug_report",
    priority: "low",
  });
  await expectStatus(ticket, 201);
  fx.ticketId = (await ticket.json()).ticket.id;
  const tc = await victim.client.post(`/api/tickets/${fx.ticketId}/comments`, { content: "authz ticket comment" });
  await expectStatus(tc, 201);
  fx.ticketCommentId = (await tc.json()).comments.find((c: any) => c.content === "authz ticket comment").id;

  fx.themeId = (await (await victim.client.get("/api/user/themes")).json())[0].id;

  const community = await owner.post("/api/communities", { name: `AZ ${RUN_ID}`, description: "authz" });
  await expectStatus(community, 201);
  const cj = await community.json();
  fx.communityId = cj.id;
  fx.communitySlug = cj.slug;
  const priv = await owner.post("/api/communities", { name: `AZ private ${RUN_ID}`, description: "authz", isPrivate: true });
  await expectStatus(priv, 201);
  fx.privateCommunityId = (await priv.json()).id;
});

after(async () => {
  // ownerB may have been demoted or banned by a failing test; make it a plain user so it can be deleted.
  if (ownerB) await owner.patch(`/api/admin/users/${ownerB.id}`, { role: "user", karma: 0 });
  for (const u of createdUsers) await owner.delete(`/api/admin/users/${u.id}`);
  for (const id of createdGroups) await owner.delete(`/api/admin/groups/${id}`);
});

describe("route inventory", () => {
  test("the inventory finds the API routes", () => {
    assert.ok(ROUTES.length >= 150, `only ${ROUTES.length} routes found`);
  });

  test("every admin-area route has a role or permission guard (route or router level)", () => {
    const unguarded = ROUTES.filter(
      (r) => /^\/api\/(admin|security)(\/|$)/.test(r.path) && !r.guards.some((g) => /^(isAdmin|isOwner|hasPermission\()/.test(g)),
    ).map((r) => `${r.key} (${r.file}:${r.line})`);
    assert.deepEqual(unguarded, []);
  });

  test("admin routes check a group permission, not just the admin role", () => {
    assert.deepEqual(roleOnlyRoutes(ROUTES), []);
  });
});

describe("anonymous callers", () => {
  for (const r of ROUTES.filter((r) => r.access.kind !== "public")) {
    test(`${r.key} rejects anonymous requests`, async () => {
      const anon = new Client();
      await anon.refreshCsrf(); // so a 403 is about the missing login, not the missing token
      const res = await call(anon, r.method, fillPath(r.path, (p) => existing(r, p)));
      assert.ok([401, 403].includes(res.status), `got ${res.status}: ${res.text.slice(0, 150)}`);
    });
  }
});

describe("regular users", () => {
  for (const r of ROUTES.filter((r) => r.access.kind === "admin" || r.access.kind === "owner")) {
    test(`${r.key} is forbidden for a regular user`, async () => {
      const res = await call(user.client, r.method, fillPath(r.path, (p) => existing(r, p)));
      assert.equal(res.status, 403, res.text.slice(0, 150));
    });
  }
});

describe("admin group permissions", () => {
  for (const r of ROUTES.filter((r) => r.access.kind === "admin")) {
    const needed = (r.access as { permission: Permission }).permission;
    test(`${r.key} needs the "${needed}" permission`, async () => {
      const path = fillPath(r.path, (p) => safeId(r, p)) + (r.path.endsWith("/logs/export") ? "?limit=1" : "");
      const wrong: string[] = [];
      for (const [who, u] of [["no group", adminNone], ...PERMISSIONS.filter((p) => p !== needed).map((p) => [p, adminWith[p]])] as const) {
        const res = await call((u as TestUser).client, r.method, path);
        if (res.status !== 403) wrong.push(`admin with ${who} → ${res.status}`);
      }
      if (r.method === "get") {
        const res = await call(adminWith[needed].client, r.method, path);
        if ([401, 403].includes(res.status)) wrong.push(`admin with "${needed}" was refused (${res.status})`);
      }
      assert.deepEqual(wrong, []);
    });
  }

  test("a missing permission is answered with 403 PERMISSION_DENIED naming the permission", async () => {
    const res = await adminNone.client.get("/api/admin/stats");
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, "PERMISSION_DENIED");
    assert.equal(body.permission, "dashboard");
  });

  test("assigning and removing a group changes access immediately", async () => {
    try {
      await setGroup(adminNone, groupOf.settings);
      assert.equal((await adminNone.client.get("/api/admin/settings")).status, 200);
      await setGroup(adminNone, null);
      assert.equal((await adminNone.client.get("/api/admin/settings")).status, 403);
    } finally {
      await setGroup(adminNone, null);
    }
  });

  test("deleting a group revokes the permissions of its members", async () => {
    const temp = await mkGroup("temp", ["dashboard"]);
    try {
      await setGroup(adminNone, temp);
      assert.equal((await adminNone.client.get("/api/admin/stats")).status, 200);
      await expectStatus(await owner.delete(`/api/admin/groups/${temp}`), 204);
      assert.equal((await adminNone.client.get("/api/admin/stats")).status, 403);
    } finally {
      await setGroup(adminNone, null);
    }
  });

  test("an admin without the groups permission cannot create a group", async () => {
    const res = await adminNone.client.post("/api/admin/groups", {
      name: `az_${RUN_ID}_rogue`,
      permissions: JSON.stringify([...PERMISSIONS]),
    });
    if (res.status === 201) createdGroups.push((await res.json()).id);
    assert.equal(res.status, 403);
  });

  test("an admin without the groups permission cannot put themselves into a group", async () => {
    try {
      const res = await adminNone.client.post("/api/admin/groups/assign", { userId: adminNone.id, groupId: groupOf.all });
      assert.equal(res.status, 403);
      assert.equal((await adminNone.client.get("/api/admin/settings")).status, 403, "admin gained the settings permission");
    } finally {
      await setGroup(adminNone, null);
    }
  });

  test("the users permission does not let an admin change their own group", async () => {
    const admin = adminWith.users;
    try {
      const res = await admin.client.patch(`/api/admin/users/${admin.id}`, { adminGroupId: groupOf.all });
      assert.ok(res.status === 403 || (await ownerView(admin.id)).adminGroupId === groupOf.users, `got ${res.status}`);
      assert.equal((await admin.client.get("/api/admin/settings")).status, 403, "admin gained the settings permission");
    } finally {
      await setGroup(admin, groupOf.users);
    }
  });

  test("an admin without the tickets permission cannot read other users' support tickets", async () => {
    const one = await adminNone.client.get(`/api/tickets/${fx.ticketId}`);
    assert.ok([403, 404].includes(one.status), `single ticket: got ${one.status}`);
    const list = await (await adminNone.client.get("/api/tickets?limit=100")).json();
    const tickets = list.tickets ?? list.data ?? list;
    assert.ok(!JSON.stringify(tickets).includes(`authz ticket ${RUN_ID}`), "ticket list contains another user's ticket");
  });
});

describe("owner-only actions", () => {
  for (const r of ROUTES.filter((r) => r.access.kind === "owner")) {
    test(`${r.key} is refused for an admin with every permission`, async () => {
      const res = await call(adminAll.client, r.method, fillPath(r.path, (p) => safeId(r, p)));
      assert.equal(res.status, 403, res.text.slice(0, 150));
    });
  }

  test("an admin cannot promote anyone to owner", async () => {
    for (const body of [{ role: "owner" }, { role: "owner", isAdmin: true }]) {
      const res = await adminAll.client.patch(`/api/admin/users/${victim.id}`, body);
      assert.equal(res.status, 403, `${JSON.stringify(body)} → ${res.status}`);
    }
    assert.equal((await ownerView(victim.id)).role, "user");
  });

  test("an admin cannot delete an owner", async () => {
    const res = await adminAll.client.delete(`/api/admin/users/${ownerB.id}`);
    assert.equal(res.status, 403);
    assert.equal((await ownerView(ownerB.id))?.role, "owner");
  });

  test("an admin cannot delete a post written by an owner", async () => {
    const res = await adminNone.client.delete(`/api/posts/${fx.ownerPostId}`);
    assert.equal(res.status, 403);
    assert.equal((await new Client().get(`/api/posts/${fx.ownerPostId}`)).status, 200);
  });

  test("an admin cannot demote another owner", async () => {
    try {
      const res = await adminAll.client.patch(`/api/admin/users/${ownerB.id}`, { role: "admin" });
      assert.equal(res.status, 403);
      assert.equal((await ownerView(ownerB.id)).role, "owner");
    } finally {
      await owner.patch(`/api/admin/users/${ownerB.id}`, { role: "owner" });
    }
  });

  test("an admin cannot lock an owner out by setting negative karma", async () => {
    try {
      const res = await adminAll.client.patch(`/api/admin/users/${ownerB.id}`, { karma: -1 });
      assert.equal(res.status, 403);
      assert.equal((await ownerView(ownerB.id)).karma, 0);
    } finally {
      await owner.patch(`/api/admin/users/${ownerB.id}`, { karma: 0 });
    }
  });
});

describe("csrf protection", () => {
  for (const r of ROUTES.filter((r) => r.method !== "get")) {
    test(`${r.key} without a CSRF token is rejected for a logged-in user`, async () => {
      const u = r.key === "POST /api/logout" ? logoutUser : csrfUser;
      const res = await call(u.client, r.method, fillPath(r.path, (p) => safeId(r, p)), {}, { csrf: false });
      assert.equal(res.status, 403, res.text.slice(0, 150));
    });
  }
});

describe("object ownership", () => {
  test("users cannot mark another user's notification as read", async () => {
    const res = await user.client.post(`/api/notifications/${fx.notificationId}/read`);
    assert.ok([403, 404].includes(res.status), `got ${res.status}`);
    const notes = await (await victim.client.get("/api/notifications")).json();
    const note = (Array.isArray(notes) ? notes : notes.notifications).find((n: any) => n.id === fx.notificationId);
    assert.ok(!note?.read, "the victim's notification was marked as read");
  });

  test("users cannot delete another user's notification", async () => {
    const res = await user.client.delete(`/api/notifications/${fx.notificationId}`);
    assert.ok([403, 404].includes(res.status), `got ${res.status}`);
    const notes = await (await victim.client.get("/api/notifications")).json();
    const list = Array.isArray(notes) ? notes : notes.notifications;
    assert.ok(list.some((n: any) => n.id === fx.notificationId), "the victim's notification is gone");
  });

  test("notifications do not expose the acting user's email or password hash", async () => {
    const text = await (await victim.client.get("/api/notifications")).text();
    assert.ok(text.includes(user.username), "follow notification missing");
    assert.ok(!text.includes("$2b$"), "notification contains a password hash");
    assert.ok(!text.includes(`${user.username}@e2e.test`), "notification contains the actor's email");
  });

  test("users cannot change or delete another user's theme", async () => {
    const patch = await user.client.patch(`/api/user/themes/${fx.themeId}`, { name: "hijacked" });
    assert.ok([403, 404].includes(patch.status), `PATCH got ${patch.status}`);
    const del = await user.client.delete(`/api/user/themes/${fx.themeId}`);
    assert.ok([403, 404].includes(del.status), `DELETE got ${del.status}`);
    const themes = await (await victim.client.get("/api/user/themes")).json();
    assert.ok(themes.some((t: any) => t.id === fx.themeId && t.name !== "hijacked"));
  });

  test("users cannot delete another user's comment", async () => {
    assert.equal((await user.client.delete(`/api/comments/${fx.commentId}`)).status, 403);
  });

  test("users cannot close or comment on another user's ticket", async () => {
    assert.equal((await user.client.patch(`/api/tickets/${fx.ticketId}`, { status: "closed" })).status, 404);
    assert.equal((await user.client.post(`/api/tickets/${fx.ticketId}/comments`, { content: "x" })).status, 404);
    assert.equal((await user.client.delete(`/api/tickets/${fx.ticketId}/comments/${fx.ticketCommentId}`)).status, 404);
  });

  test("community moderation endpoints reject non-members", async () => {
    const c = `/api/communities/${fx.communityId}`;
    const calls: Array<[string, string, unknown?]> = [
      ["GET", `${c}/requests`],
      ["GET", `${c}/bans`],
      ["GET", `${c}/reports`],
      ["PATCH", `${c}/reports/${NONEXISTENT}`, { status: "resolved" }],
      ["POST", `${c}/requests/${victim.id}/approve`],
      ["POST", `${c}/requests/${victim.id}/decline`],
      ["DELETE", `${c}/members/${victim.id}`],
      ["PATCH", `${c}/members/${user.id}/role`, { role: "owner" }],
      ["POST", `${c}/ban`, { userId: victim.id, reason: "authz" }],
      ["DELETE", `${c}/ban/${victim.id}`],
      ["POST", `${c}/moderators`, { userId: user.id }],
      ["POST", `${c}/invite`, { userId: user.id }],
    ];
    const wrong: string[] = [];
    for (const [m, p, b] of calls) {
      const res = await call(user.client, m, p, b);
      if (res.status !== 403) wrong.push(`${m} ${p} → ${res.status}`);
    }
    assert.deepEqual(wrong, []);
  });

  test("the member list of a private community is hidden from non-members", async () => {
    const res = await user.client.get(`/api/communities/${fx.privateCommunityId}/members`);
    assert.equal(res.status, 403);
  });
});

// Route-specific bodies that pass validation, so the id is actually parsed by the handler.
const BODIES: Record<string, () => unknown> = {
  "PATCH /api/admin/users/:id": () => ({ displayName: "authz probe" }),
  "PATCH /api/admin/reports/:id": () => ({ status: "pending" }),
  "PATCH /api/reports/:id": () => ({ status: "pending" }),
  "PATCH /api/admin/settings/:id": () => ({ value: "authz" }),
  "PATCH /api/admin/bans/:id/revoke": () => ({ reason: "authz probe" }),
  "PATCH /api/admin/groups/:id": () => ({ description: "authz probe" }),
  "POST /api/communities/:id/ban": () => ({ userId: victim.id, reason: "authz" }),
  "POST /api/communities/:id/invite": () => ({ userId: victim.id }),
  "POST /api/communities/:id/moderators": () => ({ userId: victim.id }),
  "PATCH /api/communities/:id/members/:userId/role": () => ({ role: "member" }),
  "PATCH /api/communities/:id/reports/:reportId": () => ({ status: "resolved" }),
  "POST /api/posts/:id/react": () => ({ isLike: true }),
  "PATCH /api/tickets/:id": () => ({ status: "closed" }),
  "POST /api/tickets/:id/comments": () => ({ content: "authz probe" }),
  "PATCH /api/tickets/:id/comments/:cId": () => ({ content: "authz probe" }),
  "PATCH /api/user/themes/:id": () => ({ name: "authz probe" }),
};

describe("numeric path parameters", () => {
  const probeOwner = new Client(); // own IP, so the admin rate limit of the shared owner client is untouched
  before(async () => {
    assert.equal((await probeOwner.login(ADMIN_USER, ADMIN_PASSWORD)).status, 200);
  });

  for (const r of ROUTES.filter((r) => paramsOf(r.path).some((p) => NUMERIC_PARAMS.has(p)))) {
    test(`${r.key} answers malformed ids with 4xx`, async () => {
      const caller =
        r.access.kind === "public" ? new Client()
        : r.access.kind !== "user" ? probeOwner
        : /^\/api\/(tickets|user\/themes)/.test(r.path) ? victim.client // the object's owner gets past the ownership check
        : user.client;
      const wrong: string[] = [];
      for (const param of paramsOf(r.path).filter((p) => NUMERIC_PARAMS.has(p))) {
        // "<id>.5" must not be read as <id>; DELETEs use a missing id so a lax parser cannot delete anything.
        const base = r.method === "delete" ? NONEXISTENT : existing(r, param);
        for (const bad of ["abc", "-1", "0", `${base}.5`, "99999999999"]) {
          const path = fillPath(r.path, (p) => (p === param ? bad : existing(r, p)));
          const res = await call(caller, r.method, path, BODIES[r.key]?.());
          if (res.status < 400 || res.status >= 500 || LEAK.test(res.text)) {
            wrong.push(`:${param}=${bad} → ${res.status} ${res.text.slice(0, 80).replace(/\s+/g, " ")}`);
          }
        }
      }
      assert.deepEqual(wrong, []);
    });
  }
});

describe("cross-origin requests", () => {
  test("credentialed CORS is not granted to arbitrary origins", async () => {
    const res = await user.client.get("/api/csrf-token", { headers: { origin: "https://evil.example" } });
    const allowed = res.headers.get("access-control-allow-origin");
    const creds = res.headers.get("access-control-allow-credentials");
    assert.ok(!(creds === "true" && (allowed === "https://evil.example" || allowed === "*")), `ACAO=${allowed} ACAC=${creds}`);
  });
});
