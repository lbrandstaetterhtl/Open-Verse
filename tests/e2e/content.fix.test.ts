// Regression tests for content findings that had no failing test of their own (audit 2, fix phase).
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { Client, expectStatus, ADMIN_USER, ADMIN_PASSWORD, RUN_ID, PNG_1X1 } from "./client";
import { freshUser, createPost, postForm, createCommunity, invite, assertClientError } from "./helpers/content";
import { openSocket, sleep } from "./helpers/social";

const admin = new Client();

before(async () => {
  assert.ok(ADMIN_USER && ADMIN_PASSWORD, "E2E_ADMIN_USER and E2E_ADMIN_PASSWORD must be set");
  assert.equal((await admin.login(ADMIN_USER, ADMIN_PASSWORD)).status, 200, "admin login failed");
});

describe("content fixes: uploads", () => {
  test("a post with more than one file is rejected instead of storing unused files (CONTENT-20)", async () => {
    const u = await freshUser("fx2f");
    const res = await postForm(u.client, { content: `two files ${RUN_ID}`, category: "entertainment" }, [
      { data: PNG_1X1, type: "image/png", name: "a.png" },
      { data: PNG_1X1, type: "image/png", name: "b.png" },
    ]);
    await assertClientError(res);
    // The rejection did not count as a post: the same user can post right away.
    await createPost(u, { content: "after the rejected upload" });
  });

  test("an unsupported file type answers 400 INVALID_TYPE (CONTENT-16)", async () => {
    const u = await freshUser("fxtype");
    const res = await postForm(u.client, { content: `pdf ${RUN_ID}`, category: "entertainment" }, [
      { data: "%PDF-1.4", type: "application/pdf", name: "x.pdf" },
    ]);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "INVALID_TYPE");
  });
});

describe("content fixes: moderation filter", () => {
  test("words that start with a banned word are still blocked, names that merely contain one are not (CONTENT-12)", async () => {
    const blocked = await freshUser("fxmb");
    const res = await blocked.client.post("/api/posts", { content: "he is a KILLER", category: "news" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "CONTENT_BLOCKED");
    const fine = await freshUser("fxmf");
    await createPost(fine, { content: "A skillet from Middlesex, reading Dickens" });
  });
});

describe("content fixes: response shapes", () => {
  test("feed authors do not carry the shadow-ban flag (CONTENT-21e)", async () => {
    const u = await freshUser("fxfeed");
    await createPost(u, { content: `feed shape ${RUN_ID}` });
    const feed = await (await new Client().get("/api/posts?limit=20")).json();
    assert.ok(feed.length > 0);
    for (const p of feed) assert.equal(p.author.isShadowBanned, undefined, `post ${p.id} exposes author.isShadowBanned`);
  });

  test("the report answer does not contain the stored IP address (CONTENT-21b)", async () => {
    const author = await freshUser("fxria");
    const reporter = await freshUser("fxrir");
    const post = await createPost(author, { content: "report ip" });
    const res = await reporter.client.post("/api/reports", { reason: "spam", postId: post.id });
    await expectStatus(res, 201);
    assert.equal((await res.json()).ipAddress, undefined);
  });
});

describe("content fixes: reports", () => {
  test("a duplicate open report answers 409; after it was handled the user may report again (UI-14)", async () => {
    const author = await freshUser("fxdra");
    const reporter = await freshUser("fxdrr");
    const post = await createPost(author, { content: "duplicate report" });
    const first = await reporter.client.post("/api/reports", { reason: "Spam", postId: post.id });
    await expectStatus(first, 201);
    const again = await reporter.client.post("/api/reports", { reason: "Other", postId: post.id });
    assert.equal(again.status, 409);
    assert.equal((await again.json()).code, "ALREADY_REPORTED");
    // Parallel duplicates also create only one report.
    const other = await freshUser("fxdrp");
    const results = await Promise.all(Array.from({ length: 5 }, () => other.client.post("/api/reports", { reason: "Spam", postId: post.id })));
    assert.equal(results.filter((r) => r.status === 201).length, 1);

    await expectStatus(await admin.patch(`/api/reports/${(await first.json()).id}`, { status: "rejected" }), 200);
    await expectStatus(await reporter.client.post("/api/reports", { reason: "Spam", postId: post.id }), 201);
  });

  test("a report naming a comment is checked against the comment's post visibility", async () => {
    const priv = await createCommunity(admin, `FX Priv R ${RUN_ID}`, { isPrivate: true });
    const member = await freshUser("fxrm");
    await invite(admin, priv.id, member.id);
    const post = await createPost(member, { content: "private for reports", category: "discussion", communityId: String(priv.id) });
    const c = await (await member.client.post("/api/comments", { content: "private comment", postId: post.id })).json();
    const outsider = await freshUser("fxro");
    assert.equal((await outsider.client.post("/api/reports", { reason: "x", commentId: c.id })).status, 404);
    assert.equal((await outsider.client.post("/api/reports", { reason: "x", postId: post.id })).status, 404);
  });
});

describe("content fixes: comments", () => {
  test("the comments endpoint pages with limit/offset in creation order (CONTENT-18)", async () => {
    const u = await freshUser("fxpage");
    const post = await createPost(u, { content: "paging" });
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) ids.push((await (await u.client.post("/api/comments", { content: `c${i}`, postId: post.id })).json()).id);
    const page1 = await (await new Client().get(`/api/posts/${post.id}/comments?limit=2`)).json();
    const page2 = await (await new Client().get(`/api/posts/${post.id}/comments?limit=2&offset=2`)).json();
    const all = await (await new Client().get(`/api/posts/${post.id}/comments`)).json();
    assert.deepEqual(page1.map((c: any) => c.id), ids.slice(0, 2));
    assert.deepEqual(page2.map((c: any) => c.id), ids.slice(2, 4));
    assert.deepEqual(all.map((c: any) => c.id), ids);
  });

  test("a user banned from a community cannot react to its posts or like its comments", async () => {
    const pub = await createCommunity(admin, `FX Pub B ${RUN_ID}`, { allowedCategories: "discussion" });
    const poster = await freshUser("fxbp");
    const banned = await freshUser("fxbb");
    for (const u of [poster, banned]) await expectStatus(await u.client.post(`/api/communities/${pub.id}/join`), 200);
    const post = await createPost(poster, { content: "community post", category: "discussion", communityId: String(pub.id) });
    const c = await (await poster.client.post("/api/comments", { content: "community comment", postId: post.id })).json();
    await expectStatus(await admin.post(`/api/communities/${pub.id}/ban`, { userId: banned.id, reason: "fx" }), 200);
    assert.equal((await banned.client.post(`/api/posts/${post.id}/react`, { isLike: false })).status, 403);
    assert.equal((await banned.client.post(`/api/comments/${c.id}/like`)).status, 403);
    // Reading stays possible: the community is public.
    assert.equal((await banned.client.get(`/api/posts/${post.id}`)).status, 200);
  });
});

describe("content fixes: websocket", () => {
  test("new_post of a private community is pushed to members only, as an id (SOCIAL-12 / ATK-RT-2)", async () => {
    const priv = await createCommunity(admin, `FX Priv WS ${RUN_ID}`, { isPrivate: true });
    const member = await freshUser("fxwm");
    const outsider = await freshUser("fxwo");
    await invite(admin, priv.id, member.id);
    const inSock = (await openSocket(member.client)).socket!;
    const outSock = (await openSocket(outsider.client)).socket!;
    assert.ok(inSock && outSock, "sockets must open");
    await sleep(200);
    const post = await createPost(member, { content: `ws private post ${RUN_ID}`, category: "discussion", communityId: String(priv.id) });
    await expectStatus(await member.client.post("/api/comments", { content: `ws private comment ${RUN_ID}`, postId: post.id }), 201);
    await sleep(500);
    const about = (msgs: any[]) => msgs.filter((m) => m?.postId === post.id);
    assert.equal(about(outSock.messages).length, 0, "an outsider was told about a private community post");
    const seen = about(inSock.messages).map((m) => m.type).sort();
    assert.deepEqual(seen, ["new_comment", "new_post"]);
    assert.ok(!JSON.stringify(inSock.messages).includes(`ws private comment ${RUN_ID}`), "comment content is pushed over the socket");
    await Promise.all([inSock.close(), outSock.close()]);
  });
});
