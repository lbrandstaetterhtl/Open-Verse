// AUTHZ attack scenarios for Osiris / Open-Verse.
//
// Attacker-goal oriented: each describe("Angriff: …") takes the role of an attacker with a concrete
// goal (become admin, read/alter another user's data, see private/shadow-banned content, act outside
// their remit) and chains the steps. Every test asserts the SAFE outcome, so a test that currently
// FAILS documents a live vulnerability that must pass once fixed.
//
// Run: E2E_BASE_URL=http://127.0.0.1:5082 E2E_ADMIN_USER=routeowner E2E_ADMIN_PASSWORD='…' \
//      npx tsx --test --test-reporter=spec tests/attacks/authz.attack.test.ts
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_USER, ADMIN_PASSWORD } from "../e2e/client";
import {
  Client, newUser, expectStatus, RUN_ID, type Actor,
  ALL_PERMISSIONS, createGroup, promoteToAdmin, promoteToOwner, adminUserView,
  createCommunity, createPost, createTicket,
} from "./helpers/authz";

const owner = new Client(); // platform owner (role owner)

// Fixtures shared across scenarios.
let alice: Actor;        // ordinary attacker
let bob: Actor;          // ordinary victim
let carol: Actor;        // ordinary third party (used to generate notifications etc.)
let ownerB: Actor;       // a second platform owner (victim of admin-vs-owner attacks)
let adminNone: Actor;    // role admin, NO group (no permissions)
let adminUsers: Actor;   // role admin, group with only "users"
let adminAll: Actor;     // role admin, group with every permission
let groupAll: number;    // id of the all-permissions group

async function mkActor(prefix: string): Promise<Actor> {
  return newUser(prefix);
}

before(async () => {
  assert.ok(ADMIN_USER && ADMIN_PASSWORD, "E2E_ADMIN_USER / E2E_ADMIN_PASSWORD must be set");
  assert.equal((await owner.login(ADMIN_USER, ADMIN_PASSWORD)).status, 200, "owner login failed");

  [alice, bob, carol, ownerB, adminNone, adminUsers, adminAll] = await Promise.all(
    ["atkalice", "atkbob", "atkcarol", "atkownerb", "atkadmnone", "atkadmusers", "atkadmall"].map(mkActor),
  );

  groupAll = await createGroup(owner, "all", ALL_PERMISSIONS);
  const groupUsers = await createGroup(owner, "users", ["users"]);

  await promoteToAdmin(owner, adminNone, null);
  await promoteToAdmin(owner, adminUsers, groupUsers);
  await promoteToAdmin(owner, adminAll, groupAll);
  await promoteToOwner(owner, ownerB);

  // Posts have a per-user cooldown (default 30s) that would 429 the scenarios that create several
  // posts in quick succession. Disable it for the run and restore it in after().
  const settings = await (await owner.get("/api/admin/settings")).json();
  const cooldown = Array.isArray(settings) ? settings.find((s: any) => s.key === "post_cooldown_seconds") : undefined;
  if (cooldown) {
    cooldownSettingId = cooldown.id;
    cooldownOriginal = cooldown.value;
    await owner.patch(`/api/admin/settings/${cooldown.id}`, { value: "0" });
    await owner.post("/api/admin/settings/clear-cache", {});
  }
});

let cooldownSettingId: number | undefined;
let cooldownOriginal: string | undefined;

after(async () => {
  if (cooldownSettingId !== undefined && cooldownOriginal !== undefined) {
    await owner.patch(`/api/admin/settings/${cooldownSettingId}`, { value: cooldownOriginal });
    await owner.post("/api/admin/settings/clear-cache", {});
  }
});

// =====================================================================================
// VERTICAL ESCALATION
// =====================================================================================

describe("Angriff: normaler Nutzer greift Admin-Gruppen-Verwaltung an", () => {
  // Attacker: a logged-in ordinary user. Goal: create/assign an admin group to gain permissions.
  // Steps: call the group-management routes directly.
  test("an ordinary user cannot create an admin group", async () => {
    const res = await alice.client.post("/api/admin/groups", {
      name: `atk_evil_${RUN_ID}`, description: "x", permissions: JSON.stringify([...ALL_PERMISSIONS]),
    });
    // staff routes answer non-staff like an unknown route: 404 {"error":"Not found"} (EXP-BUNDLE-14)
    assert.equal(res.status, 404, `ordinary user created a group: HTTP ${res.status}`);
    assert.deepEqual(await res.json(), { error: "Not found" });
  });

  test("an ordinary user cannot assign themselves to an admin group", async () => {
    const res = await alice.client.post("/api/admin/groups/assign", { userId: alice.id, groupId: groupAll });
    assert.equal(res.status, 404, `ordinary user assigned a group: HTTP ${res.status}`);
    assert.deepEqual(await res.json(), { error: "Not found" });
    const view = await adminUserView(owner, alice.id);
    assert.notEqual(view.adminGroupId, groupAll, "ordinary user ended up in the all-permissions group");
  });
});

describe("Angriff: Admin ohne jede Berechtigung verschafft sich alle Rechte", () => {
  // Attacker: role admin but in no group (hasPermission → everything 403). Goal: full permissions.
  // Chain: POST /api/admin/groups (create all-perms group) → POST /assign (self) → read a gated route.
  // sameAs AUTHZ-1.
  test("an admin without the 'groups' permission cannot create an admin group", async () => {
    const res = await adminNone.client.post("/api/admin/groups", {
      name: `atk_selfmade_${RUN_ID}`, description: "x", permissions: JSON.stringify([...ALL_PERMISSIONS]),
    });
    assert.equal(res.status, 403, `admin without 'groups' created a group: HTTP ${res.status}`);
  });

  test("admin-without-permission → create group → assign self → read settings is blocked somewhere in the chain", async () => {
    // Confirm the escalation lands: baseline that the attacker currently cannot read settings.
    assert.equal((await adminNone.client.get("/api/admin/settings")).status, 403, "precondition: adminNone should not read settings");

    const create = await adminNone.client.post("/api/admin/groups", {
      name: `atk_chain_${RUN_ID}`, description: "x", permissions: JSON.stringify([...ALL_PERMISSIONS]),
    });
    if (create.status === 403) return; // chain blocked at step 1 — safe
    const groupId = (await create.json()).id;
    try {
      await adminNone.client.post("/api/admin/groups/assign", { userId: adminNone.id, groupId });
      await adminNone.client.login(adminNone.username, adminNone.password);

      const settings = await adminNone.client.get("/api/admin/settings");
      assert.equal(settings.status, 403, "admin with no permission escalated to full settings access via self-made group");
    } finally {
      // Always restore, even when the assertion above fails, so adminNone stays a no-permission admin
      // for the later positive-control scenarios.
      await owner.patch(`/api/admin/users/${adminNone.id}`, { adminGroupId: null });
      await owner.delete(`/api/admin/groups/${groupId}`);
      await adminNone.client.login(adminNone.username, adminNone.password);
    }
  });
});

describe("Angriff: Admin mit nur 'users' eskaliert zu allen Rechten", () => {
  // Attacker: role admin, group = ["users"] only. Goal: all permissions.
  // Chain: PATCH /api/admin/users/<self> { adminGroupId: all } → read a 'settings'-gated route. sameAs AUTHZ-2.
  test("the 'users' permission must not let an admin put themselves in another group", async () => {
    assert.equal((await adminUsers.client.get("/api/admin/settings")).status, 403, "precondition: adminUsers should not read settings");

    const res = await adminUsers.client.patch(`/api/admin/users/${adminUsers.id}`, { adminGroupId: groupAll });
    await adminUsers.client.login(adminUsers.username, adminUsers.password);
    const settings = await adminUsers.client.get("/api/admin/settings");

    try {
      assert.equal(settings.status, 403,
        `admin with only 'users' escalated to full access (PATCH self adminGroupId → ${res.status}, settings → ${settings.status})`);
    } finally {
      // restore group to the users-only group
      const view = await adminUserView(owner, adminUsers.id);
      if (view.adminGroupId === groupAll) {
        // put them back into a users-only group
        const g = await createGroup(owner, `usersonly2`, ["users"]);
        await owner.patch(`/api/admin/users/${adminUsers.id}`, { adminGroupId: g });
        await adminUsers.client.login(adminUsers.username, adminUsers.password);
      }
    }
  });
});

describe("Angriff: Admin entmachtet oder sperrt einen Owner aus", () => {
  // Attacker: role admin (all permissions, but NOT owner). Goal: demote / lock out a platform owner.
  // sameAs AUTHZ-3.
  test("an admin cannot demote a platform owner", async () => {
    const res = await adminAll.client.patch(`/api/admin/users/${ownerB.id}`, { role: "admin" });
    try {
      assert.equal(res.status, 403, `admin demoted an owner: HTTP ${res.status}`);
      const view = await adminUserView(owner, ownerB.id);
      assert.equal(view.role, "owner", "owner was demoted to admin by a non-owner admin");
    } finally {
      await owner.patch(`/api/admin/users/${ownerB.id}`, { role: "owner" });
    }
  });

  test("an admin cannot lock an owner out via negative karma", async () => {
    const res = await adminAll.client.patch(`/api/admin/users/${ownerB.id}`, { karma: -1 });
    try {
      assert.equal(res.status, 403, `admin set an owner's karma: HTTP ${res.status}`);
      const view = await adminUserView(owner, ownerB.id);
      assert.ok((view.karma ?? 0) >= 0, "admin set an owner's karma negative (locks the owner out of login)");
    } finally {
      await owner.patch(`/api/admin/users/${ownerB.id}`, { karma: 0 });
    }
  });

  test("an admin cannot promote anyone to owner (positive control)", async () => {
    const res = await adminAll.client.patch(`/api/admin/users/${alice.id}`, { role: "owner" });
    assert.equal(res.status, 403, `admin promoted a user to owner: HTTP ${res.status}`);
    const view = await adminUserView(owner, alice.id);
    assert.notEqual(view.role, "owner", "a non-owner admin promoted a user to owner");
  });
});

// =====================================================================================
// COMMUNITY-ROLE ESCALATION & CROSS-COMMUNITY MODERATION
// =====================================================================================

describe("Angriff: Community-Moderator handelt in einer fremden Community", () => {
  // Attacker: an ordinary user who is MODERATOR of community A, but not a member of community B.
  // Goal: moderate B (read requests/bans/reports, kick/ban members, change roles).
  let commA: any, commB: any, mod: Actor, victimMember: Actor;

  before(async () => {
    commA = await createCommunity(owner, "AtkCommA", false);
    commB = await createCommunity(owner, "AtkCommB", true);
    [mod, victimMember] = await Promise.all([mkActor("atkmodA"), mkActor("atkmemberB")]);
    // owner (creator = community owner of both) sets up roles
    await expectStatus(await owner.post(`/api/communities/${commA.id}/moderators`, { userId: mod.id }), 200);
    await expectStatus(await owner.post(`/api/communities/${commB.id}/invite`, { userId: victimMember.id }), 200);
  });

  test("a moderator of community A cannot read join requests of community B", async () => {
    const res = await mod.client.get(`/api/communities/${commB.id}/requests`);
    assert.equal(res.status, 403, `moderator of A read B's join requests: HTTP ${res.status}`);
  });

  test("a moderator of community A cannot read the ban list of community B", async () => {
    const res = await mod.client.get(`/api/communities/${commB.id}/bans`);
    assert.equal(res.status, 403, `moderator of A read B's ban list: HTTP ${res.status}`);
  });

  test("a moderator of community A cannot kick a member of community B", async () => {
    const res = await mod.client.delete(`/api/communities/${commB.id}/members/${victimMember.id}`);
    assert.equal(res.status, 403, `moderator of A kicked a member of B: HTTP ${res.status}`);
  });

  test("a moderator of community A cannot ban a member of community B", async () => {
    const res = await mod.client.post(`/api/communities/${commB.id}/ban`, { userId: victimMember.id, reason: "x" });
    assert.equal(res.status, 403, `moderator of A banned a member of B: HTTP ${res.status}`);
  });

  test("a moderator of community A cannot change member roles in community B", async () => {
    const res = await mod.client.patch(`/api/communities/${commB.id}/members/${victimMember.id}/role`, { role: "moderator" });
    assert.equal(res.status, 403, `moderator of A changed roles in B: HTTP ${res.status}`);
  });
});

describe("Angriff: einfaches Community-Mitglied befördert sich selbst", () => {
  // Attacker: an ordinary member of a community. Goal: become moderator/owner of it.
  let comm: any, member: Actor;

  before(async () => {
    comm = await createCommunity(owner, "AtkSelfPromo", false);
    member = await mkActor("atkselfpromo");
    await expectStatus(await owner.post(`/api/communities/${comm.id}/invite`, { userId: member.id }), 200);
  });

  test("a member cannot promote themselves to moderator via the role endpoint", async () => {
    const res = await member.client.patch(`/api/communities/${comm.id}/members/${member.id}/role`, { role: "moderator" });
    assert.equal(res.status, 403, `member self-promoted to moderator: HTTP ${res.status}`);
  });

  test("a member cannot promote themselves to owner via the role endpoint", async () => {
    const res = await member.client.patch(`/api/communities/${comm.id}/members/${member.id}/role`, { role: "owner" });
    assert.equal(res.status, 403, `member self-promoted to owner: HTTP ${res.status}`);
  });

  test("a member cannot add themselves as a moderator", async () => {
    const res = await member.client.post(`/api/communities/${comm.id}/moderators`, { userId: member.id });
    assert.equal(res.status, 403, `member added self as moderator: HTTP ${res.status}`);
  });
});

// =====================================================================================
// HORIZONTAL IDOR
// =====================================================================================

describe("Angriff: Nutzer manipuliert fremde Support-Ticket-Kommentare", () => {
  // Attacker: an ordinary user who owns at least one ticket (to pass the ticket-id gate).
  // Goal: edit/delete comments on ANOTHER user's ticket. The comment id is global and the route
  // never checks that :cId belongs to :id, nor that the caller authored the comment (NEW finding).
  let bobTicketId: number, bobCommentId: number, aliceTicketId: number;

  before(async () => {
    const bobTicket = await createTicket(bob.client, `Bob braucht Hilfe ${RUN_ID}`);
    bobTicketId = bobTicket.ticket.id;
    const withComment = await bob.client.post(`/api/tickets/${bobTicketId}/comments`, { content: "BOB-ORIGINAL" });
    const list = (await withComment.json()).comments as any[];
    bobCommentId = list.find((c) => c.content === "BOB-ORIGINAL" && !c.isSystem).id;
    const aliceTicket = await createTicket(alice.client, `Alice Ticket ${RUN_ID}`);
    aliceTicketId = aliceTicket.ticket.id;
  });

  test("a user cannot edit a comment on another user's ticket", async () => {
    const res = await alice.client.patch(`/api/tickets/${aliceTicketId}/comments/${bobCommentId}`, { content: "HACKED" });
    assert.ok(res.status === 403 || res.status === 404, `foreign ticket comment edit accepted: HTTP ${res.status}`);
    const after = (await (await bob.client.get(`/api/tickets/${bobTicketId}`)).json()).comments
      .find((c: any) => c.id === bobCommentId);
    assert.equal(after.content, "BOB-ORIGINAL", "another user rewrote the content of a foreign ticket comment");
  });

  test("a user cannot delete a comment on another user's ticket", async () => {
    const res = await alice.client.delete(`/api/tickets/${aliceTicketId}/comments/${bobCommentId}`);
    assert.ok(res.status === 403 || res.status === 404, `foreign ticket comment delete accepted: HTTP ${res.status}`);
    const after = (await (await bob.client.get(`/api/tickets/${bobTicketId}`)).json()).comments
      .find((c: any) => c.id === bobCommentId);
    assert.ok(after, "another user deleted a foreign ticket comment");
  });
});

describe("Angriff: Nutzer liest und verändert fremde Benachrichtigungen", () => {
  // Attacker: an ordinary user. Goal: mark-read / delete notifications that belong to someone else.
  // carol follows bob to generate a notification owned by bob; alice (unrelated) attacks it. sameAs AUTHZ-5.
  let bobNotifId: number;

  before(async () => {
    await expectStatus(await carol.client.post(`/api/follow/${bob.id}`), 200);
    const list = await (await bob.client.get("/api/notifications")).json();
    bobNotifId = list[0]?.id;
  });

  test("notifications do not expose the acting user's email or password hash", async () => {
    // sameAs AUTHZ-4: the actor projection must be public-only.
    const list = await (await bob.client.get("/api/notifications")).json();
    const actor = list[0]?.actor ?? list[0]?.fromUser;
    if (actor) {
      assert.ok(!("email" in actor), "notification actor leaks an email address");
      assert.ok(!("password" in actor), "notification actor leaks a password hash");
    }
  });

  test("a user cannot mark another user's notification as read", async () => {
    assert.ok(bobNotifId, "precondition: bob has a notification");
    await alice.client.post(`/api/notifications/${bobNotifId}/read`);
    const list = await (await bob.client.get("/api/notifications")).json();
    const notif = list.find((n: any) => n.id === bobNotifId);
    const isRead = notif && (notif.read ?? notif.isRead);
    assert.ok(notif && !isRead, "another user marked a foreign notification as read");
  });

  test("a user cannot delete another user's notification", async () => {
    assert.ok(bobNotifId, "precondition: bob has a notification");
    await alice.client.delete(`/api/notifications/${bobNotifId}`);
    const list = await (await bob.client.get("/api/notifications")).json();
    assert.ok(list.some((n: any) => n.id === bobNotifId), "another user deleted a foreign notification");
  });
});

describe("Angriff: Nutzer greift auf fremde private Objekte zu (positive controls)", () => {
  // These object types are expected to be correctly isolated; the tests lock that in.
  let bobTicketId: number, bobThemeId: number, bobPostId: number, bobCommentId: number;

  before(async () => {
    bobTicketId = (await createTicket(bob.client, `Bob privat ${RUN_ID}`)).ticket.id;
    const theme = await bob.client.post("/api/user/themes", { name: `BobTheme ${RUN_ID}`, colors: JSON.stringify({ primary: "#111" }) });
    bobThemeId = (await theme.json()).id;
    bobPostId = (await createPost(bob.client, `bob post ${RUN_ID}`)).id;
    const c = await bob.client.post("/api/comments", { postId: bobPostId, content: "bob comment" });
    bobCommentId = (await c.json()).id;
  });

  test("a user cannot read another user's support ticket", async () => {
    const res = await alice.client.get(`/api/tickets/${bobTicketId}`);
    assert.ok(res.status === 403 || res.status === 404, `read foreign ticket: HTTP ${res.status}`);
  });

  test("a user cannot close another user's support ticket", async () => {
    const res = await alice.client.patch(`/api/tickets/${bobTicketId}`, { status: "closed" });
    assert.ok(res.status === 403 || res.status === 404, `closed foreign ticket: HTTP ${res.status}`);
  });

  test("a user cannot edit another user's theme", async () => {
    const res = await alice.client.patch(`/api/user/themes/${bobThemeId}`, { name: "stolen" });
    assert.equal(res.status, 404, `edited foreign theme: HTTP ${res.status}`);
  });

  test("a user cannot delete another user's theme", async () => {
    const res = await alice.client.delete(`/api/user/themes/${bobThemeId}`);
    assert.equal(res.status, 404, `deleted foreign theme: HTTP ${res.status}`);
  });

  test("a user cannot delete another user's post", async () => {
    const res = await alice.client.delete(`/api/posts/${bobPostId}`);
    assert.equal(res.status, 403, `deleted foreign post: HTTP ${res.status}`);
  });

  test("a user cannot delete another user's comment", async () => {
    const res = await alice.client.delete(`/api/comments/${bobCommentId}`);
    assert.equal(res.status, 403, `deleted foreign comment: HTTP ${res.status}`);
  });

  test("saved posts of another user are private", async () => {
    await bob.client.post(`/api/posts/${bobPostId}/save`);
    // the profile routes live under /api/users (/api/<name> is no longer read as a username)
    const res = await alice.client.get(`/api/users/${bob.username}/saved`);
    assert.equal(res.status, 403, `read foreign saved posts: HTTP ${res.status}`);
  });
});

// =====================================================================================
// PRIVATE COMMUNITIES & SHADOW-BANNED CONTENT
// =====================================================================================

describe("Angriff: Nicht-Mitglied liest Inhalte einer privaten Community", () => {
  // Attacker: a logged-in user who is NOT a member of a private community. Goal: read its posts and members.
  let priv: any, privPostId: number;

  before(async () => {
    priv = await createCommunity(owner, "AtkPrivRead", true);
    privPostId = (await createPost(owner, `PRIV-SECRET-${RUN_ID}`, priv.id)).id;
  });

  test("a non-member cannot list posts of a private community via the feed filter", async () => {
    const res = await alice.client.get(`/api/posts?communityId=${priv.id}`);
    const posts = await res.json();
    const leaked = Array.isArray(posts) && posts.some((p: any) => p.id === privPostId);
    assert.ok(!leaked, "non-member read posts of a private community via GET /api/posts?communityId");
  });

  test("a non-member cannot read a single post of a private community", async () => {
    const res = await alice.client.get(`/api/posts/${privPostId}`);
    assert.ok(res.status === 403 || res.status === 404,
      `non-member read a private-community post directly: HTTP ${res.status}`);
  });

  test("a non-member cannot read the member list of a private community", async () => {
    // sameAs AUTHZ-13
    const res = await alice.client.get(`/api/communities/${priv.id}/members`);
    assert.equal(res.status, 403, `non-member read a private community's member list: HTTP ${res.status}`);
  });
});

describe("Angriff: Shadowban-Umgehung – fremde Nutzer sehen verborgene Inhalte", () => {
  // Attacker scenario reversed: a shadow-banned user's content must stay hidden from everyone else.
  // A shadow-banned user posts + comments; a normal viewer must not see either through any endpoint.
  let shadow: Actor, viewer: Actor, postId: number;

  before(async () => {
    [shadow, viewer] = await Promise.all([mkActor("atkshadow"), mkActor("atkviewer")]);
    postId = (await createPost(shadow.client, `shadow-post-${RUN_ID}`)).id;
    await shadow.client.post("/api/comments", { postId, content: `SHADOW-COMMENT-${RUN_ID}` });
    await expectStatus(await owner.post("/api/admin/bans", { ban_type: "shadow", user_id: shadow.id, reason: "attack scenario" }), 200);
  });

  test("the feed hides a shadow-banned user's post from others (positive control)", async () => {
    const res = await viewer.client.get(`/api/posts?category=general&limit=200`);
    const posts = await res.json();
    const seen = Array.isArray(posts) && posts.some((p: any) => p.id === postId);
    assert.ok(!seen, "feed exposed a shadow-banned user's post");
  });

  test("the post detail hides a shadow-banned user's comment (positive control)", async () => {
    const detail = await (await viewer.client.get(`/api/posts/${postId}`)).json();
    const seen = (detail.comments ?? []).some((c: any) => String(c.content).startsWith("SHADOW-COMMENT-"));
    assert.ok(!seen, "post detail exposed a shadow-banned user's comment");
  });

  test("the comments endpoint must hide a shadow-banned user's comment", async () => {
    const res = await viewer.client.get(`/api/posts/${postId}/comments`);
    const comments = await res.json();
    const seen = Array.isArray(comments) && comments.some((c: any) => String(c.content).startsWith("SHADOW-COMMENT-"));
    assert.ok(!seen, "GET /api/posts/:postId/comments leaked a shadow-banned user's comment");
  });

  test("a shadow-banned user's posts must not surface on their public profile", async () => {
    const res = await viewer.client.get(`/api/users/${shadow.username}/posts`);
    assert.equal(res.status, 200);
    const posts = await res.json();
    const seen = Array.isArray(posts) && posts.some((p: any) => p.id === postId);
    assert.ok(!seen, "GET /api/:username/posts leaked a shadow-banned user's post");
  });
});

// =====================================================================================
// MODERATION DATA — ROLE / PERMISSION GATING
// =====================================================================================

describe("Angriff: Admin ohne passende Berechtigung liest Moderationsdaten", () => {
  // Attacker: role admin with NO group. Goal: read moderation/support data gated behind a specific permission.
  test("an admin without 'reports' cannot read global reports (positive control)", async () => {
    assert.equal((await adminNone.client.get("/api/reports")).status, 403, "admin w/o 'reports' read /api/reports");
    assert.equal((await adminNone.client.get("/api/admin/reports")).status, 403, "admin w/o 'reports' read /api/admin/reports");
  });

  test("an admin without 'analytics' cannot read platform analytics (positive control)", async () => {
    assert.equal((await adminNone.client.get("/api/admin/analytics/overview")).status, 403, "admin w/o 'analytics' read analytics");
  });

  test("an admin without 'logs' cannot read monitoring data (positive control)", async () => {
    assert.equal((await adminNone.client.get("/api/admin/monitoring/metrics/overview")).status, 403, "admin w/o 'logs' read monitoring");
  });

  test("an admin without 'performance' cannot read the moderator leaderboard (positive control)", async () => {
    assert.equal((await adminNone.client.get("/api/admin/performance/leaderboard")).status, 403, "admin w/o 'performance' read mod performance");
  });

  test("an admin without 'tickets' cannot read ticket stats", async () => {
    // sameAs AUTHZ-7
    const res = await adminNone.client.get("/api/tickets/stats");
    assert.equal(res.status, 403, `admin without 'tickets' read ticket stats: HTTP ${res.status}`);
  });

  test("an admin without 'tickets' cannot read another user's support ticket", async () => {
    // sameAs AUTHZ-7
    const ticketId = (await createTicket(bob.client, `Bob ticket for admin ${RUN_ID}`)).ticket.id;
    const res = await adminNone.client.get(`/api/tickets/${ticketId}`);
    assert.ok(res.status === 403 || res.status === 404,
      `admin without 'tickets' read a foreign ticket: HTTP ${res.status}`);
  });
});

describe("Angriff: Admin löscht Inhalte eines Owners", () => {
  // Attacker: role admin (non-owner). Goal: delete content authored by a platform owner.
  // Comments are protected by canDeleteContent; posts are not. sameAs AUTHZ-14.
  let ownerPostId: number, ownerCommentId: number;

  before(async () => {
    ownerPostId = (await createPost(owner, `owner post ${RUN_ID}`)).id;
    const c = await owner.post("/api/comments", { postId: ownerPostId, content: "owner comment" });
    ownerCommentId = (await c.json()).id;
  });

  test("an admin cannot delete a comment written by an owner (positive control)", async () => {
    const res = await adminNone.client.delete(`/api/comments/${ownerCommentId}`);
    assert.equal(res.status, 403, `admin deleted an owner's comment: HTTP ${res.status}`);
  });

  test("an admin cannot delete a post written by an owner", async () => {
    const res = await adminNone.client.delete(`/api/posts/${ownerPostId}`);
    assert.equal(res.status, 403, `admin deleted an owner's post: HTTP ${res.status}`);
  });
});
