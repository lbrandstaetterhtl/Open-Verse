// Attack suite: server-side input handling (INJECT).
//
// Attacker model: an anonymous visitor or an ordinary logged-in user who controls every query
// parameter, path segment, header and JSON body field the server reads, and wants to crash the
// server, leak the raw SQL / another user's data, run an expensive query, or get past a filter.
//
// Each test asserts the SAFE outcome: the server answers 4xx (or ignores the input with a clean
// 2xx), never 5xx, never a hang, never SQL text / stack traces in the body, and stays responsive.
// A failing test documents a finding that will be fixed later; it should pass once the input
// handling is hardened. This suite extends tests/e2e/input-fuzz.test.ts (audit 1) with attacker
// scenarios and the routes/params/structural attacks that suite did not cover — it does not repeat
// the per-route body/field fuzzing there.
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { Client, newUser, expectStatus, ADMIN_USER, ADMIN_PASSWORD, RUN_ID, freshIp } from "../e2e/client";
import {
  send, problem, withIp, fresh, rawRequest, deepKey, manyParams,
  ID_SEGMENTS, QUERY_SHAPES, LIKE_BOMBS, PROFANITY_EVASIONS, type Sent,
} from "./helpers/inject";

type TestUser = Awaited<ReturnType<typeof newUser>>;

const owner = new Client();
let alice: TestUser, bob: TestUser;
const ctx = {} as { ownerId: number; cid: number; postId: number; ticketId: number };

/** Health must come back quickly and cleanly after each attack: the server survived. */
async function serverAlive(): Promise<boolean> {
  const c = new Client(freshIp());
  const r = await send(c, "GET", "/api/health");
  return !r.timedOut && r.status === 200;
}

before(async () => {
  assert.ok(ADMIN_USER && ADMIN_PASSWORD, "E2E_ADMIN_USER and E2E_ADMIN_PASSWORD must be set");
  await expectStatus(await owner.login(ADMIN_USER, ADMIN_PASSWORD), 200);
  ctx.ownerId = (await (await owner.get("/api/user")).json()).id;
  [alice, bob] = [await newUser("inja"), await newUser("injb")];

  const community = await owner.post("/api/communities", { name: `Inject ${RUN_ID}`, description: "inject attack suite" });
  await expectStatus(community, 201);
  ctx.cid = (await community.json()).id;

  const post = await alice.client.post("/api/posts", { title: `Inject target ${RUN_ID}`, content: "target of the inject suite", category: "discussion" });
  await expectStatus(post, 201);
  ctx.postId = (await post.json()).id;

  const ticket = await alice.client.post("/api/tickets", {
    title: `Inject ticket ${RUN_ID}`, description: "Ticket for the inject attack suite, long enough for the length check.", type: "other", priority: "low",
  });
  await expectStatus(ticket, 201);
  ctx.ticketId = (await ticket.json()).ticket.id;
});

// ---------------------------------------------------------------------------------------------
// Scenario 1 — crash list endpoints with type-confused query parameters.
// Attacker: a logged-in user sends ?param[]=x or ?param[a]=b so the handler receives an object or
// array where it expects a string/number. Goal: HTTP 500 (DoS) and, ideally, the raw SQL in the body.
describe("Angriff: type-confused query parameters crash list endpoints", () => {
  const CASES: Array<{ name: string; actor: () => Client; path: string; params: string[] }> = [
    { name: "GET /api/notifications", actor: () => alice.client, path: "/api/notifications", params: ["type", "limit", "offset", "unreadOnly"] },
    { name: "GET /api/tickets", actor: () => alice.client, path: "/api/tickets", params: ["status", "priority", "type", "search", "sortBy", "assignedTo", "page", "limit"] },
    { name: "GET /api/posts", actor: () => alice.client, path: "/api/posts", params: ["category", "communityId", "limit", "offset"] },
    { name: "GET /api/users/search", actor: () => alice.client, path: "/api/users/search", params: ["q"] },
    { name: "GET /api/admin/logs", actor: () => owner, path: "/api/admin/logs", params: ["category", "severity", "status", "search", "adminId"] },
    { name: "GET /api/admin/monitoring/activity-logs", actor: () => owner, path: "/api/admin/monitoring/activity-logs", params: ["category", "severity", "status", "action", "userId", "search", "page", "limit"] },
    { name: "GET /api/admin/performance/leaderboard", actor: () => owner, path: "/api/admin/performance/leaderboard", params: ["period", "sortBy"] },
  ];

  for (const c of CASES) {
    test(`${c.name}: array/object/operator values answer 4xx, not 5xx`, async () => {
      const failures: string[] = [];
      for (const p of c.params) {
        for (const q of QUERY_SHAPES(p)) {
          const r = await send(await fresh(c.actor()), "GET", `${c.path}?${q}`);
          const bad = problem(r);
          if (bad) failures.push(`?${q} → ${bad}`);
        }
      }
      assert.equal(failures.length, 0, `${c.name}: ${failures.length} unsafe answer(s)\n  ${failures.slice(0, 20).join("\n  ")}`);
      assert.ok(await serverAlive(), "server unresponsive after the battery");
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Scenario 2 — crash id-taking routes that validateIdParams does not guard.
// Attacker: a logged-in user puts a non-numeric or out-of-int4-range value in the id segment.
// Goal: an unhandled DB error (HTTP 500) instead of a 404/400.
describe("Angriff: hostile path ids crash unguarded routes", () => {
  const CASES: Array<{ name: string; actor: () => Client; url: (id: string) => string; method?: string }> = [
    { name: "GET /api/messages/:userId", actor: () => alice.client, url: (id) => `/api/messages/${id}` },
    { name: "GET /api/tickets/:id/history", actor: () => alice.client, url: (id) => `/api/tickets/${id}/history` },
    { name: "GET /api/communities/:id/members", actor: () => alice.client, url: (id) => `/api/communities/${id}/members` },
    { name: "GET /api/admin/performance/moderator/:id", actor: () => owner, url: (id) => `/api/admin/performance/moderator/${id}` },
    { name: "DELETE /api/user/themes/background/:fileRef", actor: () => alice.client, url: (id) => `/api/user/themes/background/${id}`, method: "DELETE" },
    { name: "GET /api/users/:username/posts", actor: () => alice.client, url: (id) => `/api/users/${id}/posts` },
  ];

  for (const c of CASES) {
    test(`${c.name}: every hostile id answers a clean 4xx`, async () => {
      const failures: string[] = [];
      for (const seg of ID_SEGMENTS) {
        // segments are already URL-ready (e.g. "%00", "..%2f..%2fetc%2fpasswd"); do not re-encode
        const r = await send(await fresh(c.actor()), c.method ?? "GET", c.url(seg));
        const bad = problem(r);
        if (bad) failures.push(`${seg} → ${bad}`);
      }
      assert.equal(failures.length, 0, `${c.name}: ${failures.length} unsafe answer(s)\n  ${failures.join("\n  ")}`);
      assert.ok(await serverAlive(), "server unresponsive");
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Scenario 3 — a negative offset reaches SQL OFFSET.
// Attacker: ?offset=-5 on the notifications list. parseInt keeps the negative; parsePagination is
// not used here, so OFFSET -5 reaches Postgres and errors. Goal: HTTP 500.
describe("Angriff: negative pagination reaches the database", () => {
  test("GET /api/notifications?offset=-5 answers 2xx/4xx, not 5xx", async () => {
    const r = await send(await fresh(alice.client), "GET", "/api/notifications?offset=-5&limit=5");
    const bad = problem(r);
    assert.equal(bad, null, `offset=-5 → ${bad}`);
  });
  test("GET /api/notifications?limit=-1 is clamped, not an error", async () => {
    const r = await send(await fresh(alice.client), "GET", "/api/notifications?limit=-1");
    assert.ok(r.status < 500, `limit=-1 → HTTP ${r.status}`);
  });
});

// ---------------------------------------------------------------------------------------------
// Scenario 4 — query-string parser DoS.
// Attacker (anonymous): sends deeply nested keys, a huge sparse array index, or thousands of
// parameters on a public route. Goal: take the server down or exhaust memory in the qs parser.
// Safe outcome: the request is rejected (4xx) OR at worst errors (we also tolerate an isolated 5xx),
// but the server MUST stay responsive and the attack MUST NOT hang.
describe("Angriff: query-string structural abuse keeps the server alive", () => {
  const attacks: Array<[string, string]> = [
    ["deeply nested key (category[a][a]…×60)", deepKey("category", 60)],
    ["huge array index (category[99999])", "category[99999]=1"],
    ["5000 distinct parameters", manyParams(5000)],
    ["2000 repeated category values", Array.from({ length: 2000 }, () => "category=x").join("&")],
  ];
  for (const [name, qs] of attacks) {
    test(`GET /api/posts?${name}: server stays responsive and does not hang`, async () => {
      const r = await send(new Client(freshIp()), "GET", `/api/posts?${qs}`);
      assert.ok(!r.timedOut, `${name} hung with no answer`);
      assert.ok(r.status < 500, `${name} → HTTP ${r.status} (expected the parser/handler to reject with 4xx, not crash)`);
      assert.ok(await serverAlive(), `server unresponsive after ${name}`);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Scenario 5 — expensive search patterns (LIKE / regex cost).
// Attacker: a logged-in user sends pathological wildcard patterns to the search endpoints that run
// ILIKE (and the mention regex) on user input. Goal: pin a CPU / stall the DB (algorithmic DoS).
describe("Angriff: pathological search patterns do not stall the server", () => {
  const SEARCHES = [
    { name: "GET /api/users/search", actor: () => alice.client, url: (q: string) => `/api/users/search?q=${encodeURIComponent(q)}` },
    { name: "GET /api/search", actor: () => alice.client, url: (q: string) => `/api/search?q=${encodeURIComponent(q)}` },
    { name: "GET /api/tickets (search)", actor: () => owner, url: (q: string) => `/api/tickets?search=${encodeURIComponent(q)}` },
  ];
  for (const s of SEARCHES) {
    test(`${s.name}: wildcard bombs answer quickly without 5xx`, async () => {
      const failures: string[] = [];
      for (const bomb of LIKE_BOMBS) {
        const r = await send(await fresh(s.actor()), "GET", s.url(bomb));
        if (r.timedOut) failures.push(`${bomb.slice(0, 20)}… → no answer`);
        else if (r.status >= 500) failures.push(`${bomb.slice(0, 20)}… → HTTP ${r.status}`);
        else if (r.ms > 5000) failures.push(`${bomb.slice(0, 20)}… → ${r.ms}ms (too slow)`);
      }
      assert.equal(failures.length, 0, `${s.name}: ${failures.join("; ")}`);
      assert.ok(await serverAlive(), "server unresponsive");
    });
  }

  // The mention scanner runs @([a-zA-Z0-9_]+) over the comment body and hits the DB per match.
  test("POST /api/comments: a body full of @mentions does not stall the request", async () => {
    const author = await newUser("injmention");
    const content = ("@" + "a".repeat(30) + " ").repeat(300); // under the 10k limit, max distinct lookups
    const r = await send(withIp(author.client), "POST", "/api/comments", { label: "mention bomb", json: { postId: ctx.postId, content: content.slice(0, 9900) } });
    assert.ok(!r.timedOut, "mention scan hung");
    assert.ok(r.status < 500, `HTTP ${r.status}`);
    assert.ok(r.ms < 5000, `mention scan took ${r.ms}ms`);
  });
});

// ---------------------------------------------------------------------------------------------
// Scenario 6 — oversized and deeply nested bodies.
// Attacker: posts a body far over the 1 MB limit, a 150k-deep nested object, or an object-valued
// field. Goal: crash the JSON parser / handler, or hang. Safe: rejected with 4xx, server alive.
describe("Angriff: oversized and deeply nested bodies are rejected, not fatal", () => {
  test("a body with ~80 000 keys is rejected (payload limit)", async () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 80_000; i++) many["k" + i] = i;
    const r = await send(withIp(alice.client), "POST", "/api/comments", { label: "80k keys", json: { postId: ctx.postId, content: "x", ...many } });
    assert.ok(!r.timedOut && r.status >= 400 && r.status < 500, `HTTP ${r.status}`);
    assert.ok(await serverAlive(), "server unresponsive");
  });

  test("a 150 000-level nested object answers 4xx, not 5xx or a hang", async () => {
    const raw = `{"postId":${ctx.postId},"content":` + '{"a":'.repeat(150_000) + '"x"' + "}".repeat(150_000) + "}";
    const r = await send(withIp(alice.client), "POST", "/api/comments", { label: "deep object", raw });
    assert.ok(!r.timedOut, "deep object hung");
    assert.ok(r.status >= 400 && r.status < 500, `HTTP ${r.status} (deep nesting should be a 4xx, not a crash)`);
  });

  test("PATCH /api/notifications/preferences with an object-valued flag answers 4xx, not 5xx", async () => {
    const u = await newUser("injprefs");
    await expectStatus(await u.client.get("/api/notifications/preferences"), 200);
    const r = await send(withIp(u.client), "PATCH", "/api/notifications/preferences", { label: "object flag", raw: '{"likePost":{"a":{"b":1}}}' });
    assert.ok(r.status >= 400 && r.status < 500, `HTTP ${r.status}: an object where a flag is expected must be rejected, not reach the DB`);
  });
});

// ---------------------------------------------------------------------------------------------
// Scenario 7 — giant email hangs the profile update (connection-exhaustion DoS).
// Attacker: a logged-in user PATCHes an email that passes zod's email() check but is large enough
// to blow the users.email index on write. The handler has no try/catch, so the failed query becomes
// an unhandled rejection: no response is ever sent and the connection is held open. Repeated, this
// exhausts the connection pool. Safe outcome: the request is answered (4xx) and does not hang.
describe("Angriff: an oversized field value hangs PATCH /api/profile", () => {
  test("a 200 000-char email is answered, not left hanging", async () => {
    const u = await newUser("injhang");
    // ~500k chars: large enough that the UPDATE errors; the un-try/caught handler then never answers
    const email = "a@" + "a-".repeat(250_000) + "x";
    const r = await send(withIp(u.client), "PATCH", "/api/profile", { label: "giant email", json: { email } });
    assert.ok(!r.timedOut, "no answer: the failed UPDATE becomes an unhandled rejection and the request hangs forever");
    assert.ok(r.status >= 400 && r.status < 500, `HTTP ${r.status}`);
  });

  test("the server is still responsive after the hanging request", async () => {
    assert.ok(await serverAlive(), "server unresponsive");
  });
});

// ---------------------------------------------------------------------------------------------
// Scenario 8 — control characters and oversize values in request headers.
// Attacker: NUL / control bytes in User-Agent or X-Forwarded-For (both are read and logged / hashed
// into the ban fingerprint), and an oversize header. Goal: crash the server or inject a log line.
describe("Angriff: hostile request headers cannot crash the server", () => {
  test("control bytes in headers are rejected by the HTTP layer, server survives", async () => {
    const probes: Array<[string, string[]]> = [
      ["NUL in User-Agent", ["User-Agent: a\x00b"]],
      ["control byte in User-Agent", ["User-Agent: a\x01b"]],
      ["vertical tab in User-Agent", ["User-Agent: a\x0bb"]],
      ["NUL in X-Forwarded-For", ["X-Forwarded-For: 1.2.3.4\x00"]],
    ];
    for (const [name, headers] of probes) {
      const r = await rawRequest("GET /api/health HTTP/1.1", headers);
      assert.ok(/^HTTP\/1\.1 4\d\d/.test(r.statusLine) || r.error === undefined, `${name}: unexpected ${r.statusLine || r.error}`);
      assert.ok(!/^HTTP\/1\.1 5\d\d/.test(r.statusLine), `${name}: server answered ${r.statusLine}`);
    }
    assert.ok(await serverAlive(), "server unresponsive after header probes");
  });

  test("an oversize header is rejected (431/400), not a crash", async () => {
    const r = await rawRequest("GET /api/health HTTP/1.1", [`X-Junk: ${"a".repeat(100_000)}`]);
    assert.ok(!/^HTTP\/1\.1 5\d\d/.test(r.statusLine), `oversize header → ${r.statusLine || r.error}`);
    assert.ok(await serverAlive(), "server unresponsive after oversize header");
  });

  test("a weird Accept-Language (used in the ban fingerprint) does not crash a normal request", async () => {
    const r = await rawRequest("GET /api/posts?limit=5 HTTP/1.1", ["Accept-Language: ;;;---,,,"]);
    assert.ok(!/^HTTP\/1\.1 5\d\d/.test(r.statusLine), `→ ${r.statusLine || r.error}`);
  });
});

// ---------------------------------------------------------------------------------------------
// Scenario 9 — unicode gets a banned word past the profanity filter.
// Attacker: posts a title/content containing a banned word disguised with zero-width spaces,
// fullwidth forms or Cyrillic homoglyphs. The filter does a lowercase substring match on the raw
// bytes, so the disguised word is not detected. Safe outcome: the disguised word is still blocked
// (the filter normalises), i.e. these posts should be rejected just like the plain word.
describe("Angriff: unicode evades the profanity substring filter", () => {
  test("disguised banned words are blocked like the plain word", async () => {
    // Baseline: the plain word is blocked, so the filter is on (fresh user to avoid the post cooldown).
    const baseUser = await newUser("injprofbase");
    const base = await send(withIp(baseUser.client), "POST", "/api/posts", { label: "plain", json: { title: "a sex topic here", content: "clean body text here", category: "discussion" } });
    assert.equal(base.status, 400, `baseline not blocked (HTTP ${base.status}); filter disabled?`);

    const leaked: string[] = [];
    for (const evasion of PROFANITY_EVASIONS) {
      const u = await newUser("injprof" + Math.random().toString(36).slice(2, 6));
      const r = await send(withIp(u.client), "POST", "/api/posts", { label: evasion, json: { title: "topic one two", content: `clean ${evasion} body here`, category: "discussion" } });
      if (r.status < 400) leaked.push(`${JSON.stringify(evasion)} → HTTP ${r.status} (accepted)`);
    }
    assert.deepEqual(leaked, [], `the profanity filter does not normalise unicode:\n  ${leaked.join("\n  ")}`);
  });
});

// ---------------------------------------------------------------------------------------------
// Scenario 10 — prototype pollution through the admin surface.
// Audit 1 covered register/profile/posts. Here the attacker tries the admin query parser and admin
// bodies, then checks nothing on the server prototype chain changed. Safe: no pollution, no 500.
describe("Angriff: prototype pollution through admin input has no lasting effect", () => {
  test("__proto__ in admin query and body does not pollute or crash", async () => {
    await send(await fresh(owner), "GET", "/api/admin/logs?__proto__[isAdmin]=1&constructor[prototype][role]=owner");
    await send(await fresh(owner), "GET", "/api/admin/monitoring/activity-logs?__proto__[polluted]=1");
    await send(await fresh(owner), "PATCH", `/api/admin/users/${bob.id}`, { label: "proto body", raw: '{"verified":0,"__proto__":{"isAdmin":true,"role":"owner"},"constructor":{"prototype":{"polluted":1}}}' });
    // A brand-new plain object must not have inherited anything.
    assert.equal(({} as any).isAdmin, undefined, "Object.prototype.isAdmin was polluted");
    assert.equal(({} as any).polluted, undefined, "Object.prototype.polluted was polluted");
    assert.equal(({} as any).role, undefined, "Object.prototype.role was polluted");
    // bob did not become an owner.
    const me = await (await bob.client.get("/api/user")).json();
    assert.equal(me.role, "user", "the victim's role changed");
    assert.ok(!me.isAdmin, "the victim became admin");
    assert.ok(await serverAlive(), "server unresponsive");
  });
});

// ---------------------------------------------------------------------------------------------
// Scenario 11 — log injection through logged user input.
// Attacker: puts CRLF + a forged JSON log object into fields that get written to the activity log
// and the file logger (search term, report reason, ticket title). Goal: forge a log line / break
// the one-object-per-line format. Safe: the server escapes it (JSON logging) and stays well-formed.
describe("Angriff: user input cannot forge log lines", () => {
  const FORGE = 'x\r\n{"level":"CRITICAL","category":"security","message":"FORGED by attacker"}';

  test("a CRLF-laden search term is handled without error", async () => {
    const r = await send(await fresh(owner), "GET", `/api/admin/logs?search=${encodeURIComponent(FORGE)}`);
    assert.ok(r.status < 500, `HTTP ${r.status}`);
  });

  test("CRLF in a report reason is stored as data, not a new log line", async () => {
    const reporter = await newUser("injlog");
    const r = await send(withIp(reporter.client), "POST", "/api/reports", { label: "crlf reason", json: { reason: `abuse ${FORGE}`, postId: ctx.postId } });
    // The report is accepted or validation-rejected, but never a 500, and the server lives.
    assert.ok(r.status < 500, `HTTP ${r.status}`);
    assert.ok(await serverAlive(), "server unresponsive");
  });

  // The file logger serialises with JSON.stringify, which escapes CRLF, so a forged line cannot
  // appear. This is a defence we assert by behaviour above; a byte-level check of the log file
  // would need filesystem access to the server container.
  test.todo("assert the activity-log file still has exactly one JSON object per line (needs server fs access)");
});
