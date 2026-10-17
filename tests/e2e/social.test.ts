import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client, expectStatus, ADMIN_USER, ADMIN_PASSWORD, RUN_ID } from "./client";
import {
  socialUser,
  sleep,
  notificationsOf,
  giveKarma,
  createCommunity,
  membersOf,
  openSocket,
  type TestUser,
  type Socket,
} from "./helpers/social";

const admin = new Client();

before(async () => {
  assert.ok(ADMIN_USER && ADMIN_PASSWORD, "E2E_ADMIN_USER and E2E_ADMIN_PASSWORD must be set");
  const res = await admin.login(ADMIN_USER, ADMIN_PASSWORD);
  assert.equal(res.status, 200, `admin login failed: ${await res.text()}`);
});

const anon = async () => {
  const c = new Client();
  await c.refreshCsrf();
  return c;
};

const profile = async (username: string, viewer: Client = new Client()) => {
  const res = await viewer.get(`/api/users/${username}`);
  await expectStatus(res, 200);
  return res.json();
};

/** Asserts a 4xx answer that carries no stack trace or SQL. */
async function assertCleanClientError(res: Response, label: string) {
  const text = await res.text();
  assert.ok(res.status >= 400 && res.status < 500, `${label}: expected 4xx, got ${res.status}: ${text.slice(0, 200)}`);
  assert.ok(!/Failed query|select |update "|insert into|at \/|node_modules/i.test(text), `${label}: leaks internals: ${text.slice(0, 200)}`);
}

// ---------------------------------------------------------------------------------------------
describe("follows", () => {
  let a: TestUser;
  let b: TestUser;

  before(async () => {
    a = await socialUser("fa");
    b = await socialUser("fb");
  });

  test("follow and unfollow require a login", async () => {
    const c = await anon();
    assert.equal((await c.post(`/api/follow/${b.id}`)).status, 401);
    assert.equal((await c.delete(`/api/follow/${b.id}`)).status, 401);
    assert.equal((await c.get("/api/followers")).status, 401);
    assert.equal((await c.get("/api/following")).status, 401);
  });

  test("follow without a CSRF token is rejected", async () => {
    assert.equal((await a.client.post(`/api/follow/${b.id}`, undefined, { csrf: false })).status, 403);
    assert.equal((await profile(b.username)).stats.followers, 0);
  });

  test("following updates counts, lists and the isFollowing flag", async () => {
    await expectStatus(await a.client.post(`/api/follow/${b.id}`), 200);
    const seenByA = await profile(b.username, a.client);
    assert.equal(seenByA.stats.followers, 1);
    assert.equal(seenByA.isFollowing, true);
    assert.equal(seenByA.isFollowingBack, false);
    assert.equal((await profile(a.username)).stats.following, 1);

    const following = await (await a.client.get("/api/following")).json();
    assert.deepEqual(following.map((u: any) => u.id), [b.id]);
    const followers = await (await b.client.get("/api/followers")).json();
    assert.deepEqual(followers.map((u: any) => u.id), [a.id]);
  });

  test("following twice is rejected and does not inflate the count", async () => {
    assert.equal((await a.client.post(`/api/follow/${b.id}`)).status, 400);
    assert.equal((await profile(b.username)).stats.followers, 1);
  });

  test("users cannot follow themselves", async () => {
    assert.equal((await a.client.post(`/api/follow/${a.id}`)).status, 400);
    assert.equal((await profile(a.username)).stats.followers, 0);
  });

  test("unfollowing works once; a second unfollow is rejected and the count never goes negative", async () => {
    await expectStatus(await a.client.delete(`/api/follow/${b.id}`), 200);
    assert.equal((await a.client.delete(`/api/follow/${b.id}`)).status, 400);
    const p = await profile(b.username);
    assert.equal(p.stats.followers, 0);
    assert.equal((await (await a.client.get("/api/following")).json()).length, 0);
  });

  test("following or unfollowing a user that does not exist answers 404", async () => {
    assert.equal((await a.client.post("/api/follow/999999999")).status, 404);
    assert.equal((await a.client.delete("/api/follow/999999999")).status, 404);
    assert.equal((await a.client.post("/api/follow/0")).status, 404);
  });

  test("non-numeric or out-of-range user ids answer 4xx, not 500", async () => {
    for (const id of ["abc", "99999999999", "-1", "%27%20OR%201%3D1%20--"]) {
      await assertCleanClientError(await a.client.post(`/api/follow/${id}`), `POST /api/follow/${id}`);
      await assertCleanClientError(await a.client.delete(`/api/follow/${id}`), `DELETE /api/follow/${id}`);
    }
  });

  test("legacy alias routes /api/users/follow and /api/user/follow behave the same", async () => {
    const x = await socialUser("fx");
    await expectStatus(await x.client.post(`/api/users/follow/${b.id}`), 200);
    assert.equal((await x.client.post(`/api/user/follow/${b.id}`)).status, 400, "already following");
    await expectStatus(await x.client.delete(`/api/user/follow/${b.id}`), 200);
    assert.equal((await profile(b.username)).stats.followers, 0);
  });

  test("follower and following lists hide emails, hashes and moderation state", async () => {
    const watcher = await socialUser("fw");
    const target = await socialUser("ft");
    await expectStatus(await watcher.client.post(`/api/follow/${target.id}`), 200);
    // Shadow-ban the follower (our own test user): their moderation state must not show up for others.
    const ban = await admin.post("/api/admin/bulk/users", {
      user_ids: [watcher.id],
      action: "shadow",
      reason: "e2e social shadow",
      duration_hours: 1,
    });
    await expectStatus(ban, 200);
    const text = await (await target.client.get("/api/followers")).text();
    const [entry] = JSON.parse(text);
    assert.equal(entry.id, watcher.id);
    assert.ok(!text.includes("$2b$"), "password hash exposed");
    assert.ok(!text.includes("@e2e.test"), "email exposed");
    for (const field of ["isShadowBanned", "isFrozen", "frozenUntil", "freezeReason", "adminGroupId"]) {
      assert.equal(entry[field], undefined, `follower list exposes ${field}=${JSON.stringify(entry[field])}`);
    }
  });

  test("a new follower notification is created with the actor", async () => {
    const f = await socialUser("fn");
    const t = await socialUser("fm");
    await expectStatus(await f.client.post(`/api/follow/${t.id}`), 200);
    const list = await notificationsOf(t.client);
    const n = list.find((x) => x.type === "new_follower");
    assert.ok(n, "no new_follower notification");
    assert.equal(n.actorId, f.id);
    assert.equal(n.actor?.username, f.username);
  });

  test("follow/unfollow toggling does not spam the target with notifications", async () => {
    const f = await socialUser("fs");
    const t = await socialUser("fr");
    for (let i = 0; i < 3; i++) {
      await expectStatus(await f.client.post(`/api/follow/${t.id}`), 200);
      await expectStatus(await f.client.delete(`/api/follow/${t.id}`), 200);
    }
    const list = await notificationsOf(t.client, "?type=new_follower");
    assert.equal(list.length, 1, `got ${list.length} new_follower notifications from one user`);
  });

  test("posts of a private profile are not visible to anonymous visitors", async () => {
    const p = await socialUser("fp");
    await expectStatus(await p.client.patch("/api/profile", { isPrivate: true }), 200);
    await expectStatus(await p.client.post("/api/posts", { title: `Private ${RUN_ID}`, content: "only members", category: "discussion" }), 201);
    const res = await new Client().get(`/api/users/${p.username}/posts`);
    const posts = res.status === 200 ? await res.json() : [];
    assert.equal(posts.length, 0, "a private profile's posts are served to anonymous visitors");
  });
});

// ---------------------------------------------------------------------------------------------
describe("direct messages", () => {
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;

  before(async () => {
    a = await socialUser("ma");
    b = await socialUser("mb");
    c = await socialUser("mc");
    await expectStatus(await a.client.post(`/api/follow/${b.id}`), 200);
  });

  test("messaging requires a login", async () => {
    const x = await anon();
    assert.equal((await x.post("/api/messages", { receiverId: b.id, content: "hi" })).status, 401);
    assert.equal((await x.get(`/api/messages/${b.id}`)).status, 401);
    assert.equal((await x.get("/api/messages/unread/count")).status, 401);
  });

  test("a one-way follow is not enough to send a message", async () => {
    const res = await a.client.post("/api/messages", { receiverId: b.id, content: "one-way" });
    assert.equal(res.status, 403);
  });

  test("mutual followers can message; the response has the message shape", async () => {
    await expectStatus(await b.client.post(`/api/follow/${a.id}`), 200);
    const res = await a.client.post("/api/messages", { receiverId: b.id, content: `first ${RUN_ID}` });
    await expectStatus(res, 201);
    const m = await res.json();
    assert.equal(m.senderId, a.id);
    assert.equal(m.receiverId, b.id);
    assert.equal(m.content, `first ${RUN_ID}`);
    assert.ok(m.id > 0);
  });

  test("sending without a CSRF token is rejected", async () => {
    const res = await a.client.post("/api/messages", { receiverId: b.id, content: "no csrf" }, { csrf: false });
    assert.equal(res.status, 403);
  });

  test("users cannot message themselves or users that do not exist", async () => {
    assert.equal((await a.client.post("/api/messages", { receiverId: a.id, content: "me" })).status, 403);
    const ghost = await a.client.post("/api/messages", { receiverId: 999999999, content: "ghost" });
    assert.ok([403, 404].includes(ghost.status), `got ${ghost.status}`);
  });

  test("receiverId must be a valid integer", async () => {
    for (const receiverId of [String(b.id), null, [b.id], { $gt: 0 }, true, 1.5, 99999999999]) {
      const res = await a.client.post("/api/messages", { receiverId, content: "typed" });
      assert.equal(res.status, 400, `receiverId=${JSON.stringify(receiverId)} got ${res.status}`);
    }
    assert.equal((await a.client.post("/api/messages", { content: "no receiver" })).status, 400);
  });

  test("empty and whitespace-only messages are rejected", async () => {
    for (const content of ["", "   ", "\n\t"]) {
      const res = await a.client.post("/api/messages", { receiverId: b.id, content });
      assert.equal(res.status, 400, `content=${JSON.stringify(content)} got ${res.status}`);
    }
  });

  test("very long messages are rejected", async () => {
    const res = await a.client.post("/api/messages", { receiverId: b.id, content: "x".repeat(100_000) });
    assert.ok([400, 413].includes(res.status), `a 100k character message got ${res.status}`);
  });

  test("senderId, read and id in the body are ignored", async () => {
    const res = await a.client.post("/api/messages", {
      receiverId: b.id,
      content: `spoof ${RUN_ID}`,
      senderId: c.id,
      read: 1,
      id: 2_000_000_000,
    });
    await expectStatus(res, 201);
    const m = await res.json();
    assert.equal(m.senderId, a.id);
    assert.equal(m.read, 0);
    assert.notEqual(m.id, 2_000_000_000);
  });

  test("stored XSS in a message comes back as plain JSON data", async () => {
    const payload = `<img src=x onerror=alert(1)> ${RUN_ID}`;
    await expectStatus(await a.client.post("/api/messages", { receiverId: b.id, content: payload }), 201);
    const res = await b.client.get(`/api/messages/${a.id}`);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.ok((await res.json()).some((m: any) => m.content === payload));
  });

  test("the conversation contains both directions in chronological order", async () => {
    await expectStatus(await b.client.post("/api/messages", { receiverId: a.id, content: `reply ${RUN_ID}` }), 201);
    const list = await (await a.client.get(`/api/messages/${b.id}`)).json();
    assert.ok(list.some((m: any) => m.senderId === b.id && m.receiverId === a.id));
    assert.ok(list.some((m: any) => m.senderId === a.id && m.receiverId === b.id));
    const times = list.map((m: any) => new Date(m.createdAt).getTime());
    assert.deepEqual(times, [...times].sort((x, y) => x - y));
    assert.equal(list.at(-1).content, `reply ${RUN_ID}`);
  });

  test("a third user cannot read someone else's conversation", async () => {
    for (const other of [a.id, b.id]) {
      const res = await c.client.get(`/api/messages/${other}`);
      await expectStatus(res, 200);
      assert.deepEqual(await res.json(), [], `c sees messages of the a/b conversation via /api/messages/${other}`);
    }
  });

  test("the unread count counts only received messages", async () => {
    const r = await socialUser("mr");
    const s = await socialUser("ms");
    await expectStatus(await r.client.post(`/api/follow/${s.id}`), 200);
    await expectStatus(await s.client.post(`/api/follow/${r.id}`), 200);
    await expectStatus(await s.client.post("/api/messages", { receiverId: r.id, content: "one" }), 201);
    await expectStatus(await s.client.post("/api/messages", { receiverId: r.id, content: "two" }), 201);
    assert.equal((await (await r.client.get("/api/messages/unread/count")).json()).count, 2);
    assert.equal((await (await s.client.get("/api/messages/unread/count")).json()).count, 0);
  });

  test("opening a conversation clears its unread count", async () => {
    const r = await socialUser("mu");
    const s = await socialUser("mv");
    await expectStatus(await r.client.post(`/api/follow/${s.id}`), 200);
    await expectStatus(await s.client.post(`/api/follow/${r.id}`), 200);
    await expectStatus(await s.client.post("/api/messages", { receiverId: r.id, content: "read me" }), 201);
    await expectStatus(await r.client.get(`/api/messages/${s.id}`), 200);
    const { count } = await (await r.client.get("/api/messages/unread/count")).json();
    assert.equal(count, 0, "messages stay unread forever: nothing ever marks them as read");
  });

  test("the receiver gets a new_message notification naming the sender", async () => {
    const list = await notificationsOf(b.client, "?type=new_message");
    assert.ok(list.length > 0, "no new_message notification");
    assert.equal(list[0].actorId, a.id, "new_message notification has no actor");
  });

  test("invalid conversation ids answer 400, not 500", async () => {
    for (const id of ["abc", "99999999999", "-5"]) {
      await assertCleanClientError(await a.client.get(`/api/messages/${id}`), `/api/messages/${id}`);
    }
  });

  test("a long conversation still shows the newest message", async () => {
    const r = await socialUser("ml");
    const s = await socialUser("mk");
    await expectStatus(await r.client.post(`/api/follow/${s.id}`), 200);
    await expectStatus(await s.client.post(`/api/follow/${r.id}`), 200);
    for (let i = 1; i <= 101; i++) {
      await expectStatus(await s.client.post("/api/messages", { receiverId: r.id, content: `msg ${i}` }), 201);
    }
    const list = await (await r.client.get(`/api/messages/${s.id}`)).json();
    assert.ok(list.some((m: any) => m.content === "msg 101"), `newest message missing (got ${list.length}, last "${list.at(-1)?.content}")`);
  });

  test("after an unfollow no new messages can be sent", async () => {
    const r = await socialUser("mx");
    const s = await socialUser("my");
    await expectStatus(await r.client.post(`/api/follow/${s.id}`), 200);
    await expectStatus(await s.client.post(`/api/follow/${r.id}`), 200);
    await expectStatus(await r.client.delete(`/api/follow/${s.id}`), 200);
    assert.equal((await s.client.post("/api/messages", { receiverId: r.id, content: "still there?" })).status, 403);
  });
});

// ---------------------------------------------------------------------------------------------
describe("notifications", () => {
  let author: TestUser;
  let fan: TestUser;
  let mentioned: TestUser;
  let postId: number;
  let commentId: number;

  before(async () => {
    author = await socialUser("na");
    fan = await socialUser("nf");
    mentioned = await socialUser("nm");
    const post = await author.client.post("/api/posts", { title: `Notify ${RUN_ID}`, content: "notification source", category: "discussion" });
    await expectStatus(post, 201);
    postId = (await post.json()).id;
  });

  test("notification routes require a login", async () => {
    const x = await anon();
    for (const [method, path] of [
      ["GET", "/api/notifications"],
      ["GET", "/api/notifications/counts"],
      ["GET", "/api/notifications/preferences"],
      ["PATCH", "/api/notifications/preferences"],
      ["POST", "/api/notifications/seen"],
      ["POST", "/api/notifications/read-all"],
      ["POST", "/api/notifications/1/read"],
      ["DELETE", "/api/notifications/1"],
    ]) {
      const res = await x.request(method, path, method === "GET" || method === "DELETE" ? {} : { json: {} });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
  });

  test("liking a post notifies its author", async () => {
    await expectStatus(await fan.client.post(`/api/posts/${postId}/react`, { isLike: true }), 200);
    const n = (await notificationsOf(author.client)).find((x) => x.type === "like_post" && x.postId === postId);
    assert.ok(n, "no like_post notification");
    assert.equal(n.actorId, fan.id);
  });

  test("liking your own post creates no notification", async () => {
    await expectStatus(await author.client.post(`/api/posts/${postId}/react`, { isLike: true }), 200);
    const own = (await notificationsOf(author.client)).filter((x) => x.type === "like_post" && x.actorId === author.id);
    assert.equal(own.length, 0);
  });

  test("a comment mentioning a user notifies the post author and the mentioned user", async () => {
    const res = await fan.client.post("/api/comments", { content: `hey @${mentioned.username} look`, postId });
    await expectStatus(res, 201);
    commentId = (await res.json()).id;
    const forAuthor = (await notificationsOf(author.client)).find((x) => x.type === "comment_post" && x.commentId === commentId);
    assert.ok(forAuthor, "no comment_post notification for the author");
    const forMentioned = (await notificationsOf(mentioned.client)).find((x) => x.type === "mention_comment");
    assert.ok(forMentioned, "no mention_comment notification");
    assert.equal(forMentioned.actorId, fan.id);
    assert.equal(forMentioned.commentId, commentId);
  });

  test("a post mentioning a user notifies them once, even when mentioned twice", async () => {
    const poster = await socialUser("np");
    const target = await socialUser("nt");
    const res = await poster.client.post("/api/posts", {
      title: `Mention ${RUN_ID}`,
      content: `@${target.username} and again @${target.username}`,
      category: "discussion",
    });
    await expectStatus(res, 201);
    const list = (await notificationsOf(target.client)).filter((x) => x.type === "mention_post");
    assert.equal(list.length, 1);
    assert.equal(list[0].actorId, poster.id);
  });

  test("liking a comment notifies the comment author", async () => {
    await expectStatus(await author.client.post(`/api/comments/${commentId}/like`), 200);
    const n = (await notificationsOf(fan.client)).find((x) => x.type === "like_comment" && x.commentId === commentId);
    assert.ok(n, "no like_comment notification");
    assert.equal(n.actorId, author.id);
  });

  test("notifications do not leak the actor's password hash or email", async () => {
    const res = await author.client.get("/api/notifications");
    const text = await res.text();
    assert.ok(!text.includes("$2b$"), "notification actor contains a bcrypt password hash");
    assert.ok(!text.includes(`${fan.username}@e2e.test`), "notification actor contains the actor's email");
    const n = JSON.parse(text).find((x: any) => x.actorId === fan.id);
    assert.equal(n.actor?.password, undefined);
    assert.equal(n.actor?.email, undefined);
  });

  test("a user cannot mark someone else's notification as read", async () => {
    const victim = (await notificationsOf(author.client, "?unreadOnly=true"))[0];
    assert.ok(victim, "author has an unread notification");
    const res = await fan.client.post(`/api/notifications/${victim.id}/read`);
    assert.ok([403, 404].includes(res.status), `foreign notification marked read with HTTP ${res.status}`);
    const after = (await notificationsOf(author.client)).find((x) => x.id === victim.id);
    assert.equal(after.read, 0, "another user changed the read flag");
  });

  test("a user cannot delete someone else's notification", async () => {
    const victim = (await notificationsOf(mentioned.client))[0];
    assert.ok(victim, "mentioned user has a notification");
    const res = await fan.client.delete(`/api/notifications/${victim.id}`);
    assert.ok([403, 404].includes(res.status), `foreign notification deleted with HTTP ${res.status}`);
    assert.ok((await notificationsOf(mentioned.client)).some((x) => x.id === victim.id), "notification of another user was archived");
  });

  test("own notifications can be marked read and deleted; counts follow", async () => {
    const u = await socialUser("nc");
    const f1 = await socialUser("n1");
    const f2 = await socialUser("n2");
    await expectStatus(await f1.client.post(`/api/follow/${u.id}`), 200);
    await expectStatus(await f2.client.post(`/api/follow/${u.id}`), 200);
    assert.deepEqual(await (await u.client.get("/api/notifications/counts")).json(), { unread: 2, unseen: 2 });

    const [first, second] = await notificationsOf(u.client);
    await expectStatus(await u.client.post(`/api/notifications/${first.id}/read`), 200);
    assert.equal((await (await u.client.get("/api/notifications/counts")).json()).unread, 1);
    assert.deepEqual((await notificationsOf(u.client, "?unreadOnly=true")).map((x) => x.id), [second.id]);

    await expectStatus(await u.client.post("/api/notifications/seen"), 200);
    assert.equal((await (await u.client.get("/api/notifications/counts")).json()).unseen, 0);

    await expectStatus(await u.client.delete(`/api/notifications/${second.id}`), 200);
    assert.deepEqual((await notificationsOf(u.client)).map((x) => x.id), [first.id]);
    await expectStatus(await u.client.post("/api/notifications/read-all"), 200);
    assert.equal((await (await u.client.get("/api/notifications/counts")).json()).unread, 0);
  });

  test("read-all only touches the caller's notifications", async () => {
    const before = (await (await author.client.get("/api/notifications/counts")).json()).unread;
    assert.ok(before > 0, "author needs unread notifications");
    await expectStatus(await fan.client.post("/api/notifications/read-all"), 200);
    assert.equal((await (await author.client.get("/api/notifications/counts")).json()).unread, before);
  });

  test("list filters: type, unreadOnly, limit and offset", async () => {
    const all = await notificationsOf(author.client);
    assert.ok(all.length >= 2);
    assert.ok(all.every((x) => x.userId === author.id), "list contains foreign notifications");
    const likes = await notificationsOf(author.client, "?type=like_post");
    assert.ok(likes.length > 0 && likes.every((x) => x.type === "like_post"));
    const several = await notificationsOf(author.client, "?type=like_post,comment_post");
    assert.ok(several.every((x) => ["like_post", "comment_post"].includes(x.type)));
    assert.equal((await notificationsOf(author.client, "?limit=1")).length, 1);
    assert.equal((await notificationsOf(author.client, "?limit=1&offset=1"))[0].id, all[1].id);
    const injected = await notificationsOf(author.client, `?type=${encodeURIComponent("' OR 1=1 --")}`);
    assert.deepEqual(injected, []);
  });

  test("invalid paging parameters answer 4xx or are clamped, never 500", async () => {
    for (const q of ["limit=-1", "offset=-1", "limit=abc", "limit=99999999999", "offset=99999999999999999999"]) {
      const res = await author.client.get(`/api/notifications?${q}`);
      assert.ok(res.status < 500, `?${q} answered ${res.status}`);
    }
  });

  test("invalid notification ids answer 4xx, not 500", async () => {
    for (const id of ["abc", "99999999999", "1.5e10"]) {
      await assertCleanClientError(await fan.client.post(`/api/notifications/${id}/read`), `POST /api/notifications/${id}/read`);
      await assertCleanClientError(await fan.client.delete(`/api/notifications/${id}`), `DELETE /api/notifications/${id}`);
    }
  });

  test("marking read and deleting need a CSRF token", async () => {
    const own = (await notificationsOf(author.client))[0];
    assert.equal((await author.client.post(`/api/notifications/${own.id}/read`, undefined, { csrf: false })).status, 403);
    assert.equal((await author.client.delete(`/api/notifications/${own.id}`, { csrf: false })).status, 403);
    assert.equal((await author.client.patch("/api/notifications/preferences", { likePost: 0 }, { csrf: false })).status, 403);
  });

  describe("preferences", () => {
    test("defaults are all enabled", async () => {
      const u = await socialUser("pd");
      const res = await u.client.get("/api/notifications/preferences");
      await expectStatus(res, 200);
      const prefs = await res.json();
      assert.equal(prefs.userId, u.id);
      for (const key of ["likePost", "commentPost", "mentionComment", "newFollower", "communityInvite", "systemAnnouncement"]) {
        assert.equal(prefs[key], 1, key);
      }
    });

    test("turning a type off suppresses that notification", async () => {
      const u = await socialUser("po");
      await u.client.get("/api/notifications/preferences");
      const res = await u.client.patch("/api/notifications/preferences", { newFollower: 0 });
      await expectStatus(res, 200);
      assert.equal((await res.json()).newFollower, 0);
      const f = await socialUser("pf");
      await expectStatus(await f.client.post(`/api/follow/${u.id}`), 200);
      assert.equal((await notificationsOf(u.client, "?type=new_follower")).length, 0);
    });

    test("saving preferences before ever loading them persists the change", async () => {
      const u = await socialUser("pn");
      const res = await u.client.patch("/api/notifications/preferences", { likePost: 0 });
      await expectStatus(res, 200);
      const body = await res.text();
      assert.ok(body.length > 0, "PATCH answered 200 with an empty body and saved nothing");
      const prefs = await (await u.client.get("/api/notifications/preferences")).json();
      assert.equal(prefs.likePost, 0, "the preference change was lost");
    });

    test("invalid value types answer 400, not 500", async () => {
      const u = await socialUser("pt");
      await u.client.get("/api/notifications/preferences");
      for (const value of ["yes", { $gt: "" }, [1], null, 1e20]) {
        const res = await u.client.patch("/api/notifications/preferences", { likePost: value });
        assert.equal(res.status, 400, `likePost=${JSON.stringify(value)} answered ${res.status}`);
      }
    });

    test("userId in the body cannot move preferences onto another account", async () => {
      const attacker = await socialUser("pa");
      const victim = await socialUser("pv");
      await attacker.client.get("/api/notifications/preferences");
      const off = {
        likePost: 0, likeComment: 0, commentPost: 0, replyComment: 0, mentionPost: 0, mentionComment: 0,
        newFollower: 0, communityInvite: 0, communityPost: 0, postMilestone: 0, systemAnnouncement: 0,
      };
      const res = await attacker.client.patch("/api/notifications/preferences", { ...off, userId: victim.id });
      assert.ok(res.status === 200 || res.status === 400, `got ${res.status}`);
      // The victim has never loaded preferences, so the attacker's row is the only one for them.
      const prefs = await (await victim.client.get("/api/notifications/preferences")).json();
      assert.equal(prefs.newFollower, 1, "attacker switched off the victim's notifications");
      const f = await socialUser("pg");
      await expectStatus(await f.client.post(`/api/follow/${victim.id}`), 200);
      assert.equal((await notificationsOf(victim.client, "?type=new_follower")).length, 1, "victim no longer gets notifications");
    });

    test("unknown keys and prototype pollution payloads are ignored", async () => {
      const u = await socialUser("pp");
      await u.client.get("/api/notifications/preferences");
      const res = await u.client.patch(
        "/api/notifications/preferences",
        JSON.parse('{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},"likePost":0}'),
      );
      assert.ok(res.status === 200 || res.status === 400, `got ${res.status}`);
      const prefs = await (await u.client.get("/api/notifications/preferences")).json();
      assert.equal(prefs.polluted, undefined);
      assert.equal(({} as any).polluted, undefined);
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("communities: creation", () => {
  let owner: TestUser;

  before(async () => {
    owner = await socialUser("co");
    await giveKarma(admin, owner.id, 200);
  });

  test("creating needs a login and a CSRF token", async () => {
    assert.equal((await (await anon()).post("/api/communities", { name: `Anon ${RUN_ID}` })).status, 401);
    assert.equal((await owner.client.post("/api/communities", { name: `NoCsrf ${RUN_ID}` }, { csrf: false })).status, 403);
  });

  test("199 karma is not enough, 200 is", async () => {
    const u = await socialUser("ck");
    await giveKarma(admin, u.id, 199);
    assert.equal((await u.client.post("/api/communities", { name: `Karma199 ${RUN_ID}` })).status, 403);
    await giveKarma(admin, u.id, 200);
    await expectStatus(await u.client.post("/api/communities", { name: `Karma200 ${RUN_ID}` }), 201);
  });

  test("creation returns the community and makes the creator its owner", async () => {
    const c = await createCommunity(owner.client, { name: `Shape ${RUN_ID}`, description: "shape test" });
    assert.equal(c.name, `Shape ${RUN_ID}`);
    assert.equal(c.slug, `shape-${RUN_ID}`);
    assert.equal(c.creatorId, owner.id);
    assert.equal(c.isPrivate, 0);
    const members = await membersOf(owner.client, c.id);
    assert.deepEqual(members.map((m) => [m.userId, m.role]), [[owner.id, "owner"]]);
    const mine = await (await owner.client.get("/api/user/communities")).json();
    assert.equal(mine.find((x: any) => x.id === c.id)?.role, "owner");
    const listed = await (await new Client().get("/api/communities")).json();
    assert.ok(listed.some((x: any) => x.id === c.id));
    const bySlug = await (await new Client().get(`/api/communities/${c.slug}`)).json();
    assert.equal(bySlug.id, c.id);
    assert.equal(bySlug.memberInfo, null);
  });

  test("names that differ only in case or punctuation collide", async () => {
    await createCommunity(owner.client, { name: `Dup Name ${RUN_ID}` });
    for (const name of [`DUP NAME ${RUN_ID}`, `dup-name-${RUN_ID}`, `  Dup   Name ${RUN_ID}!`]) {
      const res = await owner.client.post("/api/communities", { name });
      assert.equal(res.status, 400, `${name} got ${res.status}`);
    }
  });

  test("creatorId and slug in the body are ignored", async () => {
    const other = await socialUser("cx");
    const c = await createCommunity(owner.client, { name: `Spoof ${RUN_ID}`, creatorId: other.id, slug: "admin" });
    assert.equal(c.creatorId, owner.id);
    assert.equal(c.slug, `spoof-${RUN_ID}`);
  });

  test("the community id cannot be chosen by the client", async () => {
    const wanted = 1_500_000_000 + Math.floor(Math.random() * 500_000_000);
    const res = await owner.client.post("/api/communities", { name: `Pick id ${RUN_ID}`, id: wanted });
    if (res.status === 201) {
      assert.notEqual((await res.json()).id, wanted, "client-chosen primary key was used");
    } else {
      assert.equal(res.status, 400);
    }
  });

  test("names without letters or digits are rejected with a validation error", async () => {
    for (const name of ["", "   ", "!!!", "Ελληνικά", "🙂🙂"]) {
      const res = await owner.client.post("/api/communities", { name });
      if (res.status === 201) {
        const c = await res.json();
        assert.ok(c.slug.length > 0, `name ${JSON.stringify(name)} created a community with an empty slug`);
        continue;
      }
      assert.equal(res.status, 400, `name ${JSON.stringify(name)} got ${res.status}`);
      const text = await res.text();
      assert.ok(!/already exists/i.test(text), `name ${JSON.stringify(name)} is refused as a duplicate of the empty slug`);
    }
  });

  test("overlong names and descriptions are rejected", async () => {
    const longName = await owner.client.post("/api/communities", { name: `Long ${RUN_ID} ${"x".repeat(100_000)}` });
    assert.equal(longName.status, 400, `100k name got ${longName.status}`);
    const longDesc = await owner.client.post("/api/communities", { name: `Long desc ${RUN_ID}`, description: "d".repeat(100_000) });
    assert.equal(longDesc.status, 400, `100k description got ${longDesc.status}`);
  });

  test("wrong field types answer 400", async () => {
    for (const body of [{ name: 123 }, { name: null }, { name: ["a"] }, { name: { $gt: "" } }, { name: `T ${RUN_ID}`, isPrivate: "yes" }, { name: `T ${RUN_ID}`, description: { a: 1 } }, {}]) {
      const res = await owner.client.post("/api/communities", body);
      assert.equal(res.status, 400, `${JSON.stringify(body)} got ${res.status}`);
    }
  });

  test("an XSS name is stored as plain data and served as JSON", async () => {
    const name = `<img src=x onerror=alert(1)> ${RUN_ID}`;
    const c = await createCommunity(owner.client, { name });
    assert.equal(c.name, name);
    assert.match(c.slug, /^[a-z0-9-]+$/);
    const res = await new Client().get(`/api/communities/${c.slug}`);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.equal((await res.json()).name, name);
  });

  test("javascript: image URLs are rejected", async () => {
    const res = await owner.client.post("/api/communities", { name: `Img ${RUN_ID}`, imageUrl: "javascript:alert(1)" });
    assert.equal(res.status, 400, `imageUrl javascript: accepted with ${res.status}`);
  });

  test("unknown and SQL-looking slugs answer 404", async () => {
    assert.equal((await new Client().get(`/api/communities/nope-${RUN_ID}`)).status, 404);
    assert.equal((await new Client().get(`/api/communities/${encodeURIComponent("' OR 1=1 --")}`)).status, 404);
  });
});

// ---------------------------------------------------------------------------------------------
describe("communities: public join and leave", () => {
  let owner: TestUser;
  let u: TestUser;
  let cid: number;

  before(async () => {
    owner = await socialUser("jo");
    u = await socialUser("ju");
    await giveKarma(admin, owner.id, 200);
    cid = (await createCommunity(owner.client, { name: `Join ${RUN_ID}` })).id;
  });

  test("joining needs a CSRF token", async () => {
    assert.equal((await u.client.post(`/api/communities/${cid}/join`, undefined, { csrf: false })).status, 403);
  });

  test("join, double join, membership lists and leave", async () => {
    await expectStatus(await u.client.post(`/api/communities/${cid}/join`), 200);
    assert.equal((await u.client.post(`/api/communities/${cid}/join`)).status, 400);
    const members = await membersOf(u.client, cid);
    assert.equal(members.filter((m) => m.userId === u.id).length, 1);
    assert.equal(members.find((m) => m.userId === u.id).role, "member");
    const mine = await (await u.client.get("/api/user/communities")).json();
    assert.equal(mine.find((x: any) => x.id === cid)?.role, "member");

    await expectStatus(await u.client.post(`/api/communities/${cid}/leave`), 200);
    assert.equal((await u.client.post(`/api/communities/${cid}/leave`)).status, 400);
    assert.ok(!(await membersOf(u.client, cid)).some((m) => m.userId === u.id));
  });

  test("the owner cannot leave", async () => {
    assert.equal((await owner.client.post(`/api/communities/${cid}/leave`)).status, 400);
    assert.ok((await membersOf(owner.client, cid)).some((m) => m.userId === owner.id && m.role === "owner"));
  });

  test("joining a community that does not exist answers 404", async () => {
    assert.equal((await u.client.post("/api/communities/999999999/join")).status, 404);
  });

  test("non-numeric or out-of-range community and user ids answer 4xx, not 500", async () => {
    const routes: Array<[string, string, unknown?]> = [];
    for (const id of ["abc", "99999999999"]) {
      routes.push(
        ["POST", `/api/communities/${id}/join`],
        ["POST", `/api/communities/${id}/leave`],
        ["GET", `/api/communities/${id}/members`],
        ["GET", `/api/communities/${id}/requests`],
        ["GET", `/api/communities/${id}/bans`],
        ["GET", `/api/communities/${id}/reports`],
        ["POST", `/api/communities/${cid}/requests/${id}/approve`],
        ["POST", `/api/communities/${cid}/requests/${id}/decline`],
        ["DELETE", `/api/communities/${cid}/members/${id}`],
        ["PATCH", `/api/communities/${cid}/members/${id}/role`, { role: "member" }],
        ["DELETE", `/api/communities/${cid}/ban/${id}`],
        ["POST", `/api/communities/${cid}/invite`, { userId: id }],
        ["POST", `/api/communities/${cid}/moderators`, { userId: id }],
      );
    }
    const failures: string[] = [];
    for (const [method, path, body] of routes) {
      const res = await owner.client.request(method, path, body === undefined ? {} : { json: body });
      const text = await res.text();
      if (res.status >= 500 || /Failed query|select |update "/i.test(text)) failures.push(`${method} ${path} -> ${res.status} ${text.slice(0, 80)}`);
    }
    assert.deepEqual(failures, []);
  });
});

// ---------------------------------------------------------------------------------------------
describe("communities: private communities and join requests", () => {
  let owner: TestUser;
  let mod: TestUser;
  let requester: TestUser;
  let outsider: TestUser;
  let community: any;

  before(async () => {
    owner = await socialUser("vo");
    mod = await socialUser("vm");
    requester = await socialUser("vr");
    outsider = await socialUser("vx");
    await giveKarma(admin, owner.id, 200);
    community = await createCommunity(owner.client, { name: `Private ${RUN_ID}`, description: "secret club", isPrivate: true });
    await expectStatus(await owner.client.post(`/api/communities/${community.id}/moderators`, { userId: mod.id }), 200);
  });

  test("joining a private community creates a pending request", async () => {
    const res = await requester.client.post(`/api/communities/${community.id}/join`);
    assert.equal(res.status, 202);
    assert.equal((await requester.client.post(`/api/communities/${community.id}/join`)).status, 400, "second request");
    const view = await (await requester.client.get(`/api/communities/${community.slug}`)).json();
    assert.equal(view.requestStatus, "pending");
    assert.equal(view.memberInfo, null);
    assert.ok(!(await membersOf(owner.client, community.id)).some((m) => m.userId === requester.id));
  });

  test("owner and moderators are notified about the request", async () => {
    for (const staff of [owner, mod]) {
      const n = (await notificationsOf(staff.client)).find((x) => x.type === "community_join_request" && x.actorId === requester.id);
      assert.ok(n, `no join request notification for ${staff.username}`);
    }
  });

  test("only owner and moderators can list requests; the list has no emails", async () => {
    assert.equal((await outsider.client.get(`/api/communities/${community.id}/requests`)).status, 403);
    assert.equal((await requester.client.get(`/api/communities/${community.id}/requests`)).status, 403);
    const res = await mod.client.get(`/api/communities/${community.id}/requests`);
    await expectStatus(res, 200);
    const text = await res.text();
    assert.ok(JSON.parse(text).some((r: any) => r.userId === requester.id && r.user.username === requester.username));
    assert.ok(!text.includes("@e2e.test") && !text.includes("$2b$"));
  });

  test("outsiders and the requester cannot approve or decline", async () => {
    for (const u of [outsider, requester]) {
      assert.equal((await u.client.post(`/api/communities/${community.id}/requests/${requester.id}/approve`)).status, 403);
      assert.equal((await u.client.post(`/api/communities/${community.id}/requests/${requester.id}/decline`)).status, 403);
    }
  });

  test("a moderator approves: the requester becomes a member and is notified", async () => {
    await expectStatus(await mod.client.post(`/api/communities/${community.id}/requests/${requester.id}/approve`), 200);
    const m = (await membersOf(owner.client, community.id)).filter((x) => x.userId === requester.id);
    assert.deepEqual(m.map((x) => x.role), ["member"]);
    const view = await (await requester.client.get(`/api/communities/${community.slug}`)).json();
    assert.equal(view.memberInfo?.role, "member");
    assert.ok((await notificationsOf(requester.client)).some((x) => x.type === "community_join_approved"));
    assert.ok(!(await (await owner.client.get(`/api/communities/${community.id}/requests`)).json()).some((r: any) => r.userId === requester.id));
  });

  test("a declined user cannot re-request right away", async () => {
    const d = await socialUser("vd");
    assert.equal((await d.client.post(`/api/communities/${community.id}/join`)).status, 202);
    await expectStatus(await owner.client.post(`/api/communities/${community.id}/requests/${d.id}/decline`), 200);
    assert.equal((await d.client.post(`/api/communities/${community.id}/join`)).status, 403);
    const view = await (await d.client.get(`/api/communities/${community.slug}`)).json();
    assert.equal(view.requestStatus, "declined");
    assert.ok(!(await membersOf(owner.client, community.id)).some((m) => m.userId === d.id));
  });

  test("approving a user without a pending request does not add them", async () => {
    const victim = await socialUser("vn");
    await mod.client.post(`/api/communities/${community.id}/requests/${victim.id}/approve`);
    await mod.client.post(`/api/communities/${community.id}/requests/${victim.id}/approve`);
    const rows = (await membersOf(owner.client, community.id)).filter((m) => m.userId === victim.id);
    assert.equal(rows.length, 0, `user without a request was added ${rows.length} time(s)`);
  });

  test("a declined request cannot be approved afterwards by replaying approve", async () => {
    const d = await socialUser("ve");
    assert.equal((await d.client.post(`/api/communities/${community.id}/join`)).status, 202);
    await expectStatus(await owner.client.post(`/api/communities/${community.id}/requests/${d.id}/decline`), 200);
    await owner.client.post(`/api/communities/${community.id}/requests/${d.id}/approve`);
    assert.ok(!(await membersOf(owner.client, community.id)).some((m) => m.userId === d.id), "declined user became a member");
  });

  test("request errors never echo SQL", async () => {
    const res = await owner.client.post(`/api/communities/${community.id}/requests/abc/approve`);
    await assertCleanClientError(res, "approve abc");
  });

  test("the public view of a private community holds only metadata", async () => {
    const res = await new Client().get(`/api/communities/${community.slug}`);
    await expectStatus(res, 200);
    const c = await res.json();
    assert.equal(c.name, community.name);
    assert.equal(c.memberInfo, null);
    assert.equal(c.requestStatus, null);
    for (const key of ["members", "posts", "bans", "requests"]) assert.equal(c[key], undefined, key);
  });

  test("non-members cannot list the members of a private community", async () => {
    const res = await outsider.client.get(`/api/communities/${community.id}/members`);
    assert.ok([403, 404].includes(res.status), `outsider read the member list with HTTP ${res.status}`);
  });

  test("non-members cannot post into a private community", async () => {
    const x = await socialUser("vp");
    const res = await x.client.post("/api/posts", { content: `intrusion ${RUN_ID}`, category: "discussion", communityId: String(community.id) });
    assert.ok([403, 404].includes(res.status), `non-member posted into a private community with HTTP ${res.status}`);
  });

  test("posts of a private community are hidden from non-members", async () => {
    const res = await requester.client.post("/api/posts", { content: `members only ${RUN_ID}`, category: "discussion", communityId: String(community.id) });
    await expectStatus(res, 201);
    const postId = (await res.json()).id;
    const feed = await (await new Client().get(`/api/posts?communityId=${community.id}`)).json();
    assert.ok(!feed.some((p: any) => p.id === postId), "anonymous feed lists private community posts");
    const single = await outsider.client.get(`/api/posts/${postId}`);
    assert.ok([403, 404].includes(single.status), `outsider read a private community post with HTTP ${single.status}`);
  });
});

// ---------------------------------------------------------------------------------------------
describe("communities: roles and moderation", () => {
  let owner: TestUser;
  let mod: TestUser;
  let member: TestUser;
  let member2: TestUser;
  let outsider: TestUser;
  let cid: number;

  before(async () => {
    owner = await socialUser("ro");
    mod = await socialUser("rm");
    member = await socialUser("ra");
    member2 = await socialUser("rb");
    outsider = await socialUser("rx");
    await giveKarma(admin, owner.id, 200);
    cid = (await createCommunity(owner.client, { name: `Roles ${RUN_ID}` })).id;
    for (const u of [mod, member, member2]) await expectStatus(await u.client.post(`/api/communities/${cid}/join`), 200);
    await expectStatus(await owner.client.patch(`/api/communities/${cid}/members/${mod.id}/role`, { role: "moderator" }), 200);
  });

  const staffActions = (target: number): Array<[string, string, unknown?]> => [
    ["DELETE", `/api/communities/${cid}/members/${target}`],
    ["POST", `/api/communities/${cid}/ban`, { userId: target, reason: "x" }],
    ["DELETE", `/api/communities/${cid}/ban/${target}`],
    ["POST", `/api/communities/${cid}/invite`, { userId: target }],
    ["POST", `/api/communities/${cid}/moderators`, { userId: target }],
    ["PATCH", `/api/communities/${cid}/members/${target}/role`, { role: "moderator" }],
    ["POST", `/api/communities/${cid}/requests/${target}/approve`],
    ["POST", `/api/communities/${cid}/requests/${target}/decline`],
    ["GET", `/api/communities/${cid}/bans`],
    ["GET", `/api/communities/${cid}/reports`],
    ["GET", `/api/communities/${cid}/requests`],
  ];

  test("regular members and outsiders get 403 for every staff action", async () => {
    const extra = await socialUser("rz");
    for (const actor of [member, outsider]) {
      for (const [method, path, body] of staffActions(actor === member ? member2.id : extra.id)) {
        const res = await actor.client.request(method, path, body === undefined ? {} : { json: body });
        assert.equal(res.status, 403, `${actor === member ? "member" : "outsider"} ${method} ${path} -> ${res.status}`);
      }
    }
    assert.ok((await membersOf(owner.client, cid)).some((m) => m.userId === member2.id), "member2 is still a member");
  });

  test("a moderator cannot promote anyone, add moderators or make themselves owner", async () => {
    assert.equal((await mod.client.post(`/api/communities/${cid}/moderators`, { userId: member.id })).status, 403);
    assert.equal((await mod.client.patch(`/api/communities/${cid}/members/${mod.id}/role`, { role: "owner" })).status, 403);
    assert.equal((await mod.client.patch(`/api/communities/${cid}/members/${owner.id}/role`, { role: "member" })).status, 403);
    const roles = Object.fromEntries((await membersOf(owner.client, cid)).map((m) => [m.userId, m.role]));
    assert.equal(roles[mod.id], "moderator");
    assert.equal(roles[owner.id], "owner");
    assert.equal(roles[member.id], "member");
  });

  test("a moderator cannot kick or ban the owner", async () => {
    assert.equal((await mod.client.delete(`/api/communities/${cid}/members/${owner.id}`)).status, 403);
    assert.equal((await mod.client.post(`/api/communities/${cid}/ban`, { userId: owner.id })).status, 403);
  });

  test("the owner cannot kick, ban or demote themselves as the last owner", async () => {
    assert.equal((await owner.client.delete(`/api/communities/${cid}/members/${owner.id}`)).status, 403);
    assert.equal((await owner.client.post(`/api/communities/${cid}/ban`, { userId: owner.id })).status, 400);
    assert.equal((await owner.client.patch(`/api/communities/${cid}/members/${owner.id}/role`, { role: "member" })).status, 400);
    assert.equal((await membersOf(owner.client, cid)).find((m) => m.userId === owner.id)?.role, "owner");
  });

  test("a moderator can kick a regular member", async () => {
    const k = await socialUser("rk");
    await expectStatus(await k.client.post(`/api/communities/${cid}/join`), 200);
    await expectStatus(await mod.client.delete(`/api/communities/${cid}/members/${k.id}`), 200);
    assert.ok(!(await membersOf(owner.client, cid)).some((m) => m.userId === k.id));
    assert.equal((await mod.client.delete(`/api/communities/${cid}/members/${k.id}`)).status, 404, "kick a non-member");
  });

  test("a moderator can invite; the invitee becomes a member and is notified", async () => {
    const i = await socialUser("ri");
    await expectStatus(await mod.client.post(`/api/communities/${cid}/invite`, { userId: i.id }), 200);
    assert.equal((await membersOf(owner.client, cid)).find((m) => m.userId === i.id)?.role, "member");
    assert.ok((await notificationsOf(i.client)).some((n) => n.type === "community_join_approved" && n.communityId === cid));
    assert.equal((await mod.client.post(`/api/communities/${cid}/invite`, { userId: i.id })).status, 400, "already a member");
    assert.equal((await mod.client.post(`/api/communities/${cid}/invite`, { userId: 999999999 })).status, 404);
    assert.equal((await mod.client.post(`/api/communities/${cid}/invite`, {})).status, 400);
  });

  test("the owner promotes and demotes via the role route", async () => {
    await expectStatus(await owner.client.patch(`/api/communities/${cid}/members/${member.id}/role`, { role: "moderator" }), 200);
    assert.equal((await membersOf(owner.client, cid)).find((m) => m.userId === member.id)?.role, "moderator");
    await expectStatus(await owner.client.patch(`/api/communities/${cid}/members/${member.id}/role`, { role: "member" }), 200);
    assert.equal((await membersOf(owner.client, cid)).find((m) => m.userId === member.id)?.role, "member");
  });

  test("role values are validated and the target must be a member", async () => {
    for (const role of ["admin", "OWNER", "", null, ["owner"], { $ne: "member" }]) {
      const res = await owner.client.patch(`/api/communities/${cid}/members/${member.id}/role`, { role });
      assert.equal(res.status, 400, `role=${JSON.stringify(role)} got ${res.status}`);
    }
    assert.equal((await owner.client.patch(`/api/communities/${cid}/members/${outsider.id}/role`, { role: "moderator" })).status, 404);
  });

  test("the moderators route validates its target", async () => {
    assert.equal((await owner.client.post(`/api/communities/${cid}/moderators`, { userId: "abc" })).status, 400);
    assert.equal((await owner.client.post(`/api/communities/${cid}/moderators`, { userId: 999999999 })).status, 404);
    assert.equal((await owner.client.post(`/api/communities/${cid}/moderators`, { userId: owner.id })).status, 400);
  });

  test("ban lists contain no emails or hashes", async () => {
    const b = await socialUser("rl");
    await expectStatus(await mod.client.post(`/api/communities/${cid}/ban`, { userId: b.id, reason: "<script>alert(1)</script>" }), 200);
    const res = await mod.client.get(`/api/communities/${cid}/bans`);
    const text = await res.text();
    assert.ok(!text.includes("@e2e.test") && !text.includes("$2b$"));
    assert.equal(JSON.parse(text).find((x: any) => x.userId === b.id)?.reason, "<script>alert(1)</script>");
  });

  describe("bans are enforced everywhere", () => {
    let banned: TestUser;
    let communityPostId: number;

    before(async () => {
      banned = await socialUser("rn");
      const poster = await socialUser("rq");
      await expectStatus(await poster.client.post(`/api/communities/${cid}/join`), 200);
      const post = await poster.client.post("/api/posts", { content: `host post ${RUN_ID}`, category: "discussion", communityId: String(cid) });
      await expectStatus(post, 201);
      communityPostId = (await post.json()).id;
      await expectStatus(await banned.client.post(`/api/communities/${cid}/join`), 200);
      await expectStatus(await owner.client.post(`/api/communities/${cid}/ban`, { userId: banned.id, reason: "e2e" }), 200);
    });

    test("a banned user cannot post into the community", async () => {
      const res = await banned.client.post("/api/posts", { content: `banned post ${RUN_ID}`, category: "discussion", communityId: String(cid) });
      assert.equal(res.status, 403, `banned user posted with HTTP ${res.status}`);
    });

    test("a banned user cannot comment on the community's posts", async () => {
      const res = await banned.client.post("/api/comments", { content: `banned comment ${RUN_ID}`, postId: communityPostId });
      assert.equal(res.status, 403, `banned user commented with HTTP ${res.status}`);
    });

    test("a banned user cannot be invited, approved or made moderator", async () => {
      await mod.client.post(`/api/communities/${cid}/invite`, { userId: banned.id });
      await mod.client.post(`/api/communities/${cid}/requests/${banned.id}/approve`);
      await owner.client.post(`/api/communities/${cid}/moderators`, { userId: banned.id });
      const rows = (await membersOf(owner.client, cid)).filter((m) => m.userId === banned.id);
      assert.deepEqual(rows.map((m) => m.role), [], "a banned user was put back into the community");
    });
  });

  test("community moderators do not see reporter IP addresses", async () => {
    const poster = await socialUser("rp");
    const reporter = await socialUser("rr");
    const post = await poster.client.post("/api/posts", { content: `report me ${RUN_ID}`, category: "discussion", communityId: String(cid) });
    await expectStatus(post, 201);
    const postId = (await post.json()).id;
    await expectStatus(await reporter.client.post("/api/reports", { reason: "e2e community report", postId }), 200, 201);
    const res = await mod.client.get(`/api/communities/${cid}/reports`);
    await expectStatus(res, 200);
    const report = (await res.json()).find((r: any) => r.postId === postId);
    assert.ok(report, "report not listed for the moderator");
    assert.ok(!report.ipAddress, `reporter IP exposed to community moderators: ${report.ipAddress}`);
    assert.ok(!JSON.stringify(report).includes(reporter.client.ip), "reporter IP exposed to community moderators");
  });

  test("community report status is validated", async () => {
    for (const status of ["done", "", null, ["resolved"]]) {
      const res = await owner.client.patch(`/api/communities/${cid}/reports/1`, { status });
      assert.equal(res.status, 400, `status=${JSON.stringify(status)}`);
    }
    assert.equal((await owner.client.patch(`/api/communities/${cid}/reports/999999999`, { status: "resolved" })).status, 404);
  });
});

// ---------------------------------------------------------------------------------------------
describe("error responses in social routes", () => {
  test("plain error answers are not served as text/html", async () => {
    const u = await socialUser("eh");
    const res = await u.client.post(`/api/follow/${u.id}`);
    assert.equal(res.status, 400);
    assert.doesNotMatch(res.headers.get("content-type") ?? "", /text\/html/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("websocket", () => {
  const open: Socket[] = [];
  const track = (s: Socket | undefined) => {
    assert.ok(s, "socket did not open");
    open.push(s);
    return s;
  };

  after(async () => {
    await Promise.all(open.map((s) => s.close()));
  });

  test("connecting without a session is refused with 401", async () => {
    const res = await openSocket(null);
    assert.equal(res.status, 401);
  });

  test("a foreign Origin is refused with 403", async () => {
    const u = await socialUser("wo");
    const res = await openSocket(u.client, { origin: "https://evil.example" });
    assert.equal(res.status, 403);
  });

  test("a user only receives their own notifications", async () => {
    const a = await socialUser("wa");
    const b = await socialUser("wb");
    const f = await socialUser("wf");
    const sa = track((await openSocket(a.client)).socket);
    const sb = track((await openSocket(b.client)).socket);
    await sleep(200);
    await expectStatus(await f.client.post(`/api/follow/${a.id}`), 200);
    await sleep(500);
    assert.equal(sa.notifications().length, 1);
    assert.equal(sa.notifications()[0].data.userId, a.id);
    assert.equal(sa.notifications()[0].data.actor?.password, undefined);
    assert.equal(sb.notifications().length, 0, "b received a's notification");
  });

  test("client messages cannot subscribe a socket to another user's events", async () => {
    const a = await socialUser("ws");
    const b = await socialUser("wt");
    const f = await socialUser("wu");
    const sa = track((await openSocket(a.client)).socket);
    for (const msg of [{ type: "subscribe", userId: b.id }, { type: "auth", userId: b.id }, { userId: b.id }]) sa.ws.send(JSON.stringify(msg));
    await sleep(300);
    await expectStatus(await f.client.post(`/api/follow/${b.id}`), 200);
    await sleep(500);
    assert.equal(sa.notifications().length, 0);
  });

  test("closing one tab does not stop notifications in another tab", async () => {
    const a = await socialUser("wv");
    const f = await socialUser("ww");
    const tab1 = track((await openSocket(a.client)).socket);
    const tab2 = track((await openSocket(a.client)).socket);
    await tab1.close();
    await sleep(300);
    await expectStatus(await f.client.post(`/api/follow/${a.id}`), 200);
    await sleep(500);
    assert.equal(tab2.notifications().length, 1, "the remaining tab no longer receives notifications");
  });

  test("a socket stops receiving events after logout", async () => {
    const a = await socialUser("wl");
    const f = await socialUser("wm");
    const s = track((await openSocket(a.client)).socket);
    await sleep(200);
    await expectStatus(await a.client.post("/api/logout"), 200);
    await sleep(200);
    await expectStatus(await f.client.post(`/api/follow/${a.id}`), 200);
    await sleep(500);
    assert.equal(s.notifications().length, 0, "logged-out socket still receives the user's notifications");
  });

  test("comments in a private community are not broadcast to outsiders", async () => {
    const owner = await socialUser("wp");
    const outsider = await socialUser("wq");
    await giveKarma(admin, owner.id, 200);
    const c = await createCommunity(owner.client, { name: `WS private ${RUN_ID}`, isPrivate: true });
    const post = await owner.client.post("/api/posts", { content: `ws secret post ${RUN_ID}`, category: "discussion", communityId: String(c.id) });
    await expectStatus(post, 201);
    const postId = (await post.json()).id;
    const s = track((await openSocket(outsider.client)).socket);
    await sleep(200);
    const secret = `ws secret comment ${RUN_ID}`;
    await expectStatus(await owner.client.post("/api/comments", { content: secret, postId }), 201);
    await sleep(500);
    assert.ok(!JSON.stringify(s.messages).includes(secret), "private community comment was pushed to an outsider");
  });
});
