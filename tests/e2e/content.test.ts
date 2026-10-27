import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { Client, expectStatus, ADMIN_USER, ADMIN_PASSWORD, RUN_ID, PNG_1X1, makeImage, BASE_URL } from "./client";
import {
  type TestUser,
  freshUser,
  createPost,
  postForm,
  createCommunity,
  invite,
  assertClientError,
  assertNoInternals,
  karmaOf,
  sniff,
  GIF_1X1,
  MP4_STUB,
  WEBM_STUB,
} from "./helpers/content";

const admin = new Client();

// Shared fixtures: a public and a private community, a member of both and an outsider.
let pub: any;
let priv: any;
let member: TestUser;
let outsider: TestUser;
let privPost: any;
let privCommentId: number;
const PRIV_MARKER = `private-secret-${RUN_ID}`;

before(async () => {
  assert.ok(ADMIN_USER && ADMIN_PASSWORD, "E2E_ADMIN_USER and E2E_ADMIN_PASSWORD must be set");
  assert.equal((await admin.login(ADMIN_USER, ADMIN_PASSWORD)).status, 200, "admin login failed");
  pub = await createCommunity(admin, `CT Pub ${RUN_ID}`, { allowedCategories: "news,discussion" });
  priv = await createCommunity(admin, `CT Priv ${RUN_ID}`, { isPrivate: true });
  member = await freshUser("mem");
  outsider = await freshUser("out");
  await invite(admin, priv.id, member.id);
  await expectStatus(await member.client.post(`/api/communities/${pub.id}/join`), 200);

  privPost = await createPost(member, {
    title: `Private title ${PRIV_MARKER}`,
    content: `Private body ${PRIV_MARKER}`,
    category: "discussion",
    communityId: String(priv.id),
  });
  const c = await member.client.post("/api/comments", { content: `Private comment ${PRIV_MARKER}`, postId: privPost.id });
  await expectStatus(c, 201);
  privCommentId = (await c.json()).id;
  await expectStatus(await member.client.post(`/api/posts/${privPost.id}/react`, { isLike: true }), 200);
});

describe("content: creating posts", () => {
  for (const category of ["news", "entertainment", "discussion"]) {
    test(`a ${category} text post is created with the right shape`, async () => {
      const u = await freshUser(category.slice(0, 3));
      const res = await u.client.post("/api/posts", { title: `T ${category} ${RUN_ID}`, content: `Body ${category}`, category });
      await expectStatus(res, 201);
      assert.match(res.headers.get("content-type") ?? "", /application\/json/);
      const post = await res.json();
      assert.ok(Number.isInteger(post.id) && post.id > 0);
      assert.equal(post.title, `T ${category} ${RUN_ID}`);
      assert.equal(post.content, `Body ${category}`);
      assert.equal(post.category, category);
      assert.equal(post.authorId, u.id);
      assert.equal(post.communityId, null);
      assert.equal(post.mediaUrl, null);
      assert.equal(post.karma, 0);
    });
  }

  test("a missing title is generated from the content (shortened to 50 chars)", async () => {
    const u = await freshUser("ttl");
    const content = "A".repeat(80);
    const post = await createPost(u, { content });
    assert.equal(post.title, "A".repeat(47) + "...");
  });

  test("JSON post without content and without media is rejected", async () => {
    const u = await freshUser("nocont");
    await assertClientError(await u.client.post("/api/posts", { title: "only a title", category: "news" }));
  });

  test("multipart post without content and without a file is rejected", async () => {
    const u = await freshUser("mpempty");
    const res = await postForm(u.client, { title: `empty ${RUN_ID}`, content: "", category: "news" });
    await assertClientError(res);
  });

  test("whitespace-only content is rejected", async () => {
    const u = await freshUser("ws");
    await assertClientError(await u.client.post("/api/posts", { content: "   \n\t  ", category: "news" }));
  });

  test("content of 100k characters is rejected", async () => {
    const u = await freshUser("long");
    // Not "x" repeated: that contains the banned word "xxx" and would be rejected for the wrong reason.
    await assertClientError(await u.client.post("/api/posts", { content: "lorem ipsum ".repeat(9000), category: "news" }));
  });

  test("a title of 5000 characters is rejected", async () => {
    const u = await freshUser("ltitle");
    await assertClientError(await u.client.post("/api/posts", { title: "t".repeat(5000), content: "ok", category: "news" }));
  });

  for (const [label, body] of [
    ["content number", { content: 12345, category: "news" }],
    ["content array", { content: ["a", "b"], category: "news" }],
    ["content object", { content: { $gt: "" }, category: "news" }],
    ["title object", { title: { a: 1 }, content: "fine", category: "news" }],
    ["category array", { content: "fine", category: ["news"] }],
    ["category object", { content: "fine", category: { $ne: null } }],
  ] as const) {
    test(`wrong type (${label}) is rejected with 4xx`, async () => {
      const u = await freshUser("type");
      await assertClientError(await u.client.post("/api/posts", body), label);
    });
  }

  test("unknown categories are rejected", async () => {
    for (const category of ["<script>alert(1)</script>", "x".repeat(2000)]) {
      const u = await freshUser("cat");
      await assertClientError(await u.client.post("/api/posts", { content: "category check", category }), category.slice(0, 20));
    }
  });

  test("a null byte in the content is rejected without a server error", async () => {
    const u = await freshUser("nul");
    await assertClientError(await u.client.post("/api/posts", { content: "before\u0000after", category: "news" }));
  });

  test("unicode, emoji and RTL text are stored unchanged", async () => {
    const u = await freshUser("uni");
    const content = "Grüße 👋🏽 مرحبا ‮abc \u{1F680}";
    const post = await createPost(u, { content, title: "ünï 😀" });
    const detail = await (await new Client().get(`/api/posts/${post.id}`)).json();
    assert.equal(detail.content, content);
    assert.equal(detail.title, "ünï 😀");
  });

  test("privileged fields in the body are ignored (mass assignment)", async () => {
    const u = await freshUser("mass");
    const post = await createPost(u, {
      title: "mass",
      content: "mass assignment",
      authorId: 1,
      userId: 1,
      karma: 9999,
      id: 1,
      createdAt: "2000-01-01T00:00:00.000Z",
      mediaUrl: "../../etc/passwd",
      mediaType: "video",
    });
    assert.equal(post.authorId, u.id);
    assert.equal(post.karma, 0);
    assert.notEqual(post.id, 1);
    assert.ok(new Date(post.createdAt).getFullYear() >= 2025);
    assert.equal(post.mediaUrl, null);
    assert.equal(post.mediaType, null);
  });

  test("stored XSS payloads come back as plain JSON data", async () => {
    const u = await freshUser("xss");
    const title = `<img src=x onerror=alert(1)> ${RUN_ID}`;
    const content = `<script>alert(document.cookie)</script> javascript:alert(1)`;
    const post = await createPost(u, { title, content });
    const res = await new Client().get(`/api/posts/${post.id}`);
    assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
    const body = await res.json();
    assert.equal(body.title, title);
    assert.equal(body.content, content);
  });

  test("anonymous users and requests without CSRF token cannot post", async () => {
    const anon = new Client();
    await anon.refreshCsrf();
    assert.equal((await anon.post("/api/posts", { content: "anon", category: "news" })).status, 401);
    const u = await freshUser("csrf");
    assert.equal((await u.client.post("/api/posts", { content: "no token", category: "news" }, { csrf: false })).status, 403);
    const form = await postForm(new Client(), { content: "anon upload", category: "news" }, [{ data: PNG_1X1, type: "image/png", name: "a.png" }]);
    assert.ok([401, 403].includes(form.status), `anonymous upload got ${form.status}`);
  });
});

describe("content: moderation filter and cooldown", () => {
  test("a banned word in the content is blocked with CONTENT_BLOCKED", async () => {
    const u = await freshUser("modc");
    const res = await u.client.post("/api/posts", { content: "free PORN here", category: "news" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "CONTENT_BLOCKED");
  });

  test("a banned word in the title is blocked too", async () => {
    const u = await freshUser("modt");
    const res = await u.client.post("/api/posts", { title: "nazi stuff", content: "harmless", category: "news" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "CONTENT_BLOCKED");
  });

  test("ordinary words that merely contain a banned word are allowed", async () => {
    // "skills" contains "kill", "Essex" contains "sex": a substring filter blocks normal speech.
    const u = await freshUser("fp");
    const res = await u.client.post("/api/posts", { content: "Improve your skills in Essex", category: "news" });
    await expectStatus(res, 201);
  });

  test("a rejected post does not start the cooldown", async () => {
    const u = await freshUser("cdrej");
    assert.equal((await u.client.post("/api/posts", { content: "porn", category: "news" })).status, 400);
    await createPost(u, { content: "valid after a rejection" });
  });

  test("the cooldown answers 429 POST_COOLDOWN with the remaining seconds", async () => {
    const u = await freshUser("cd");
    await createPost(u, { content: "first" });
    const res = await u.client.post("/api/posts", { content: "second", category: "news" });
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(body.code, "POST_COOLDOWN");
    assert.ok(body.params.seconds >= 1 && body.params.seconds <= 30, `seconds=${body.params.seconds}`);
    assert.equal(typeof body.error, "string");
  });

  test("parallel requests cannot bypass the cooldown", async () => {
    const u = await freshUser("race");
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => u.client.post("/api/posts", { content: `race ${i} ${RUN_ID}`, category: "news" })),
    );
    const created = results.filter((r) => r.status === 201).length;
    assert.equal(created, 1, `${created} posts were created within the cooldown`);
  });
});

describe("content: community posts", () => {
  test("a member can post into a community with an allowed category", async () => {
    const u = await freshUser("cpm");
    await expectStatus(await u.client.post(`/api/communities/${pub.id}/join`), 200);
    const post = await createPost(u, { content: "community member post", category: "news", communityId: String(pub.id) });
    assert.equal(post.communityId, pub.id);
  });

  test("a category the community does not allow is rejected with CATEGORY_NOT_ALLOWED", async () => {
    const u = await freshUser("cpcat");
    await expectStatus(await u.client.post(`/api/communities/${pub.id}/join`), 200);
    const res = await u.client.post("/api/posts", { content: "wrong category", category: "entertainment", communityId: String(pub.id) });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, "CATEGORY_NOT_ALLOWED");
    assert.equal(body.params.category, "entertainment");
    assert.match(body.params.allowed, /news/);
  });

  test("a non-member cannot post into a private community", async () => {
    const u = await freshUser("cpnp");
    const res = await u.client.post("/api/posts", { content: `intruder ${RUN_ID}`, category: "discussion", communityId: String(priv.id) });
    assert.ok([403, 404].includes(res.status), `non-member post into private community got ${res.status}`);
  });

  test("a non-member cannot post into a public community without joining", async () => {
    const u = await freshUser("cpnj");
    const res = await u.client.post("/api/posts", { content: "not joined", category: "news", communityId: String(pub.id) });
    assert.equal(res.status, 403);
  });

  test("a user banned from a community cannot post into it", async () => {
    const u = await freshUser("cpban");
    await expectStatus(await u.client.post(`/api/communities/${pub.id}/join`), 200);
    await expectStatus(await admin.post(`/api/communities/${pub.id}/ban`, { userId: u.id, reason: "e2e content" }), 200);
    const res = await u.client.post("/api/posts", { content: "banned but posting", category: "news", communityId: String(pub.id) });
    assert.equal(res.status, 403);
  });

  test("a non-existent community answers 404", async () => {
    const u = await freshUser("cp404");
    assert.equal((await u.client.post("/api/posts", { content: "x", category: "news", communityId: "99999999" })).status, 404);
  });

  test("a non-numeric communityId is rejected instead of silently creating a global post", async () => {
    const u = await freshUser("cpnan");
    await assertClientError(await u.client.post("/api/posts", { content: `nan community ${RUN_ID}`, category: "news", communityId: "abc" }));
  });
});

describe("content: listing posts", () => {
  let listC: any;
  const ids: number[] = [];

  before(async () => {
    listC = await createCommunity(admin, `CT List ${RUN_ID}`);
    for (const category of ["news", "entertainment", "discussion"]) {
      const u = await freshUser("lst");
      await expectStatus(await u.client.post(`/api/communities/${listC.id}/join`), 200);
      ids.push((await createPost(u, { content: `list ${category}`, category, communityId: String(listC.id) })).id);
    }
  });

  test("communityId filter returns only that community's posts, newest first", async () => {
    const posts = await (await new Client().get(`/api/posts?communityId=${listC.id}`)).json();
    assert.deepEqual(posts.map((p: any) => p.id), [...ids].reverse());
    assert.ok(posts.every((p: any) => p.communityId === listC.id));
    const times = posts.map((p: any) => new Date(p.createdAt).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => b - a));
  });

  test("feed entries have author, reactions and counts but no private author fields", async () => {
    const [p] = await (await new Client().get(`/api/posts?communityId=${listC.id}&limit=1`)).json();
    assert.equal(typeof p.author.username, "string");
    assert.deepEqual(p.reactions, { likes: 0, dislikes: 0 });
    assert.equal(p.commentCount, 0);
    assert.equal(p.isSaved, false);
    assert.equal(p.author.email, undefined);
    assert.equal(p.author.password, undefined);
  });

  test("category filter (single and comma list) works", async () => {
    const one = await (await new Client().get(`/api/posts?communityId=${listC.id}&category=news`)).json();
    assert.deepEqual(one.map((p: any) => p.category), ["news"]);
    const two = await (await new Client().get(`/api/posts?communityId=${listC.id}&category=news,discussion`)).json();
    assert.deepEqual(two.map((p: any) => p.category).sort(), ["discussion", "news"]);
  });

  test("limit and offset page through the results", async () => {
    const page1 = await (await new Client().get(`/api/posts?communityId=${listC.id}&limit=2&offset=0`)).json();
    const page2 = await (await new Client().get(`/api/posts?communityId=${listC.id}&limit=2&offset=2`)).json();
    assert.deepEqual([...page1, ...page2].map((p: any) => p.id), [...ids].reverse());
  });

  test("the global feed does not contain community posts", async () => {
    const feed = await (await new Client().get("/api/posts?limit=100")).json();
    assert.ok(feed.every((p: any) => p.communityId === null));
  });

  test("garbage pagination values fall back to defaults", async () => {
    const res = await new Client().get(`/api/posts?communityId=${listC.id}&limit=abc&offset=-1e9`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).length, 3);
  });

  test("array and object query parameters do not cause a server error", async () => {
    for (const qs of ["category[]=news&category[]=discussion", "category[$ne]=x", "communityId[$gt]=0", "limit[]=1"]) {
      const res = await new Client().get(`/api/posts?${qs}`);
      assert.ok(res.status < 500, `${qs} -> ${res.status}`);
    }
  });
});

describe("content: single post", () => {
  test("post detail exposes the author's username but no email or moderation fields", async () => {
    const u = await freshUser("det");
    const post = await createPost(u, { content: "detail shape" });
    const body = await (await new Client().get(`/api/posts/${post.id}`)).json();
    assert.equal(body.author.username, u.username);
    assert.equal(body.author.password, undefined);
    assert.equal(body.author.email, undefined, "author email is exposed to anonymous users");
    assert.equal(body.author.isShadowBanned, undefined, "shadow-ban state is exposed");
    assert.equal(body.author.freezeReason, undefined, "freeze reason is exposed");
    assert.ok(Array.isArray(body.comments));
    assert.equal(body.likes, 0);
    assert.equal(body.userVote, null);
    assert.equal(body.isSaved, false);
  });

  test("non-numeric, negative and out-of-range post ids answer 404, not 500", async () => {
    for (const id of ["abc", "-1", "0", "1.5", "99999999999", "1%20OR%201=1"]) {
      const res = await new Client().get(`/api/posts/${id}`);
      assert.equal(res.status, 404, `/api/posts/${id} -> ${res.status}`);
      assertNoInternals(await res.text(), id);
    }
  });

  test("comments endpoint with a non-numeric id answers 404, not 500", async () => {
    for (const id of ["abc", "99999999999"]) {
      const res = await new Client().get(`/api/posts/${id}/comments`);
      assert.ok(res.status === 404 || (res.status === 200 && (await res.clone().json()).length === 0), `/api/posts/${id}/comments -> ${res.status}`);
    }
  });

  test("a deleted post is gone from detail and comments", async () => {
    const u = await freshUser("delg");
    const post = await createPost(u, { content: "to be deleted" });
    await expectStatus(await u.client.post("/api/comments", { content: "c", postId: post.id }), 201);
    assert.equal((await u.client.delete(`/api/posts/${post.id}`)).status, 204);
    assert.equal((await new Client().get(`/api/posts/${post.id}`)).status, 404);
    const comments = await new Client().get(`/api/posts/${post.id}/comments`);
    assert.ok(comments.status === 404 || (await comments.json()).length === 0);
  });

  test("comments of a deleted account are listed as [deleted] on the comments endpoint", async () => {
    const host = await freshUser("dhost");
    const post = await createPost(host, { content: "host" });
    const gone = await freshUser("dgone");
    await expectStatus(await gone.client.post("/api/comments", { content: `ghost ${RUN_ID}`, postId: post.id }), 201);
    await expectStatus(await admin.delete(`/api/admin/users/${gone.id}`), 200);
    const list = await (await new Client().get(`/api/posts/${post.id}/comments`)).json();
    assert.equal(list.find((c: any) => c.content === `ghost ${RUN_ID}`)?.author?.username, "[deleted]");
  });
});

describe("content: deleting posts", () => {
  test("the author can delete their own post", async () => {
    const u = await freshUser("delown");
    const post = await createPost(u, { content: "mine" });
    assert.equal((await u.client.delete(`/api/posts/${post.id}`)).status, 204);
    assert.equal((await u.client.get(`/api/posts/${post.id}`)).status, 404);
  });

  test("another user, an anonymous user and a request without CSRF token cannot delete it", async () => {
    const u = await freshUser("delv");
    const other = await freshUser("delo");
    const post = await createPost(u, { content: "victim" });
    assert.equal((await other.client.delete(`/api/posts/${post.id}`)).status, 403);
    const anon = new Client();
    await anon.refreshCsrf();
    assert.equal((await anon.delete(`/api/posts/${post.id}`)).status, 401);
    assert.equal((await u.client.delete(`/api/posts/${post.id}`, { csrf: false })).status, 403);
    assert.equal((await new Client().get(`/api/posts/${post.id}`)).status, 200);
  });

  test("an admin can delete someone else's post", async () => {
    const u = await freshUser("dela");
    const post = await createPost(u, { content: "admin deletes" });
    assert.equal((await admin.delete(`/api/posts/${post.id}`)).status, 204);
    assert.equal((await new Client().get(`/api/posts/${post.id}`)).status, 404);
  });

  test("deleting a non-existent or non-numeric post id answers 404", async () => {
    const u = await freshUser("del404");
    assert.equal((await u.client.delete("/api/posts/99999999")).status, 404);
    assert.equal((await u.client.delete("/api/posts/abc")).status, 404);
  });
});

describe("content: reactions", () => {
  test("like, switch to dislike and remove keep counts and author karma consistent", async () => {
    const author = await freshUser("rauth");
    const voter = await freshUser("rvote");
    const post = await createPost(author, { content: "react to me" });

    let res = await voter.client.post(`/api/posts/${post.id}/react`, { isLike: true });
    await expectStatus(res, 200);
    let body = await res.json();
    assert.deepEqual(body.reactions, { likes: 1, dislikes: 0 });
    assert.deepEqual(body.userReaction, { isLike: true });
    assert.equal(await karmaOf(author.username), 1);

    body = await (await voter.client.post(`/api/posts/${post.id}/react`, { isLike: false })).json();
    assert.deepEqual(body.reactions, { likes: 0, dislikes: 1 });
    assert.deepEqual(body.userReaction, { isLike: false });
    assert.equal(await karmaOf(author.username), -1);

    body = await (await voter.client.post(`/api/posts/${post.id}/react`, { isLike: false })).json();
    assert.deepEqual(body.reactions, { likes: 0, dislikes: 0 });
    assert.equal(body.userReaction, null);
    assert.equal(await karmaOf(author.username), 0);
  });

  test("invalid reaction values are rejected", async () => {
    const u = await freshUser("rinv");
    const post = await createPost(u, { content: "invalid reactions" });
    for (const isLike of ["true", 1, null, { $ne: false }, [true]]) {
      const res = await u.client.post(`/api/posts/${post.id}/react`, { isLike });
      assert.equal(res.status, 400, JSON.stringify(isLike));
    }
    assert.equal((await u.client.post(`/api/posts/${post.id}/react`, {})).status, 400);
  });

  test("reacting needs a login and an existing post", async () => {
    const anon = new Client();
    await anon.refreshCsrf();
    assert.equal((await anon.post("/api/posts/1/react", { isLike: true })).status, 401);
    const u = await freshUser("r404");
    assert.equal((await u.client.post("/api/posts/99999999/react", { isLike: true })).status, 404);
    assert.equal((await u.client.post("/api/posts/abc/react", { isLike: true })).status, 404);
  });

  test("parallel likes from one user count only once", async () => {
    const author = await freshUser("rpa");
    const voter = await freshUser("rpv");
    const post = await createPost(author, { content: "race likes" });
    await Promise.all(Array.from({ length: 8 }, () => voter.client.post(`/api/posts/${post.id}/react`, { isLike: true })));
    const detail = await (await new Client().get(`/api/posts/${post.id}`)).json();
    assert.ok(detail.likes <= 1, `likes=${detail.likes} after parallel likes from one user`);
    assert.ok((await karmaOf(author.username)) <= 1, "author karma inflated");
  });
});

describe("content: saving posts", () => {
  test("unsaving a post that was never saved is idempotent", async () => {
    const u = await freshUser("uns");
    const post = await createPost(u, { content: "never saved" });
    const res = await u.client.delete(`/api/posts/${post.id}/save`);
    await expectStatus(res, 200);
    assert.deepEqual(await res.json(), { saved: false });
  });

  test("saving with an invalid id answers 404", async () => {
    const u = await freshUser("savnan");
    assert.equal((await u.client.post("/api/posts/abc/save")).status, 404);
    assert.equal((await u.client.delete("/api/posts/abc/save")).status, 404);
  });

  test("a saved post that gets deleted disappears from the saved list", async () => {
    const author = await freshUser("savdel");
    const saver = await freshUser("savdels");
    const post = await createPost(author, { content: "saved then deleted" });
    await expectStatus(await saver.client.post(`/api/posts/${post.id}/save`), 200);
    assert.equal((await author.client.delete(`/api/posts/${post.id}`)).status, 204);
    const saved = await (await saver.client.get(`/api/users/${saver.username}/saved`)).json();
    assert.ok(!saved.some((p: any) => p.id === post.id));
  });
});

describe("content: comments", () => {
  test("a comment is created and shows up on the post, the comments endpoint, the profile and the count", async () => {
    const author = await freshUser("cmau");
    const commenter = await freshUser("cmc");
    const post = await createPost(author, { content: "comment target" });
    const text = `hello ${RUN_ID} <b>bold</b>`;
    const res = await commenter.client.post("/api/comments", { content: text, postId: post.id });
    await expectStatus(res, 201);
    const comment = await res.json();
    assert.equal(comment.authorId, commenter.id);
    assert.equal(comment.postId, post.id);
    assert.equal(comment.content, text);

    const detail = await (await new Client().get(`/api/posts/${post.id}`)).json();
    const inDetail = detail.comments.find((c: any) => c.id === comment.id);
    assert.equal(inDetail.author.username, commenter.username);
    assert.equal(inDetail.author.email, undefined);
    assert.equal(inDetail.likes, 0);

    const list = await (await new Client().get(`/api/posts/${post.id}/comments`)).json();
    assert.ok(list.some((c: any) => c.id === comment.id));

    const profile = await (await new Client().get(`/api/users/${commenter.username}/comments`)).json();
    assert.deepEqual(profile.find((c: any) => c.id === comment.id)?.post, { id: post.id, title: post.title });

    const feed = await (await new Client().get(`/api/users/${author.username}/posts`)).json();
    assert.equal(feed.find((p: any) => p.id === post.id).commentCount, 1);
  });

  test("invalid comment bodies are rejected with VALIDATION_ERROR", async () => {
    const u = await freshUser("cmv");
    const post = await createPost(u, { content: "validation" });
    for (const body of [
      {},
      { content: "", postId: post.id },
      { content: "   ", postId: post.id },
      { content: "x".repeat(10_001), postId: post.id },
      { content: 123, postId: post.id },
      { content: { $gt: "" }, postId: post.id },
      { content: "ok", postId: String(post.id) },
      { content: "ok", postId: -1 },
      { content: "ok", postId: 0 },
      { content: "ok", postId: 1.5 },
      { content: "ok", postId: null },
    ]) {
      const res = await u.client.post("/api/comments", body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
      assert.equal((await res.json()).code, "VALIDATION_ERROR");
    }
  });

  test("a comment of exactly 10000 characters is accepted", async () => {
    const u = await freshUser("cm10k");
    const post = await createPost(u, { content: "max length" });
    await expectStatus(await u.client.post("/api/comments", { content: "y".repeat(10_000), postId: post.id }), 201);
  });

  test("privileged fields in a comment body are ignored", async () => {
    const u = await freshUser("cmma");
    const post = await createPost(u, { content: "mass comment" });
    const res = await u.client.post("/api/comments", { content: "mass", postId: post.id, authorId: 1, karma: 500, id: 1, createdAt: "2000-01-01" });
    await expectStatus(res, 201);
    const c = await res.json();
    assert.equal(c.authorId, u.id);
    assert.equal(c.karma, 0);
    assert.notEqual(c.id, 1);
  });

  test("commenting on a post that does not exist is rejected", async () => {
    const u = await freshUser("cm404");
    const res = await u.client.post("/api/comments", { content: `orphan ${RUN_ID}`, postId: 999999999 });
    assert.equal(res.status, 404);
  });

  test("commenting on a deleted post is rejected", async () => {
    const u = await freshUser("cmdel");
    const post = await createPost(u, { content: "will vanish" });
    assert.equal((await u.client.delete(`/api/posts/${post.id}`)).status, 204);
    assert.equal((await u.client.post("/api/comments", { content: "late", postId: post.id })).status, 404);
  });

  test("a null byte in a comment is rejected without a server error", async () => {
    const u = await freshUser("cmnul");
    const post = await createPost(u, { content: "nul comment" });
    await assertClientError(await u.client.post("/api/comments", { content: "a\u0000b", postId: post.id }));
  });

  test("XSS payload in a comment comes back verbatim as JSON", async () => {
    const u = await freshUser("cmx");
    const post = await createPost(u, { content: "xss comment" });
    const payload = `<img src=x onerror=alert(1)><script>alert(2)</script>`;
    await expectStatus(await u.client.post("/api/comments", { content: payload, postId: post.id }), 201);
    const res = await new Client().get(`/api/posts/${post.id}/comments`);
    assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
    assert.ok((await res.json()).some((c: any) => c.content === payload));
  });

  test("comments need a login and a CSRF token", async () => {
    const u = await freshUser("cmauth");
    const post = await createPost(u, { content: "auth comment" });
    const anon = new Client();
    await anon.refreshCsrf();
    assert.equal((await anon.post("/api/comments", { content: "anon", postId: post.id })).status, 401);
    assert.equal((await u.client.post("/api/comments", { content: "no csrf", postId: post.id }, { csrf: false })).status, 403);
  });

  test("only the author or an admin can delete a comment", async () => {
    const author = await freshUser("cdau");
    const other = await freshUser("cdot");
    const post = await createPost(author, { content: "comment delete" });
    const own = await (await author.client.post("/api/comments", { content: "own", postId: post.id })).json();
    const second = await (await author.client.post("/api/comments", { content: "admin removes", postId: post.id })).json();

    assert.equal((await other.client.delete(`/api/comments/${own.id}`)).status, 403);
    const anon = new Client();
    await anon.refreshCsrf();
    assert.equal((await anon.delete(`/api/comments/${own.id}`)).status, 401);
    assert.equal((await author.client.delete(`/api/comments/${own.id}`)).status, 204);
    assert.equal((await admin.delete(`/api/comments/${second.id}`)).status, 204);
    const list = await (await new Client().get(`/api/posts/${post.id}/comments`)).json();
    assert.equal(list.length, 0);
  });

  test("deleting a non-existent or non-numeric comment id answers 404", async () => {
    const u = await freshUser("cd404");
    assert.equal((await u.client.delete("/api/comments/99999999")).status, 404);
    assert.equal((await u.client.delete("/api/comments/abc")).status, 404);
  });

  test("comment likes toggle and update the author's karma; deleting the comment takes the karma back", async () => {
    const author = await freshUser("clau");
    const liker = await freshUser("clli");
    const post = await createPost(author, { content: "comment likes" });
    const c = await (await author.client.post("/api/comments", { content: "like me", postId: post.id })).json();

    let res = await liker.client.post(`/api/comments/${c.id}/like`);
    await expectStatus(res, 200);
    assert.deepEqual(await res.json(), { likes: 1, isLiked: true });
    assert.equal(await karmaOf(author.username), 1);

    res = await liker.client.post(`/api/comments/${c.id}/like`);
    assert.deepEqual(await res.json(), { likes: 0, isLiked: false });
    assert.equal(await karmaOf(author.username), 0);

    await liker.client.post(`/api/comments/${c.id}/like`);
    assert.equal((await author.client.delete(`/api/comments/${c.id}`)).status, 204);
    assert.equal(await karmaOf(author.username), 0);
  });

  test("liking a non-existent or non-numeric comment answers 404", async () => {
    const u = await freshUser("cl404");
    assert.equal((await u.client.post("/api/comments/99999999/like")).status, 404);
    assert.equal((await u.client.post("/api/comments/abc/like")).status, 404);
  });

  test("parallel comment likes from one user count only once", async () => {
    const author = await freshUser("clpa");
    const liker = await freshUser("clpl");
    const post = await createPost(author, { content: "race comment likes" });
    const c = await (await author.client.post("/api/comments", { content: "race", postId: post.id })).json();
    await Promise.all(Array.from({ length: 8 }, () => liker.client.post(`/api/comments/${c.id}/like`)));
    const detail = await (await new Client().get(`/api/posts/${post.id}`)).json();
    const likes = detail.comments.find((x: any) => x.id === c.id).likes;
    assert.ok(likes <= 1, `comment likes=${likes} after parallel likes from one user`);
    assert.ok((await karmaOf(author.username)) <= 1, "author karma inflated");
  });

  test("all comments of a post can be retrieved (no silent cap at 100)", async () => {
    const u = await freshUser("cm101");
    const post = await createPost(u, { content: "many comments" });
    for (let i = 0; i < 101; i += 20) {
      await Promise.all(
        Array.from({ length: Math.min(20, 101 - i) }, (_, j) => u.client.post("/api/comments", { content: `n${i + j}`, postId: post.id })),
      );
    }
    const detail = await (await new Client().get(`/api/posts/${post.id}`)).json();
    const list = await (await new Client().get(`/api/posts/${post.id}/comments`)).json();
    assert.equal(list.length, 101, `comments endpoint returned ${list.length} of 101`);
    assert.equal(detail.comments.length, 101, `detail returned ${detail.comments.length} of 101`);
  });
});

describe("content: reports", () => {
  test("a user can report a post and a comment", async () => {
    const author = await freshUser("rpau");
    const reporter = await freshUser("rprp");
    const post = await createPost(author, { content: "reportable" });
    const c = await (await author.client.post("/api/comments", { content: "reportable comment", postId: post.id })).json();
    let res = await reporter.client.post("/api/reports", { reason: "spam", postId: post.id });
    await expectStatus(res, 201);
    const r = await res.json();
    assert.equal(r.reporterId, reporter.id);
    assert.equal(r.postId, post.id);
    assert.equal(r.status, "pending");
    res = await reporter.client.post("/api/reports", { reason: "rude", commentId: c.id });
    await expectStatus(res, 201);
    assert.equal((await res.json()).commentId, c.id);
  });

  test("a report without any target is rejected", async () => {
    const u = await freshUser("rpnt");
    await assertClientError(await u.client.post("/api/reports", { reason: `no target ${RUN_ID}` }));
  });

  test("a report naming several targets at once is rejected", async () => {
    const a = await freshUser("rpmt");
    const p1 = await createPost(a, { content: "target one" });
    const b = await freshUser("rpmt");
    const p2 = await createPost(b, { content: "target two" });
    const reporter = await freshUser("rpmr");
    await assertClientError(await reporter.client.post("/api/reports", { reason: "two", postId: p1.id, discussionId: p2.id }));
  });

  test("reporting a post or comment that does not exist is rejected", async () => {
    const u = await freshUser("rp404");
    assert.equal((await u.client.post("/api/reports", { reason: "ghost", postId: 999999999 })).status, 404);
    assert.equal((await u.client.post("/api/reports", { reason: "ghost", commentId: 999999999 })).status, 404);
  });

  test("users cannot report their own post", async () => {
    const u = await freshUser("rpself");
    const post = await createPost(u, { content: "self report" });
    await assertClientError(await u.client.post("/api/reports", { reason: "me", postId: post.id }));
  });

  test("reporting the same post twice does not create a second open report", async () => {
    const author = await freshUser("rpda");
    const reporter = await freshUser("rpdr");
    const post = await createPost(author, { content: "double report" });
    await expectStatus(await reporter.client.post("/api/reports", { reason: "first", postId: post.id }), 201);
    const second = await reporter.client.post("/api/reports", { reason: "second", postId: post.id });
    assert.ok([400, 409].includes(second.status) || (second.status === 200), `duplicate report got ${second.status}`);
  });

  for (const [label, reason] of [
    ["empty", ""],
    ["whitespace-only", "    "],
    ["100k characters", "r".repeat(100_000)],
    ["a number", 42],
    ["an object", { $ne: "" }],
  ] as const) {
    test(`a report reason that is ${label} is rejected`, async () => {
      const author = await freshUser("rpva");
      const post = await createPost(author, { content: "reason validation" });
      const u = await freshUser("rpvr");
      await assertClientError(await u.client.post("/api/reports", { reason, postId: post.id }), label);
    });
  }

  test("report target ids must be numbers", async () => {
    const u = await freshUser("rpid");
    for (const postId of ["1", { $gt: 0 }, [1]]) {
      await assertClientError(await u.client.post("/api/reports", { reason: "ok", postId }), JSON.stringify(postId));
    }
  });

  test("reports need a login and a CSRF token", async () => {
    const anon = new Client();
    await anon.refreshCsrf();
    assert.equal((await anon.post("/api/reports", { reason: "anon", postId: 1 })).status, 401);
    const u = await freshUser("rpcs");
    assert.equal((await u.client.post("/api/reports", { reason: "x", postId: 1 }, { csrf: false })).status, 403);
  });

  test("only staff can list and change reports", async () => {
    const u = await freshUser("rpls");
    const anon = new Client();
    await anon.refreshCsrf();
    // Staff-only routes answer non-staff exactly like an unknown route (404), see EXP-BUNDLE-14
    assert.equal((await anon.get("/api/reports")).status, 404);
    assert.equal((await u.client.get("/api/reports")).status, 404);
    assert.equal((await u.client.patch("/api/reports/1", { status: "rejected" })).status, 404);
    assert.equal((await anon.patch("/api/reports/1", { status: "rejected" })).status, 404);
    const list = await admin.get("/api/reports");
    await expectStatus(list, 200);
    assert.ok(Array.isArray(await list.json()));
  });

  test("resolving a post report deletes the post; rejecting keeps it", async () => {
    const a1 = await freshUser("rsa");
    const a2 = await freshUser("rsb");
    const reporter = await freshUser("rsr");
    const doomed = await createPost(a1, { content: "will be removed by moderation" });
    const kept = await createPost(a2, { content: "report will be rejected" });
    const r1 = await (await reporter.client.post("/api/reports", { reason: "bad", postId: doomed.id })).json();
    const r2 = await (await reporter.client.post("/api/reports", { reason: "meh", postId: kept.id })).json();

    const res = await admin.patch(`/api/reports/${r1.id}`, { status: "resolved" });
    await expectStatus(res, 200);
    assert.equal((await res.json()).status, "resolved");
    assert.equal((await new Client().get(`/api/posts/${doomed.id}`)).status, 404);

    await expectStatus(await admin.patch(`/api/reports/${r2.id}`, { status: "rejected" }), 200);
    assert.equal((await new Client().get(`/api/posts/${kept.id}`)).status, 200);
  });

  test("changing a report validates status and id", async () => {
    assert.equal((await admin.patch("/api/reports/99999999", { status: "rejected" })).status, 404);
    assert.equal((await admin.patch("/api/reports/abc", { status: "rejected" })).status, 404);
    assert.equal((await admin.patch("/api/reports/1", { status: "deleted" })).status, 400);
    assert.equal((await admin.patch("/api/reports/1", { status: { $ne: 1 } })).status, 400);
  });
});

describe("content: community feed", () => {
  test("the community feed needs a login", async () => {
    assert.equal((await new Client().get("/api/feed/communities")).status, 401);
  });

  test("members see posts of their (private) communities, outsiders do not", async () => {
    const mine = await (await member.client.get("/api/feed/communities")).json();
    const p = mine.find((x: any) => x.id === privPost.id);
    assert.ok(p, "member should see the private post in the community feed");
    assert.equal(p.author.email, undefined);
    const theirs = await (await outsider.client.get("/api/feed/communities")).json();
    assert.ok(!theirs.some((x: any) => x.id === privPost.id));
  });

  test("the community feed honours limit", async () => {
    const res = await member.client.get("/api/feed/communities?limit=1");
    assert.equal(res.status, 200);
    assert.ok((await res.json()).length <= 1);
  });

  test("leaving a community removes its posts from the feed", async () => {
    const u = await freshUser("fdl");
    await expectStatus(await u.client.post(`/api/communities/${pub.id}/join`), 200);
    const post = await createPost(u, { content: "leave feed", category: "news", communityId: String(pub.id) });
    assert.ok((await (await u.client.get("/api/feed/communities")).json()).some((x: any) => x.id === post.id));
    await expectStatus(await u.client.post(`/api/communities/${pub.id}/leave`), 200);
    assert.ok(!(await (await u.client.get("/api/feed/communities")).json()).some((x: any) => x.id === post.id));
  });
});

describe("content: private community posts stay private", () => {
  const readers = () => [
    ["anonymous", new Client()],
    ["outsider", outsider.client],
  ] as const;

  test("post detail is not readable by non-members", async () => {
    for (const [who, c] of readers()) {
      const res = await c.get(`/api/posts/${privPost.id}`);
      assert.ok([403, 404].includes(res.status), `${who} read the private post: ${res.status}`);
    }
    assert.equal((await member.client.get(`/api/posts/${privPost.id}`)).status, 200, "members can read it");
  });

  test("the communityId filter does not list private posts to non-members", async () => {
    for (const [who, c] of readers()) {
      const res = await c.get(`/api/posts?communityId=${priv.id}`);
      const text = await res.text();
      assert.ok(!text.includes(PRIV_MARKER), `${who} listed the private community's posts`);
    }
  });

  test("the comments endpoint does not show private comments to non-members", async () => {
    for (const [who, c] of readers()) {
      const text = await (await c.get(`/api/posts/${privPost.id}/comments`)).text();
      assert.ok(!text.includes(PRIV_MARKER), `${who} read the private comments`);
    }
  });

  test("the author's profile post list hides private posts from non-members", async () => {
    for (const [who, c] of readers()) {
      const text = await (await c.get(`/api/users/${member.username}/posts`)).text();
      assert.ok(!text.includes(PRIV_MARKER), `${who} saw the private post on the profile`);
    }
  });

  test("the author's profile comment list hides private comments from non-members", async () => {
    for (const [who, c] of readers()) {
      const text = await (await c.get(`/api/users/${member.username}/comments`)).text();
      assert.ok(!text.includes(PRIV_MARKER), `${who} saw the private comment on the profile`);
    }
  });

  test("the liked-posts list hides private posts from non-members", async () => {
    for (const [who, c] of readers()) {
      const text = await (await c.get(`/api/users/${member.username}/liked`)).text();
      assert.ok(!text.includes(PRIV_MARKER), `${who} saw the liked private post`);
    }
  });

  test("non-members cannot comment on, react to, or save a private post", async () => {
    const c = outsider.client;
    const comment = await c.post("/api/comments", { content: "outsider comment", postId: privPost.id });
    assert.ok([403, 404].includes(comment.status), `comment: ${comment.status}`);
    const react = await c.post(`/api/posts/${privPost.id}/react`, { isLike: false });
    assert.ok([403, 404].includes(react.status), `react: ${react.status}`);
    const save = await c.post(`/api/posts/${privPost.id}/save`);
    assert.ok([403, 404].includes(save.status), `save: ${save.status}`);
    const saved = await (await c.get(`/api/users/${outsider.username}/saved`)).text();
    assert.ok(!saved.includes(PRIV_MARKER), "saved list exposes the private post");
  });

  test("non-members cannot like a private comment", async () => {
    const res = await outsider.client.post(`/api/comments/${privCommentId}/like`);
    assert.ok([403, 404].includes(res.status), `comment like: ${res.status}`);
  });
});

describe("content: shadow-banned authors", () => {
  let shadow: TestUser;
  let hostPost: any;
  let shadowPost: any;

  before(async () => {
    shadow = await freshUser("shd");
    const host = await freshUser("shh");
    hostPost = await createPost(host, { content: "host for shadow comment" });
    shadowPost = await createPost(shadow, { content: `shadow post ${RUN_ID}` });
    await expectStatus(await shadow.client.post("/api/comments", { content: `shadow comment ${RUN_ID}`, postId: hostPost.id }), 201);
    const res = await admin.post("/api/admin/bulk/users", { user_ids: [shadow.id], action: "shadow", reason: "e2e content", duration_hours: 1 });
    await expectStatus(res, 200);
  });

  test("the post detail hides the shadow-banned user's comment from others", async () => {
    const detail = await (await new Client().get(`/api/posts/${hostPost.id}`)).json();
    assert.ok(!detail.comments.some((c: any) => c.content === `shadow comment ${RUN_ID}`));
  });

  test("the comments endpoint hides the shadow-banned user's comment from others", async () => {
    const list = await (await new Client().get(`/api/posts/${hostPost.id}/comments`)).json();
    assert.ok(!list.some((c: any) => c.content === `shadow comment ${RUN_ID}`), "shadow-banned comment visible via /comments");
  });

  test("the global feed hides the shadow-banned user's post", async () => {
    const feed = await (await new Client().get("/api/posts?limit=100")).json();
    assert.ok(!feed.some((p: any) => p.id === shadowPost.id));
  });

  test("the shadow-banned user's profile post list is hidden from others", async () => {
    const list = await (await new Client().get(`/api/users/${shadow.username}/posts`)).json();
    assert.ok(!list.some((p: any) => p.id === shadowPost.id), "shadow-banned post visible on profile");
  });
});

describe("content: user search", () => {
  let target: TestUser;
  let searcher: TestUser;

  before(async () => {
    target = await freshUser("srt");
    searcher = await freshUser("srs");
  });

  for (const path of ["/api/search", "/api/users/search"]) {
    test(`${path} needs a login`, async () => {
      assert.equal((await new Client().get(`${path}?q=a`)).status, 401);
    });

    test(`${path} finds a user by name and returns an empty list for an empty query`, async () => {
      const res = await searcher.client.get(`${path}?q=${encodeURIComponent(target.username)}`);
      await expectStatus(res, 200);
      assert.deepEqual((await res.json()).map((u: any) => u.username), [target.username]);
      assert.deepEqual(await (await searcher.client.get(`${path}?q=`)).json(), []);
    });

    test(`${path} does not expose other users' emails or moderation fields`, async () => {
      const [hit] = await (await searcher.client.get(`${path}?q=${encodeURIComponent(target.username)}`)).json();
      assert.equal(hit.password, undefined);
      assert.equal(hit.email, undefined, "other users' email addresses are exposed");
      assert.equal(hit.isShadowBanned, undefined, "shadow-ban state is exposed");
      assert.equal(hit.adminGroupId, undefined);
    });
  }

  test("SQL injection in the search query is harmless", async () => {
    for (const q of ["' OR 1=1 --", "'; DROP TABLE users; --", "\\", "%' --"]) {
      const res = await searcher.client.get(`/api/search?q=${encodeURIComponent(q)}`);
      assert.equal(res.status, 200, q);
      const body = await res.json();
      assert.ok(Array.isArray(body));
      assert.ok(body.every((u: any) => u.username.includes(q.replaceAll("%", ""))), `${q} matched unrelated users`);
    }
  });

  test("LIKE wildcards are matched literally, not as 'match everything'", async () => {
    const res = await searcher.client.get(`/api/search?q=${encodeURIComponent("%")}`);
    assert.equal(res.status, 200);
    const names = (await res.json()).map((u: any) => u.username);
    assert.deepEqual(names, [], "'%' returned arbitrary users");
  });

  test("odd search inputs do not cause a server error", async () => {
    for (const qs of ["q=%00", "q=" + "a".repeat(5000), "q[]=a&q[]=b", "q[$ne]=x", "q=%F0%9F%98%80"]) {
      const res = await searcher.client.get(`/api/search?${qs}`);
      assert.ok(res.status < 500, `${qs.slice(0, 20)} -> ${res.status}`);
    }
  });
});

describe("content: media uploads", () => {
  const upload = async (tag: string, file: { data: Buffer | string; type: string; name: string }, fields: Record<string, string> = {}) => {
    const u = await freshUser(tag);
    return postForm(u.client, { content: `media ${tag} ${RUN_ID}`, category: "entertainment", ...fields }, [file]);
  };

  const served = async (mediaUrl: string) => {
    const res = await new Client().get(`/uploads/${mediaUrl}`);
    assert.equal(res.status, 200);
    return { res, buf: Buffer.from(await res.arrayBuffer()) };
  };

  for (const [label, data, type, mediaType] of [
    ["GIF", GIF_1X1, "image/gif", "image"],
    ["MP4", MP4_STUB, "video/mp4", "video"],
    ["WebM", WEBM_STUB, "video/webm", "video"],
  ] as const) {
    test(`${label} upload is stored and served with its content type and nosniff`, async () => {
      const res = await upload(label.toLowerCase(), { data, type, name: `clip.${label.toLowerCase()}` });
      await expectStatus(res, 201);
      const post = await res.json();
      assert.equal(post.mediaType, mediaType);
      const { res: file } = await served(post.mediaUrl);
      assert.equal(file.headers.get("content-type")?.split(";")[0], type);
      assert.equal(file.headers.get("x-content-type-options"), "nosniff");
    });
  }

  test("the stored file name is generated by the server (double extension, traversal and HTML in the name)", async () => {
    for (const name of ["evil.php.png", "../../../evil.png", "<svg onload=alert(1)>.png", "a\r\nX-Injected: 1.png"]) {
      const res = await upload("fname", { data: PNG_1X1, type: "image/png", name });
      await expectStatus(res, 201);
      const post = await res.json();
      assert.match(post.mediaUrl, /^\d+-\d+\.png$/, `${name} -> ${post.mediaUrl}`);
    }
  });

  test("an uploaded JPEG is served with a content type that matches its bytes", async () => {
    const jpeg = await makeImage("jpeg", 16, 16);
    const res = await upload("jpgct", { data: jpeg, type: "image/jpeg", name: "photo.jpg" });
    await expectStatus(res, 201);
    const { res: file, buf } = await served((await res.json()).mediaUrl);
    assert.equal(file.headers.get("content-type"), sniff(buf), "Content-Type header does not match the stored format");
  });

  test("EXIF metadata is stripped from post images", async () => {
    const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#808080" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: `exif-secret-${RUN_ID}`, Artist: `exif-secret-${RUN_ID}` } })
      .toBuffer();
    assert.ok(jpeg.includes(`exif-secret-${RUN_ID}`), "test image must contain the marker");
    const res = await upload("exif", { data: jpeg, type: "image/jpeg", name: "exif.jpg" });
    await expectStatus(res, 201);
    const { buf } = await served((await res.json()).mediaUrl);
    assert.ok(!buf.includes(`exif-secret-${RUN_ID}`), "EXIF data still present");
  });

  test("a PNG/HTML polyglot is either rejected or served without the script", async () => {
    const poly = Buffer.concat([PNG_1X1, Buffer.from("<html><script>alert(1)</script></html>")]);
    const res = await upload("poly", { data: poly, type: "image/png", name: "poly.png" });
    if (res.status === 201) {
      const { res: file, buf } = await served((await res.json()).mediaUrl);
      assert.ok(!/text\/html/.test(file.headers.get("content-type") ?? ""));
      assert.equal(file.headers.get("x-content-type-options"), "nosniff");
      assert.ok(!buf.includes("<script>"), "script survived sanitization");
    } else {
      await assertClientError(res);
    }
  });

  test("a GIF/HTML polyglot is never served as HTML", async () => {
    const poly = Buffer.concat([Buffer.from("GIF89a"), Buffer.from("<html><script>alert(1)</script></html>")]);
    const res = await upload("gpoly", { data: poly, type: "image/gif", name: "poly.gif" });
    if (res.status === 201) {
      const { res: file } = await served((await res.json()).mediaUrl);
      assert.equal(file.headers.get("content-type"), "image/gif");
      assert.equal(file.headers.get("x-content-type-options"), "nosniff");
    } else {
      await assertClientError(res);
    }
  });

  test("a file with a PNG signature but no decodable image is rejected", async () => {
    // Passes the magic-byte check; sanitizeImage cannot decode it and must not store it unprocessed.
    const fake = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("<html><script>alert(1)</script></html>")]);
    const res = await upload("pngsig", { data: fake, type: "image/png", name: "fake.png" });
    await assertClientError(res);
  });

  test("HTML disguised as a GIF or MP4 (wrong magic bytes) is rejected", async () => {
    for (const type of ["image/gif", "video/mp4", "video/webm", "image/jpeg"]) {
      const res = await upload("spoof", { data: "<html><script>alert(1)</script></html>", type, name: "x.bin" });
      assert.equal(res.status, 400, type);
    }
  });

  test("an SVG with a script is not accepted as media and the post is not published silently without it", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>`;
    const res = await upload("svg", { data: svg, type: "image/svg+xml", name: "x.svg" });
    assert.equal(res.status, 400, `SVG upload answered ${res.status}`);
  });

  test("the client cannot override the stored mediaType", async () => {
    const res = await upload("mtype", { data: PNG_1X1, type: "image/png", name: "p.png" }, { mediaType: "video" });
    await expectStatus(res, 201);
    assert.equal((await res.json()).mediaType, "image");
  });

  test("an image above 10 MB is rejected with 400", async () => {
    const big = Buffer.concat([PNG_1X1, Buffer.alloc(11 * 1024 * 1024)]);
    const res = await upload("big", { data: big, type: "image/png", name: "big.png" });
    assert.equal(res.status, 400);
  });

  test("a file above the 50 MB upload limit answers 413, not 500", async () => {
    const huge = Buffer.concat([MP4_STUB, Buffer.alloc(51 * 1024 * 1024)]);
    const res = await upload("huge", { data: huge, type: "video/mp4", name: "huge.mp4" });
    await assertClientError(res);
    assert.equal(res.status, 413);
  });

  // A truncated multipart body used to crash the whole process (multer 1.4.5, CONTENT-1).
  for (const [label, body] of [
    ["a file part cut off before its closing boundary", '--XYZ\r\nContent-Disposition: form-data; name="media"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n\x89PNG'],
    ["no boundary at all", "garbage without any boundary"],
  ] as const) {
    test(`a malformed multipart body (${label}) answers 4xx and the server stays up`, async () => {
      const u = await freshUser("mpbad");
      const res = await fetch(`${BASE_URL}/api/posts`, {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=XYZ",
          cookie: [...u.client.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
          "x-csrf-token": u.client.csrfToken ?? "",
          "x-forwarded-for": u.client.ip,
        },
        body,
      });
      const text = await res.text();
      await new Promise((r) => setTimeout(r, 500));
      const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
      assert.equal(health?.status, 200, "server died after a malformed multipart request");
      assert.ok(res.status >= 400 && res.status < 500, `expected 4xx, got ${res.status}: ${text.slice(0, 120)}`);
    });
  }

});
