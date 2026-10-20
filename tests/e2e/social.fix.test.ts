// Regression tests for the social fixes (profiles, follows, notifications, messages, communities) that the
// main suites do not cover directly.
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { Client, expectStatus, ADMIN_USER, ADMIN_PASSWORD, RUN_ID } from "./client";
import { socialUser, notificationsOf, giveKarma, createCommunity, membersOf } from "./helpers/social";

const admin = new Client();

before(async () => {
  assert.ok(ADMIN_USER && ADMIN_PASSWORD, "E2E_ADMIN_USER and E2E_ADMIN_PASSWORD must be set");
  assert.equal((await admin.login(ADMIN_USER, ADMIN_PASSWORD)).status, 200);
});

const FORBIDDEN_FIELDS = ["password", "email", "isShadowBanned", "isFrozen", "frozenUntil", "freezeReason", "adminGroupId", "emailVerified"];

describe("profiles", () => {
  test("mutual followers in a profile carry only public fields", async () => {
    const viewer = await socialUser("xv");
    const target = await socialUser("xt");
    const mutual = await socialUser("xm");
    await expectStatus(await viewer.client.post(`/api/follow/${mutual.id}`), 200);
    await expectStatus(await mutual.client.post(`/api/follow/${target.id}`), 200);
    const text = await (await viewer.client.get(`/api/users/${target.username}`)).text();
    const profile = JSON.parse(text);
    assert.deepEqual(profile.mutualFollowers.map((u: any) => u.id), [mutual.id]);
    assert.ok(!text.includes("$2b$"), "password hash in mutualFollowers");
    for (const f of FORBIDDEN_FIELDS) assert.equal(profile.mutualFollowers[0][f], undefined, f);
  });

  test("comments and likes of a private account are hidden from anonymous visitors, visible to members", async () => {
    const p = await socialUser("xp");
    const member = await socialUser("xq");
    const post = await p.client.post("/api/posts", { title: `Priv ${RUN_ID}`, content: "private", category: "discussion" });
    await expectStatus(post, 201);
    const postId = (await post.json()).id;
    await expectStatus(await p.client.post("/api/comments", { content: "own comment", postId }), 201);
    await expectStatus(await p.client.post(`/api/posts/${postId}/react`, { isLike: true }), 200);
    await expectStatus(await p.client.patch("/api/profile", { isPrivate: true }), 200);
    for (const tab of ["posts", "comments", "liked"]) {
      const anon = await new Client().get(`/api/users/${p.username}/${tab}`);
      const list = anon.status === 200 ? await anon.json() : [];
      assert.equal(list.length, 0, `anonymous sees the private ${tab}`);
      const seen = await member.client.get(`/api/users/${p.username}/${tab}`);
      await expectStatus(seen, 200);
      assert.ok((await seen.json()).length > 0, `a logged-in member does not see ${tab}`);
    }
  });

  test("profile lists do not reveal posts of private communities to outsiders", async () => {
    const owner = await socialUser("xo");
    const outsider = await socialUser("xx");
    await giveKarma(admin, owner.id, 200);
    const c = await createCommunity(owner.client, { name: `Xpriv ${RUN_ID}`, isPrivate: true });
    const res = await owner.client.post("/api/posts", { content: `secret ${RUN_ID}`, category: "discussion", communityId: String(c.id) });
    await expectStatus(res, 201);
    const postId = (await res.json()).id;
    const list = await (await outsider.client.get(`/api/users/${owner.username}/posts`)).json();
    assert.ok(!list.some((p: any) => p.id === postId), "private community post on the profile");
    const own = await (await owner.client.get(`/api/users/${owner.username}/posts`)).json();
    assert.ok(own.some((p: any) => p.id === postId), "the member no longer sees their own post");
  });

  test("a shadow-banned user's comments do not surface on their profile for others", async () => {
    const s = await socialUser("xs");
    const viewer = await socialUser("xw");
    const post = await s.client.post("/api/posts", { title: `Sh ${RUN_ID}`, content: "x", category: "discussion" });
    await expectStatus(post, 201);
    await expectStatus(await s.client.post("/api/comments", { content: `shadow comment ${RUN_ID}`, postId: (await post.json()).id }), 201);
    await expectStatus(await admin.patch(`/api/admin/users/${s.id}`, { isShadowBanned: 1 }), 200);
    assert.deepEqual(await (await viewer.client.get(`/api/users/${s.username}/comments`)).json(), []);
    assert.equal((await (await viewer.client.get(`/api/users/${s.username}`)).json()).stats.posts, 0);
  });

  test("usernames with control characters answer 404", async () => {
    for (const name of ["%00", "a%0Ab", "%7F"]) {
      assert.equal((await new Client().get(`/api/users/${name}`)).status, 404, name);
    }
  });

  test("profile lookup is case-insensitive", async () => {
    const u = await socialUser("Xcase");
    const res = await new Client().get(`/api/users/${u.username.toUpperCase()}`);
    await expectStatus(res, 200);
    assert.equal((await res.json()).id, u.id);
  });
});

describe("search", () => {
  test("'_' and '\\' are matched literally", async () => {
    const u = await socialUser("xsearch");
    for (const q of ["_", "__", "\\"]) {
      const list = await (await u.client.get(`/api/users/search?q=${encodeURIComponent(q)}`)).json();
      assert.ok(list.every((x: any) => x.username.includes(q)), `${q} matched ${list.map((x: any) => x.username).join(",")}`);
    }
  });
});

describe("notifications", () => {
  test("boolean preferences from the settings form are stored as 0/1", async () => {
    const u = await socialUser("xb");
    const res = await u.client.patch("/api/notifications/preferences", { likePost: false, newFollower: true, userId: 1, id: 1 });
    await expectStatus(res, 200);
    const prefs = await res.json();
    assert.equal(prefs.likePost, 0);
    assert.equal(prefs.newFollower, 1);
    assert.equal(prefs.userId, u.id);
  });

  test("DELETE /api/notifications archives only the caller's notifications", async () => {
    const u = await socialUser("xd");
    const other = await socialUser("xe");
    const f = await socialUser("xf");
    await expectStatus(await f.client.post(`/api/follow/${u.id}`), 200);
    await expectStatus(await f.client.post(`/api/follow/${other.id}`), 200);
    await expectStatus(await u.client.delete("/api/notifications"), 200);
    assert.equal((await notificationsOf(u.client)).length, 0);
    assert.equal((await notificationsOf(other.client)).length, 1);
  });

  test("the actor of a notification carries only public fields", async () => {
    const u = await socialUser("xa");
    const f = await socialUser("xg");
    await expectStatus(await f.client.post(`/api/follow/${u.id}`), 200);
    const [n] = await notificationsOf(u.client);
    assert.equal(n.actor.username, f.username);
    for (const key of Object.keys(n.actor)) {
      assert.ok(["id", "username", "displayName", "avatarUrl", "profilePictureUrl"].includes(key), `actor.${key}`);
    }
  });
});

describe("direct messages", () => {
  test("?before=<id> pages back through a conversation", async () => {
    const r = await socialUser("xr");
    const s = await socialUser("xy");
    await expectStatus(await r.client.post(`/api/follow/${s.id}`), 200);
    await expectStatus(await s.client.post(`/api/follow/${r.id}`), 200);
    const ids: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const res = await s.client.post("/api/messages", { receiverId: r.id, content: `page ${i}` });
      await expectStatus(res, 201);
      ids.push((await res.json()).id);
    }
    const older = await (await r.client.get(`/api/messages/${s.id}?before=${ids[2]}`)).json();
    assert.deepEqual(older.map((m: any) => m.content), ["page 1", "page 2"]);
  });

  test("message content is trimmed and NUL characters are rejected", async () => {
    const r = await socialUser("xz");
    const s = await socialUser("xk");
    await expectStatus(await r.client.post(`/api/follow/${s.id}`), 200);
    await expectStatus(await s.client.post(`/api/follow/${r.id}`), 200);
    assert.equal((await s.client.post("/api/messages", { receiverId: r.id, content: "a\u0000b" })).status, 400);
    const ok = await s.client.post("/api/messages", { receiverId: r.id, content: "  hi  " });
    await expectStatus(ok, 201);
    assert.equal((await ok.json()).content, "hi");
  });
});

describe("communities", () => {
  let owner: Awaited<ReturnType<typeof socialUser>>;
  before(async () => {
    owner = await socialUser("xc");
    await giveKarma(admin, owner.id, 200);
  });

  test("names in other scripts get a usable slug; https and /uploads image URLs are accepted", async () => {
    const greek = await createCommunity(owner.client, { name: "Ελληνικά Κοινότητα" });
    assert.match(greek.slug, /^[a-z0-9-]+$/);
    assert.equal((await new Client().get(`/api/communities/${greek.slug}`)).status, 200);
    const img = await createCommunity(owner.client, { name: `Img ok ${RUN_ID}`, imageUrl: "https://example.com/a.png", description: "" });
    assert.equal(img.imageUrl, "https://example.com/a.png");
    assert.equal((await owner.client.post("/api/communities", { name: `Img data ${RUN_ID}`, imageUrl: "data:text/html,x" })).status, 400);
  });

  test("approving or declining without a pending request answers 404; banned users cannot be approved", async () => {
    const c = await createCommunity(owner.client, { name: `Xreq ${RUN_ID}`, isPrivate: true });
    const u = await socialUser("xu");
    assert.equal((await owner.client.post(`/api/communities/${c.id}/requests/${u.id}/approve`)).status, 404);
    assert.equal((await owner.client.post(`/api/communities/${c.id}/requests/${u.id}/decline`)).status, 404);
    assert.equal((await u.client.post(`/api/communities/${c.id}/join`)).status, 202);
    await expectStatus(await owner.client.post(`/api/communities/${c.id}/ban`, { userId: u.id }), 200);
    assert.equal((await owner.client.post(`/api/communities/${c.id}/requests/${u.id}/approve`)).status, 409);
    assert.ok(!(await membersOf(owner.client, c.id)).some((m) => m.userId === u.id));
  });

  test("the member list of an unknown community answers 404", async () => {
    assert.equal((await owner.client.get("/api/communities/999999999/members")).status, 404);
  });

  test("community error answers are JSON", async () => {
    const res = await owner.client.post("/api/communities/999999999/join");
    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
  });
});
