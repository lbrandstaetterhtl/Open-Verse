// Input robustness of every route that takes a body or query parameters.
// Every malformed input must be answered with 2xx (ignored / sanitised) or 4xx: never 5xx, never a hang,
// never a stack trace, SQL text, server path or password hash in the answer.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client, newUser, expectStatus, ADMIN_USER, ADMIN_PASSWORD, RUN_ID, freshIp } from "./client";
import { apiRoutes } from "../security/routes";
import {
  send, withIp, problem, failMessage, runPayloads, fieldPayloads, withProtoKey, idValues, describeValue, json, UserPool,
  SHAPES, WRONG_TYPES, HOSTILE_STRINGS, FIELD_VALUES, HUGE, SQLI, SQLI_STACKED, UNICODE, NUL, CRLF, TRAVERSAL, XSS,
  type Payload, type Sent,
} from "./helpers/input";

type TestUser = Awaited<ReturnType<typeof newUser>>;

const owner = new Client();
let alice: TestUser, bob: TestUser;
const ctx = {} as {
  alicePost: number; commentId: number; cid: number; communityReport: number; report: number; ticket: number;
  ticketComment: number; theme: number; notification: number; ban: number; rule: number; group: number;
  prefs: TestUser; banVictim: TestUser; groupVictim: TestUser; userVictim: TestUser; banTarget: TestUser;
  inviteTarget: TestUser; modTarget: TestUser; joiner: TestUser; requester: TestUser; followTarget: TestUser;
  profile: TestUser; password: TestUser & { current: string }; ownerId: number; reactPost: number;
};
const createdBans: number[] = [];
const createdRules: number[] = [];

/** Same session, new IP every `every` requests, so the per-IP API limits (1000 / 200 per 15 min) never interfere. */
function rotating(client: () => Client, every = 150): () => Client {
  let n = 0;
  let current: Client | undefined;
  return () => {
    if (!current || n++ % every === 0) current = withIp(client());
    return current;
  };
}
const asOwner = rotating(() => owner);
const asAlice = rotating(() => alice.client);
const asBob = rotating(() => bob.client);
async function anon(): Promise<Client> {
  const c = new Client(freshIp());
  await c.refreshCsrf();
  return c;
}

const strings = (values: unknown[]) => values.filter((v) => typeof v === "string") as string[];
const nonStrings = (values: unknown[]) => values.filter((v) => typeof v !== "string");
/** For unique columns (username, email, names): non-strings as they are, strings with a RUN_ID suffix. */
const uniqueValues = (suffix: string) => [...nonStrings(WRONG_TYPES), ...["", "   ", ...HOSTILE_STRINGS].map((s) => `${s}${suffix}`)];
const ok = (r: Sent) => r.status >= 200 && r.status < 300;

let seq = 0;
const uniq = () => `${RUN_ID}${(seq++).toString(36)}`;

before(async () => {
  assert.ok(ADMIN_USER && ADMIN_PASSWORD, "E2E_ADMIN_USER and E2E_ADMIN_PASSWORD must be set");
  await expectStatus(await owner.login(ADMIN_USER, ADMIN_PASSWORD), 200);
  ctx.ownerId = (await (await owner.get("/api/user")).json()).id;
  [alice, bob] = [await newUser("fzalice"), await newUser("fzbob")];
  await expectStatus(await alice.client.post(`/api/follow/${bob.id}`), 200);
  await expectStatus(await bob.client.post(`/api/follow/${alice.id}`), 200);

  const post = await alice.client.post("/api/posts", { title: `Fuzz target ${RUN_ID}`, content: "Target of the input fuzz suite", category: "discussion" });
  await expectStatus(post, 201);
  ctx.alicePost = (await post.json()).id;
  const comment = await bob.client.post("/api/comments", { content: "fuzz setup comment", postId: ctx.alicePost });
  await expectStatus(comment, 201);
  ctx.commentId = (await comment.json()).id;

  const community = await owner.post("/api/communities", { name: `Fuzz ${RUN_ID}`, description: "input fuzz" });
  await expectStatus(community, 201);
  ctx.cid = (await community.json()).id;
  await expectStatus(await alice.client.post(`/api/communities/${ctx.cid}/join`), 200);
  await expectStatus(await bob.client.post(`/api/communities/${ctx.cid}/join`), 200);
  const cpost = await bob.client.post("/api/posts", { content: "fuzz community post", category: "discussion", communityId: String(ctx.cid) });
  await expectStatus(cpost, 201);
  const creport = await alice.client.post("/api/reports", { reason: "fuzz community report", postId: (await cpost.json()).id });
  await expectStatus(creport, 201);
  ctx.communityReport = (await creport.json()).id;
  const report = await bob.client.post("/api/reports", { reason: "fuzz report", postId: ctx.alicePost });
  await expectStatus(report, 201);
  ctx.report = (await report.json()).id;

  const ticket = await alice.client.post("/api/tickets", {
    title: `Fuzz ticket ${RUN_ID}`, description: "Ticket used by the input fuzz suite, long enough for the validation.", type: "other", priority: "low",
  });
  await expectStatus(ticket, 201);
  ctx.ticket = (await ticket.json()).ticket.id;
  const tcomment = await alice.client.post(`/api/tickets/${ctx.ticket}/comments`, { content: `fuzz ticket comment ${RUN_ID}` });
  await expectStatus(tcomment, 201);
  ctx.ticketComment = (await tcomment.json()).comments.find((c: any) => c.content === `fuzz ticket comment ${RUN_ID}`).id;

  const theme = await alice.client.post("/api/user/themes", { name: `FzPatch ${RUN_ID}`, colors: "{}" });
  await expectStatus(theme, 200);
  ctx.theme = (await theme.json()).id;
  const notes = await (await alice.client.get("/api/notifications")).json();
  ctx.notification = notes[0]?.id ?? 999999999;

  const users = ["fzprefs", "fzbanv", "fzgrpv", "fzusrv", "fzbant", "fzinvt", "fzmodt", "fzjoin", "fzreq", "fzfollow", "fzprof"];
  const made = await Promise.all(users.map((u) => newUser(u)));
  [ctx.prefs, ctx.banVictim, ctx.groupVictim, ctx.userVictim, ctx.banTarget, ctx.inviteTarget, ctx.modTarget, ctx.joiner, ctx.requester, ctx.followTarget, ctx.profile] = made;
  const reactAuthor = await newUser("fzreact");
  const rpost = await reactAuthor.client.post("/api/posts", { title: `React target ${RUN_ID}`, content: "Gets fuzzed reactions", category: "discussion" });
  await expectStatus(rpost, 201);
  ctx.reactPost = (await rpost.json()).id;
  const pw = await newUser("fzpw");
  ctx.password = { ...pw, current: pw.password };
  await expectStatus(await ctx.prefs.client.get("/api/notifications/preferences"), 200);

  const ban = await owner.post("/api/admin/bans", { ban_type: "account", user_id: ctx.banVictim.id, reason: "fuzz setup", duration_hours: 1 });
  await expectStatus(ban, 200);
  ctx.ban = (await ban.json()).id;
  createdBans.push(ctx.ban);
  const rule = await owner.post("/api/admin/auto-punishments/rules", {
    name: `fz rule ${RUN_ID}`, anomalyType: `fz_never_${RUN_ID}`, action: "warn", actionReason: "fuzz", isActive: 0,
  });
  await expectStatus(rule, 200);
  ctx.rule = (await rule.json()).id;
  createdRules.push(ctx.rule);
  const group = await owner.post("/api/admin/groups", { name: `fzg ${RUN_ID} setup`, permissions: "[]" });
  await expectStatus(group, 201);
  ctx.group = (await group.json()).id;
});

after(async () => {
  for (const id of createdBans) await owner.patch(`/api/admin/bans/${id}/revoke`, { reason: "fuzz cleanup" });
  for (const id of createdRules) await owner.delete(`/api/admin/auto-punishments/rules/${id}`);
  const groups = (await (await owner.get("/api/admin/groups")).json()) as any[];
  for (const g of groups.filter((g) => typeof g.name === "string" && g.name.includes(`fzg ${RUN_ID}`))) await owner.delete(`/api/admin/groups/${g.id}`);
  if (ctx.userVictim) await owner.patch(`/api/admin/users/${ctx.userVictim.id}`, { role: "user", isFrozen: 0, isShadowBanned: 0 });
  if (ctx.groupVictim) await owner.post("/api/admin/groups/assign", { userId: ctx.groupVictim.id, groupId: null });
});

// ---------------------------------------------------------------------------------------------
// Routes with a body

type BodySpec = {
  key: string; // "METHOD /api/path" exactly as tests/security/routes.ts lists it
  name?: string; // extra label when a route is tested from two roles
  url: () => string;
  actor: () => Client | Promise<Client>;
  base?: () => Record<string, unknown>;
  fields?: () => Record<string, unknown[]>;
  extras?: Record<string, unknown>; // mass-assignment fields, sent one at a time on top of the base body
  huge?: string[]; // text fields that must reject 200 000 characters
  concurrency?: number;
  baseline?: number[]; // status of the valid base body (default 200/201)
  onAnswer?: (r: Sent, p: Payload) => void;
};

const EXTRAS = {
  id: 1, createdAt: "not-a-date", updatedAt: "not-a-date", deletedAt: "2020-01-01", userId: 1, authorId: 1, creatorId: 1,
  reporterId: 1, createdBy: 1, role: "owner", isAdmin: true, karma: 99999, verified: 1,
};

const posters = new UserPool("fzp", 1); // 30 s post cooldown: one successful post per user
const commenters = new UserPool("fzc", 10);
const reporters = new UserPool("fzr", 10);
const pooled = (pool: UserPool) => ({
  actor: async () => (await pool.get()).client,
  onAnswer: (r: Sent) => ok(r) && pool.success(),
});
const BAD_DATES: unknown[] = ["abc", 1e20, {}, [1], { $gt: "" }, "2026-13-45", SQLI, "9999999-01-01", "Infinity"];

const BODY_SPECS: BodySpec[] = [
  {
    key: "POST /api/register", url: () => "/api/register", actor: anon,
    base: () => ({ username: `rg${uniq()}`, email: `rg${uniq()}@e2e.test`, password: "E2e-Passw0rd!" }),
    fields: () => ({ username: FIELD_VALUES, email: FIELD_VALUES, password: FIELD_VALUES }),
    huge: ["username", "email", "password"],
  },
  {
    key: "POST /api/login", url: () => "/api/login", actor: anon,
    base: () => ({ username: `nobody_${RUN_ID}`, password: "wrong-password" }), baseline: [401],
    fields: () => ({ username: FIELD_VALUES, password: FIELD_VALUES }), huge: ["username", "password"],
  },
  { key: "POST /api/logout", url: () => "/api/logout", actor: anon },
  {
    key: "PATCH /api/profile", url: () => "/api/profile", actor: () => withIp(ctx.profile.client), concurrency: 4,
    base: () => ({ bio: "fuzz" }),
    fields: () => ({
      displayName: FIELD_VALUES, bio: FIELD_VALUES, location: FIELD_VALUES, website: FIELD_VALUES, avatarUrl: FIELD_VALUES,
      coverUrl: FIELD_VALUES, profilePictureUrl: FIELD_VALUES, isPrivate: FIELD_VALUES,
      username: uniqueValues(`_${RUN_ID}`), email: uniqueValues(`${RUN_ID}@e2e.test`),
    }),
    extras: EXTRAS, huge: ["bio", "displayName", "location", "website"],
  },
  {
    key: "PATCH /api/profile/password", url: () => "/api/profile/password", actor: () => withIp(ctx.password.client),
    base: () => ({ currentPassword: ctx.password.current, newPassword: ctx.password.current }),
    fields: () => ({ currentPassword: FIELD_VALUES, newPassword: FIELD_VALUES }), huge: ["newPassword"],
    onAnswer: (r, p) => {
      const sent = (p.json as any)?.newPassword;
      if (ok(r) && typeof sent === "string") ctx.password.current = sent;
    },
  },
  {
    key: "POST /api/ai/generate", url: () => "/api/ai/generate", actor: asAlice, concurrency: 4,
    base: () => ({ topic: "fuzzing", language: "english" }),
    fields: () => ({ topic: WRONG_TYPES, language: WRONG_TYPES, imageContext: [{}, [], 1e20] }), huge: ["topic"],
  },
  {
    key: "POST /api/comments", url: () => "/api/comments", ...pooled(commenters),
    base: () => ({ content: "fuzz comment", postId: ctx.alicePost }),
    fields: () => ({ content: FIELD_VALUES, postId: idValues(ctx.alicePost) }), extras: EXTRAS, huge: ["content"],
  },
  { key: "POST /api/comments/:id/like", url: () => `/api/comments/${ctx.commentId}/like`, actor: asAlice },
  {
    key: "POST /api/communities", url: () => "/api/communities", actor: asOwner,
    base: () => ({ name: `Fz ${uniq()}` }),
    fields: () => ({
      name: [...nonStrings(WRONG_TYPES), `${UNICODE} ${uniq()}`, `${NUL} ${uniq()}`, `${SQLI} ${uniq()}`],
      description: [...WRONG_TYPES, NUL, UNICODE], imageUrl: WRONG_TYPES, allowedCategories: WRONG_TYPES, isPrivate: WRONG_TYPES,
    }),
    extras: EXTRAS, huge: ["name", "description"],
  },
  {
    key: "POST /api/communities/:id/ban", url: () => `/api/communities/${ctx.cid}/ban`, actor: asOwner,
    base: () => ({ userId: ctx.banTarget.id, reason: "fuzz" }),
    // Number(true) is 1: booleans would ban a user this suite did not create
    fields: () => ({ userId: idValues(ctx.banTarget.id).filter((v) => typeof v !== "boolean"), reason: FIELD_VALUES }),
  },
  {
    key: "POST /api/communities/:id/invite", url: () => `/api/communities/${ctx.cid}/invite`, actor: asOwner,
    base: () => ({ userId: ctx.inviteTarget.id }), fields: () => ({ userId: idValues(ctx.inviteTarget.id) }),
  },
  { key: "POST /api/communities/:id/join", url: () => `/api/communities/${ctx.cid}/join`, actor: () => withIp(ctx.joiner.client) },
  { key: "POST /api/communities/:id/leave", url: () => `/api/communities/${ctx.cid}/leave`, actor: () => withIp(ctx.joiner.client) },
  {
    key: "PATCH /api/communities/:id/members/:userId/role", url: () => `/api/communities/${ctx.cid}/members/${alice.id}/role`, actor: asOwner,
    base: () => ({ role: "member" }), fields: () => ({ role: FIELD_VALUES }),
  },
  {
    key: "POST /api/communities/:id/moderators", url: () => `/api/communities/${ctx.cid}/moderators`, actor: asOwner,
    base: () => ({ userId: ctx.modTarget.id }), fields: () => ({ userId: idValues(ctx.modTarget.id) }),
  },
  {
    key: "PATCH /api/communities/:id/reports/:reportId", url: () => `/api/communities/${ctx.cid}/reports/${ctx.communityReport}`, actor: asOwner,
    base: () => ({ status: "pending" }), fields: () => ({ status: FIELD_VALUES }),
  },
  { key: "POST /api/communities/:id/requests/:userId/approve", url: () => `/api/communities/${ctx.cid}/requests/${ctx.requester.id}/approve`, actor: asOwner },
  { key: "POST /api/communities/:id/requests/:userId/decline", url: () => `/api/communities/${ctx.cid}/requests/${ctx.requester.id}/decline`, actor: asOwner },
  ...["/api/follow/:userId", "/api/user/follow/:userId", "/api/users/follow/:userId"].map((path) => ({
    key: `POST ${path}`, url: () => path.replace(":userId", String(ctx.followTarget.id)), actor: asAlice,
  })),
  {
    key: "POST /api/messages", url: () => "/api/messages", actor: asAlice,
    base: () => ({ receiverId: bob.id, content: "fuzz message" }),
    fields: () => ({ receiverId: idValues(bob.id), content: FIELD_VALUES }), extras: EXTRAS, huge: ["content"],
  },
  { key: "POST /api/notifications/:id/read", url: () => `/api/notifications/${ctx.notification}/read`, actor: asAlice },
  { key: "POST /api/notifications/read-all", url: () => "/api/notifications/read-all", actor: asAlice },
  { key: "POST /api/notifications/seen", url: () => "/api/notifications/seen", actor: asAlice },
  {
    key: "PATCH /api/notifications/preferences", url: () => "/api/notifications/preferences", actor: () => withIp(ctx.prefs.client),
    base: () => ({ likePost: 1 }),
    fields: () => ({ likePost: FIELD_VALUES, browserNotifications: WRONG_TYPES, newFollower: WRONG_TYPES }),
    extras: EXTRAS,
  },
  {
    key: "POST /api/posts", url: () => "/api/posts", ...pooled(posters),
    base: () => ({ title: "fuzz post", content: "fuzz post content", category: "discussion" }),
    fields: () => ({ title: FIELD_VALUES, content: FIELD_VALUES, category: FIELD_VALUES, communityId: idValues(ctx.cid) }),
    huge: ["title", "content", "category"],
  },
  {
    // dislikes lower the author's karma (and karma < 0 locks the account), so the target is a throwaway author
    key: "POST /api/posts/:id/react", url: () => `/api/posts/${ctx.reactPost}/react`, actor: asBob,
    base: () => ({ isLike: true }), fields: () => ({ isLike: FIELD_VALUES }),
  },
  { key: "POST /api/posts/:id/save", url: () => `/api/posts/${ctx.alicePost}/save`, actor: asBob },
  ...["/api/profile-upload", "/api/user/profile-upload", "/api/users/profile-upload"].map((path) => ({
    key: `POST ${path}`, url: () => path, actor: asAlice,
  })),
  {
    key: "POST /api/reports", url: () => "/api/reports", ...pooled(reporters),
    base: () => ({ reason: "fuzz report", postId: ctx.alicePost }),
    fields: () => ({ reason: FIELD_VALUES, postId: idValues(ctx.alicePost), commentId: idValues(ctx.commentId), discussionId: idValues(ctx.alicePost) }),
    extras: EXTRAS, huge: ["reason"],
  },
  {
    key: "PATCH /api/reports/:id", url: () => `/api/reports/${ctx.report}`, actor: asOwner,
    base: () => ({ status: "pending" }), fields: () => ({ status: FIELD_VALUES }),
  },
  {
    key: "POST /api/tickets", url: () => "/api/tickets", actor: asAlice,
    base: () => ({ title: `Fuzz ticket ${RUN_ID}`, description: "Created by the input fuzz suite with a description that is long enough.", type: "other", priority: "low" }),
    fields: () => ({
      title: [...FIELD_VALUES, 12345678901, { length: 20 }, ["0123456789"]],
      description: [...FIELD_VALUES, { length: 60 }], type: FIELD_VALUES, priority: FIELD_VALUES,
    }),
    extras: { ...EXTRAS, assignedTo: "abc", status: "resolved", ticketNumber: "TKT-0", relatedPostId: "abc", tags: { a: 1 } },
    huge: ["description"],
  },
  {
    key: "PATCH /api/tickets/:id", name: "as owner", url: () => `/api/tickets/${ctx.ticket}`, actor: asOwner,
    base: () => ({ priority: "low" }),
    fields: () => ({ status: FIELD_VALUES, priority: FIELD_VALUES, assignedTo: idValues(ctx.ownerId), reason: FIELD_VALUES }),
  },
  {
    key: "PATCH /api/tickets/:id", name: "as creator", url: () => `/api/tickets/${ctx.ticket}`, actor: asAlice,
    base: () => ({ reason: "fuzz" }), baseline: [403], fields: () => ({ status: FIELD_VALUES, reason: FIELD_VALUES }),
  },
  {
    key: "POST /api/tickets/:id/comments", url: () => `/api/tickets/${ctx.ticket}/comments`, actor: asAlice,
    base: () => ({ content: "fuzz ticket comment" }), fields: () => ({ content: FIELD_VALUES, isInternal: WRONG_TYPES }), huge: ["content"],
  },
  {
    key: "PATCH /api/tickets/:id/comments/:cId", url: () => `/api/tickets/${ctx.ticket}/comments/${ctx.ticketComment}`, actor: asAlice,
    base: () => ({ content: "fuzz edited" }), fields: () => ({ content: FIELD_VALUES }), huge: ["content"],
  },
  { key: "POST /api/tickets/:id/restore", url: () => `/api/tickets/${ctx.ticket}/restore`, actor: asOwner },
  {
    key: "POST /api/user/themes", url: () => "/api/user/themes", actor: asAlice,
    base: () => ({ name: `Fz ${RUN_ID}`, colors: "{}" }), fields: () => ({ name: FIELD_VALUES, colors: FIELD_VALUES }),
    extras: EXTRAS, huge: ["name", "colors"],
  },
  {
    key: "PATCH /api/user/themes/:id", url: () => `/api/user/themes/${ctx.theme}`, actor: asAlice,
    base: () => ({ colors: "{}" }), fields: () => ({ name: FIELD_VALUES, colors: FIELD_VALUES }), extras: EXTRAS, huge: ["name", "colors"],
  },
  { key: "POST /api/user/themes/background", url: () => "/api/user/themes/background", actor: asAlice },

  // --- admin (owner account, only objects created by this suite)
  {
    key: "POST /api/admin/bans", url: () => "/api/admin/bans", actor: asOwner,
    base: () => ({ ban_type: "account", user_id: ctx.banVictim.id, reason: "fuzz", duration_hours: 1 }),
    fields: () => ({
      ban_type: FIELD_VALUES, user_id: idValues(ctx.banVictim.id), reason: FIELD_VALUES, duration_hours: [...WRONG_TYPES, "abc"], severity: WRONG_TYPES,
    }),
    onAnswer: (r) => ok(r) && typeof json(r)?.id === "number" && createdBans.push(json(r).id),
  },
  {
    key: "PATCH /api/admin/bans/:id/revoke", url: () => `/api/admin/bans/${ctx.ban}/revoke`, actor: asOwner,
    base: () => ({ reason: "fuzz" }), fields: () => ({ reason: FIELD_VALUES }),
  },
  {
    key: "POST /api/admin/users/:id/ban", url: () => `/api/admin/users/${ctx.banVictim.id}/ban`, actor: asOwner,
    base: () => ({ reason: "fuzz", duration_hours: 1 }),
    fields: () => ({ reason: FIELD_VALUES, duration_hours: [...WRONG_TYPES, "abc"] }),
    onAnswer: (r) => ok(r) && typeof json(r)?.id === "number" && createdBans.push(json(r).id),
  },
  {
    key: "POST /api/admin/users/:id/unban", url: () => `/api/admin/users/${ctx.banVictim.id}/unban`, actor: asOwner,
    base: () => ({ reason: "fuzz" }), fields: () => ({ reason: FIELD_VALUES }),
  },
  {
    key: "POST /api/admin/auto-punishments/rules", url: () => "/api/admin/auto-punishments/rules", actor: asOwner,
    base: () => ({ name: `fz rule ${RUN_ID}`, anomalyType: `fz_never_${RUN_ID}`, action: "warn", actionReason: "fuzz", isActive: 0 }),
    fields: () => ({
      name: WRONG_TYPES, anomalyType: nonStrings(WRONG_TYPES), action: WRONG_TYPES, actionReason: WRONG_TYPES,
      isActive: [null, "1", true, 1.5, "abc", {}, []], actionDurationHours: WRONG_TYPES, escalateAfterCount: WRONG_TYPES,
    }),
    // id 1 is a seeded default rule: a client-chosen id must not reach the INSERT (duplicate key)
    extras: { id: 1, createdAt: "not-a-date" },
    onAnswer: (r) => ok(r) && typeof json(r)?.id === "number" && createdRules.push(json(r).id),
  },
  {
    key: "PATCH /api/admin/auto-punishments/rules/:id", url: () => `/api/admin/auto-punishments/rules/${ctx.rule}`, actor: asOwner,
    base: () => ({ actionReason: "fuzz" }),
    fields: () => ({
      name: WRONG_TYPES, action: WRONG_TYPES, actionReason: FIELD_VALUES, isActive: [null, "1", true, 1.5, "abc", {}, []],
      actionDurationHours: WRONG_TYPES, cooldownHours: WRONG_TYPES,
    }),
    extras: { createdAt: "not-a-date", updatedAt: "not-a-date" },
  },
  {
    key: "POST /api/admin/groups", url: () => "/api/admin/groups", actor: asOwner,
    base: () => ({ name: `fzg ${RUN_ID} ${uniq()}`, permissions: "[]" }),
    fields: () => ({
      name: [...nonStrings(WRONG_TYPES), `fzg ${RUN_ID} ${UNICODE}`, `fzg ${RUN_ID} ${NUL}`],
      permissions: FIELD_VALUES, color: WRONG_TYPES, description: WRONG_TYPES,
    }),
    extras: { createdAt: "not-a-date" }, huge: ["permissions", "description"],
  },
  {
    key: "PATCH /api/admin/groups/:id", url: () => `/api/admin/groups/${ctx.group}`, actor: asOwner,
    base: () => ({ description: "fuzz" }),
    fields: () => ({ name: [...nonStrings(WRONG_TYPES), `fzg ${RUN_ID} ${UNICODE}`], permissions: FIELD_VALUES, color: WRONG_TYPES, description: FIELD_VALUES }),
    extras: { createdAt: "not-a-date", unknownColumn: 1 },
  },
  {
    key: "POST /api/admin/groups/assign", url: () => "/api/admin/groups/assign", actor: asOwner,
    base: () => ({ userId: ctx.groupVictim.id, groupId: ctx.group }),
    fields: () => ({ userId: idValues(ctx.groupVictim.id), groupId: idValues(ctx.group) }),
  },
  {
    key: "PATCH /api/admin/users/:id", url: () => `/api/admin/users/${ctx.userVictim.id}`, actor: asOwner,
    base: () => ({ verified: 0 }),
    fields: () => ({
      role: FIELD_VALUES, karma: WRONG_TYPES, isAdmin: WRONG_TYPES, verified: WRONG_TYPES, isFrozen: WRONG_TYPES, frozenUntil: WRONG_TYPES,
      adminGroupId: WRONG_TYPES, username: uniqueValues(`_${RUN_ID}v`), email: uniqueValues(`${RUN_ID}v@e2e.test`),
    }),
    extras: { createdAt: "not-a-date", password: "plain" },
  },
  {
    key: "PATCH /api/admin/reports/:id", url: () => `/api/admin/reports/${ctx.report}`, actor: asOwner,
    base: () => ({ status: "pending" }), fields: () => ({ status: FIELD_VALUES }),
  },
  {
    key: "PATCH /api/admin/settings/:id", url: () => "/api/admin/settings/999999999", actor: asOwner,
    base: () => ({ value: "x" }), baseline: [404], fields: () => ({ value: FIELD_VALUES }),
  },
  { key: "POST /api/admin/analytics/compute", url: () => "/api/admin/analytics/compute", actor: asOwner, base: () => ({}), fields: () => ({ date: BAD_DATES }) },
  { key: "POST /api/admin/performance/snapshot", url: () => "/api/admin/performance/snapshot", actor: asOwner, base: () => ({}), fields: () => ({ date: BAD_DATES }) },
];

/** Write routes that are deliberately not fuzzed, with the reason. */
const SKIPPED: Record<string, string> = {
  "POST /api/admin/reset-roles": "demotes every admin on the shared server",
  "POST /api/admin/settings/seed": "rewrites global settings",
  "POST /api/admin/settings/clear-cache": "global side effect, takes no input",
  "POST /api/admin/bulk/users": "a malformed id list (e.g. the string \"12\") would ban users of other test runs",
  "POST /api/admin/bulk/reports": "bulk action on shared data",
  "POST /api/admin/bulk/posts": "bulk action on shared data",
  "POST /api/security/stress-test/:testName?": "runs load tests against the shared server",
};

test("every POST/PATCH/PUT route is fuzzed or explicitly skipped", () => {
  const covered = new Set([...BODY_SPECS.map((s) => s.key), ...Object.keys(SKIPPED)]);
  const missing = apiRoutes()
    .filter((r) => ["post", "patch", "put"].includes(r.method))
    .map((r) => `${r.method.toUpperCase()} ${r.path}`)
    .filter((k) => !covered.has(k));
  assert.deepEqual(missing, [], "new write routes need an entry in BODY_SPECS or SKIPPED");
});

for (const spec of BODY_SPECS) {
  const [method] = spec.key.split(" ");
  const title = spec.name ? `${spec.key} (${spec.name})` : spec.key;

  describe(title, () => {
    const run = (payloads: Array<Payload | (() => Payload)>) =>
      spec.concurrency ? runConcurrent(spec, method, payloads) : runPayloads(spec.key, method, spec.url, payloads, spec.actor, spec.onAnswer);

    if (spec.base) {
      test("the valid base body reaches the handler", async () => {
        const p: Payload = { label: "base", json: spec.base!() };
        const r = await send(await spec.actor(), method, spec.url(), p);
        spec.onAnswer?.(r, p);
        const expected = spec.baseline ?? [200, 201];
        assert.ok(expected.includes(r.status), `base body → HTTP ${r.status} ${r.text.slice(0, 120)} (expected ${expected.join("/")})`);
      });
    }

    test("malformed bodies are rejected or ignored", async () => {
      const payloads: Array<Payload | (() => Payload)> = [...SHAPES];
      if (spec.base) payloads.push(() => withProtoKey(spec.base!()), () => ({ label: "base + constructor.prototype", json: { ...spec.base!(), constructor: { prototype: { isAdmin: true } } } }));
      const failures = await run(payloads);
      assert.equal(failures.length, 0, failMessage(title, failures));
    });

    if (spec.fields) {
      test("wrong types, boundaries and hostile strings in every field", async () => {
        const failures = await run(fieldPayloads(spec.base!, spec.fields!()).map((p) => p.make));
        assert.equal(failures.length, 0, failMessage(title, failures));
      });
    }

    if (spec.extras) {
      test("extra fields (id, createdAt, owner ids, role …) do not cause errors", async () => {
        const payloads = Object.entries(spec.extras!).map(([k, v]) => () => ({ label: `+${k}=${describeValue(v)}`, json: { ...spec.base!(), [k]: v } }));
        const failures = await run(payloads);
        assert.equal(failures.length, 0, failMessage(title, failures));
      });
    }

    if (spec.huge?.length) {
      test("200 000-character strings are rejected", async () => {
        const failures: string[] = [];
        for (const field of spec.huge!) {
          const p: Payload = { label: `${field}=200k chars`, json: { ...spec.base!(), [field]: HUGE } };
          const r = await send(await spec.actor(), method, spec.url(), p);
          spec.onAnswer?.(r, p);
          const bad = problem(r);
          if (bad) failures.push(`${p.label} → ${bad}`);
          else if (r.status < 400) failures.push(`${p.label} → accepted with HTTP ${r.status}`);
        }
        assert.equal(failures.length, 0, failMessage(title, failures));
      });
    }
  });
}

async function runConcurrent(spec: BodySpec, method: string, payloads: Array<Payload | (() => Payload)>): Promise<string[]> {
  const failures: string[] = [];
  const queue = [...payloads];
  await Promise.all(
    Array.from({ length: spec.concurrency! }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const p = typeof item === "function" ? item() : item;
        const r = await send(await spec.actor(), method, spec.url(), p);
        spec.onAnswer?.(r, p);
        const bad = problem(r);
        if (bad) failures.push(`${p.label} → ${bad}`);
      }
    }),
  );
  return failures;
}

// ---------------------------------------------------------------------------------------------
// Specific input rules found while reading the handlers

describe("input rules of individual routes", () => {
  test("PATCH /api/profile enforces the registration rules for username and email", async () => {
    const u = await newUser("fzrules");
    const bad: Array<[string, unknown]> = [
      ["username", ""], ["username", "   "], ["username", `a b ${RUN_ID}`], ["username", `<b>${RUN_ID}</b>`], ["username", "x".repeat(300)],
      ["email", "not-an-email"], ["email", ""],
    ];
    const accepted: string[] = [];
    for (const [field, value] of bad) {
      const r = await send(u.client, "PATCH", "/api/profile", { label: "", json: { [field]: value } });
      if (r.status < 400 || r.status >= 500 || r.timedOut) accepted.push(`${field}=${describeValue(value)} → ${r.timedOut ? "no answer" : r.status}`);
    }
    assert.deepEqual(accepted, [], "profile edits must reject what registration rejects");
  });

  test("PATCH /api/profile without any field answers instead of hanging", async () => {
    const u = await newUser("fzempty");
    const r = await send(u.client, "PATCH", "/api/profile", { label: "{}", json: {} });
    assert.ok(!r.timedOut, "no answer: the update with nothing to set throws outside the route's error handling");
    assert.ok(r.status < 500, `HTTP ${r.status}`);
  });

  test("PATCH /api/notifications/preferences cannot move the preferences row to another user", async () => {
    const attacker = await newUser("fzprefa");
    const victim = await newUser("fzprefv");
    await expectStatus(await attacker.client.get("/api/notifications/preferences"), 200);
    await send(attacker.client, "PATCH", "/api/notifications/preferences", { label: "", json: { userId: victim.id, likePost: 0 } });
    const victimPrefs = await (await victim.client.get("/api/notifications/preferences")).json();
    const mine = await (await attacker.client.get("/api/notifications/preferences")).json();
    assert.equal(victimPrefs.likePost, 1, "the attacker's settings now apply to the victim");
    assert.equal(mine.likePost, 0, "the attacker's own row was moved away");
  });

  test("PATCH /api/notifications/preferences accepts the booleans a settings form sends", async () => {
    const u = await newUser("fzprefb");
    await expectStatus(await u.client.get("/api/notifications/preferences"), 200);
    const r = await send(u.client, "PATCH", "/api/notifications/preferences", { label: "", json: { likePost: false } });
    assert.ok(r.status === 200 || r.status === 400, `HTTP ${r.status}: ${r.text.slice(0, 100)}`);
  });

  test("POST /api/user/themes ignores a client-chosen theme id", async () => {
    const u = await newUser("fzthid");
    const own = (await (await u.client.get("/api/user/themes")).json())[0];
    const r = await send(u.client, "POST", "/api/user/themes", { label: "", json: { name: `Fz id ${RUN_ID}`, colors: "{}", id: own.id } });
    assert.ok(r.status < 500, `HTTP ${r.status}: the id is passed to the INSERT`);
  });

  test("PATCH /api/admin/users/:id with a taken username or email answers 4xx", async () => {
    const target = await newUser("fzdupu");
    for (const body of [{ username: ADMIN_USER }, { email: `${alice.username}@e2e.test` }]) {
      const r = await send(withIp(owner), "PATCH", `/api/admin/users/${target.id}`, { label: "", json: body });
      assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(body)} → HTTP ${r.status} ${r.text.slice(0, 80)}`);
    }
  });

  test("PATCH /api/admin/reports/:id for a report that does not exist answers 404", async () => {
    const r = await send(withIp(owner), "PATCH", "/api/admin/reports/999999999", { label: "", json: { status: "pending" } });
    assert.equal(r.status, 404, `HTTP ${r.status} ${r.text.slice(0, 80)}`);
  });

  test("GET /api/notifications does not expose the actor's password hash or email", async () => {
    const target = await newUser("fzntgt");
    const actor = await newUser("fznact");
    await expectStatus(await actor.client.post(`/api/follow/${target.id}`), 200);
    const text = await (await target.client.get("/api/notifications")).text();
    assert.ok(text.includes(actor.username), "the follow notification is listed");
    assert.ok(!/\$2[aby]\$/.test(text), "notification actor contains a bcrypt hash");
    assert.ok(!text.includes(`${actor.username}@e2e.test`), "notification actor contains the email address");
  });

  // Found while fuzzing isLike: the reaction battery locked the post author out of their account.
  test("a single dislike does not lock a new author out of their account", async () => {
    const author = await newUser("fzkarma");
    const post = await author.client.post("/api/posts", { title: `Karma ${RUN_ID}`, content: "one dislike", category: "discussion" });
    await expectStatus(post, 201);
    const voter = await newUser("fzvoter");
    await expectStatus(await voter.client.post(`/api/posts/${(await post.json()).id}/react`, { isLike: false }), 200);
    assert.equal((await author.client.get("/api/user")).status, 200, "the author's session was invalidated");
    assert.equal((await new Client().login(author.username, author.password)).status, 200, "the author can no longer log in");
  });

  test("community names without letters or digits are rejected (they produce an empty slug)", async () => {
    for (const name of ["!!!", "   "]) {
      const r = await send(withIp(owner), "POST", "/api/communities", { label: "", json: { name } });
      assert.ok(r.status >= 400 && r.status < 500, `name ${JSON.stringify(name)} → HTTP ${r.status}`);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Query parameters

type QuerySpec = { key: string; name?: string; path: () => string; base?: string; params: string[]; actor: () => Client | Promise<Client> };

const QUERY_VALUES = [
  "-1", "0", "-999999999", "2147483648", "99999999999999999999", "1e309", "1.5", "abc", "NaN", "Infinity", "",
  SQLI, SQLI_STACKED, '{"$gt":""}', "%", "_", "\\", NUL, UNICODE, TRAVERSAL, CRLF, XSS, "__proto__", "constructor", "a".repeat(5000),
];

const QUERY_SPECS: QuerySpec[] = [
  { key: "GET /api/posts", name: "anonymous", path: () => "/api/posts", base: "limit=5", params: ["category", "communityId", "limit", "offset"], actor: anon },
  { key: "GET /api/posts", name: "logged in", path: () => "/api/posts", base: "limit=5", params: ["category", "communityId", "limit", "offset"], actor: asBob },
  { key: "GET /api/feed/communities", path: () => "/api/feed/communities", base: "limit=5", params: ["limit", "offset"], actor: asBob },
  { key: "GET /api/users/search", path: () => "/api/users/search", params: ["q"], actor: asAlice },
  { key: "GET /api/user/search", path: () => "/api/user/search", params: ["q"], actor: asAlice },
  { key: "GET /api/search", path: () => "/api/search", params: ["q"], actor: asAlice },
  { key: "GET /api/notifications", path: () => "/api/notifications", base: "limit=5", params: ["limit", "offset", "unreadOnly", "type"], actor: asAlice },
  {
    key: "GET /api/tickets", name: "as user", path: () => "/api/tickets", base: "limit=5",
    params: ["status", "priority", "type", "assignedTo", "createdBy", "sortBy", "search", "page", "limit"], actor: asAlice,
  },
  {
    key: "GET /api/tickets", name: "as owner", path: () => "/api/tickets", base: "limit=5",
    params: ["status", "priority", "type", "assignedTo", "createdBy", "sortBy", "search", "page", "limit"], actor: asOwner,
  },
  { key: "GET /api/admin/logs", path: () => "/api/admin/logs", params: ["category", "severity", "status", "search", "adminId"], actor: asOwner },
  { key: "GET /api/admin/logs/export", path: () => "/api/admin/logs/export", base: "limit=5", params: ["limit", "offset", "format"], actor: asOwner },
  {
    key: "GET /api/admin/monitoring/activity-logs", path: () => "/api/admin/monitoring/activity-logs", base: "limit=5",
    params: ["page", "limit", "category", "severity", "status", "action", "userId", "search"], actor: asOwner,
  },
  { key: "GET /api/admin/monitoring/anomalies", path: () => "/api/admin/monitoring/anomalies", params: ["status"], actor: asOwner },
  { key: "GET /api/admin/analytics/overview", path: () => "/api/admin/analytics/overview", params: ["days"], actor: asOwner },
  { key: "GET /api/admin/performance/leaderboard", path: () => "/api/admin/performance/leaderboard", params: ["period", "sortBy"], actor: asOwner },
  { key: "GET /api/admin/performance/moderator/:id", path: () => `/api/admin/performance/moderator/${ctx.ownerId}`, params: ["period"], actor: asOwner },
];

function queryVariants(spec: QuerySpec): string[] {
  const out: string[] = [];
  for (const p of spec.params) {
    for (const v of QUERY_VALUES) out.push(`${p}=${encodeURIComponent(v)}`);
    out.push(`${p}=1&${p}=2`, `${p}[$gt]=`, `${p}[]=a`, `${p}[__proto__][isAdmin]=1`, `${p}[a][b][c][d][e][f]=1`);
  }
  out.push("__proto__[isAdmin]=1", "constructor[prototype][isAdmin]=1", "__proto__.role=owner");
  return out;
}

describe("query parameters", () => {
  for (const spec of QUERY_SPECS) {
    const title = spec.name ? `${spec.key} (${spec.name})` : spec.key;
    test(`${title}: malformed query values are rejected or ignored`, async () => {
      const baseline = await send(await spec.actor(), "GET", spec.base ? `${spec.path()}?${spec.base}` : spec.path());
      assert.equal(baseline.status, 200, `the plain request must work first: HTTP ${baseline.status} ${baseline.text.slice(0, 100)}`);
      const failures: string[] = [];
      for (const q of queryVariants(spec)) {
        // base first so that a fuzzed limit/offset overrides the small default (Express keeps the last value of a repeated key)
        const query = spec.base ? `${spec.base}&${q}` : q;
        const r = await send(await spec.actor(), "GET", `${spec.path()}?${query}`);
        const bad = problem(r);
        if (bad) failures.push(`?${q.length > 60 ? q.slice(0, 57) + "…" : q} → ${bad}`);
      }
      assert.equal(failures.length, 0, failMessage(title, failures));
    });
  }

  test("every documented query route is fuzzed", () => {
    const keys = new Set(QUERY_SPECS.map((s) => s.key));
    const routes = new Set(apiRoutes().map((r) => `${r.method.toUpperCase()} ${r.path}`));
    for (const k of keys) assert.ok(routes.has(k), `${k} is not in the route inventory any more`);
  });
});

// ---------------------------------------------------------------------------------------------

describe("prototype pollution has no lasting effect", () => {
  test("__proto__ in profile, register and query does not make anyone an admin", async () => {
    const u = await newUser("fzproto");
    await send(u.client, "PATCH", "/api/profile", { label: "", raw: '{"bio":"x","__proto__":{"isAdmin":true,"role":"owner"},"constructor":{"prototype":{"role":"owner"}}}' });
    await send(u.client, "GET", "/api/posts?__proto__[role]=owner&constructor[prototype][isAdmin]=1");
    const reg = await anon();
    await send(reg, "POST", "/api/register", {
      label: "", raw: JSON.stringify({ username: `fzpr2_${RUN_ID}`, email: `fzpr2_${RUN_ID}@e2e.test`, password: "E2e-Passw0rd!" }).slice(0, -1) + ',"__proto__":{"role":"owner","isAdmin":1}}',
    });

    for (const c of [u.client, reg]) {
      const me = json(await send(c, "GET", "/api/user"));
      assert.equal(me?.role, "user");
      assert.ok(!me?.isAdmin);
      assert.equal(me?.karma, 0);
      // still not staff: the admin API does not exist for them (404, like an unknown route)
      assert.equal((await send(c, "GET", "/api/admin/stats")).status, 404);
    }
  });

  test("after the whole battery a brand-new user is still a plain user and plain objects are clean", async () => {
    const fresh = await newUser("fzafter");
    const me = await (await fresh.client.get("/api/user")).json();
    assert.equal(me.role, "user");
    assert.ok(!me.isAdmin);
    // staff-only routes answer non-staff like an unknown route (404)
    assert.equal((await fresh.client.get("/api/admin/users")).status, 404);
    assert.equal((await fresh.client.get("/api/tickets/stats")).status, 404);
    const posts = await (await fresh.client.get("/api/posts?limit=5")).json();
    assert.ok(Array.isArray(posts) && posts.every((p: any) => p.isAdmin === undefined && p.role === undefined));
    assert.equal((await new Client().get("/api/admin/stats")).status, 404);
  });
});
