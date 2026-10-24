// REALTIME attack scenarios (WebSocket /ws, availability, information disclosure, configuration).
//
// Attacker model: an ordinary logged-in user (and, where noted, an anonymous client). Goals:
//   - crash or hang the server for everyone (availability),
//   - receive real-time data meant for other users / private spaces,
//   - connect the WebSocket from a hostile origin, or impersonate others over it,
//   - pull secrets / source / internals over HTTP.
//
// Each test asserts the SAFE outcome; a failing test documents a live finding (see
// docs/audit/attacks/findings-realtime.json) that must pass once fixed.
//
// NOTE: the "server stays up" scenario can take the process down (that is the finding). It runs
// last and restarts the server in `after` so the box is left healthy and the suite re-runnable.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  Client, newUser, BASE_URL, WS_HOST,
  openWs, openWsAuthed, cookieHeader, collect,
  serverUp, restartServer, maskedFrame, rawWrite, RESTART_CMD,
} from "./helpers/realtime";

async function getCsrf(client: Client): Promise<string> {
  return client.refreshCsrf();
}

// ---------------------------------------------------------------------------------------------
describe("Angriff: WebSocket without a session (anonymous eavesdropper)", () => {
  // Attacker: anonymous client. Goal: open /ws and receive the broadcast stream without logging in.
  test("anonymous upgrade to /ws is refused", async () => {
    const r = await openWs({ origin: `http://${WS_HOST}` });
    assert.equal(r.ok, false, "anonymous client must not be able to open the WebSocket");
    if (r.ok === false) {
      assert.equal(r.status, 401, `expected 401 for anonymous /ws, got ${r.status ?? r.err}`);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("Angriff: Cross-Site WebSocket Hijacking (CSWSH)", () => {
  // Attacker: a malicious web page the victim visits, which opens ws://app/ws using the victim's
  // ambient cookie. The server must reject upgrades whose Origin is not the app's own.
  let victim: Awaited<ReturnType<typeof newUser>>;
  before(async () => { victim = await newUser("rt_cswsh"); });

  test("upgrade from a foreign Origin is refused (403)", async () => {
    const r = await openWs({ cookie: cookieHeader(victim.client), origin: "http://evil.example.com" });
    assert.equal(r.ok, false, "cross-origin WebSocket upgrade must be blocked");
    if (r.ok === false) {
      assert.equal(r.status, 403, `expected 403 for foreign Origin, got ${r.status ?? r.err}`);
    }
  });

  test("same-origin upgrade still works (baseline)", async () => {
    const r = await openWsAuthed(victim.client);
    assert.equal(r.ok, true, "same-origin authenticated upgrade should succeed");
    if (r.ok) r.ws.terminate();
  });

  // A request with NO Origin header skips the check entirely (server/routes/index.ts:316 `if (origin)`).
  // Browsers always send Origin on a WS handshake, so this is not a browser-driven CSWSH, but it
  // documents that the guard is bypassed whenever Origin is absent. SAFE behaviour: still accepted
  // only for a valid session, which it is — so we assert the (currently true) fact and flag it low.
  test("missing Origin header: handshake is NOT additionally rejected (documents weak guard)", async () => {
    const r = await openWs({ cookie: cookieHeader(victim.client) });
    // This passes today (connects). It is recorded as a low finding; if the server later decides to
    // require an Origin, flip this to assert r.ok === false.
    assert.equal(r.ok, true, "baseline: no-Origin handshake currently connects with a valid session");
    if (r.ok) r.ws.terminate();
  });
});

// ---------------------------------------------------------------------------------------------
describe("Angriff: real-time harvesting of other users' content over /ws", () => {
  // Attacker: a logged-in user with no relationship to a victim (not following, no shared
  // community). Goal: passively receive the victim's content as it is created. The server
  // broadcasts `new_comment` with the FULL comment object to every open socket
  // (server/routes/comments.ts:49 -> services/websocket.ts broadcastMessage).
  let attacker: Awaited<ReturnType<typeof newUser>>;
  let victim: Awaited<ReturnType<typeof newUser>>;

  before(async () => {
    attacker = await newUser("rt_harv_atk");
    victim = await newUser("rt_harv_vic");
  });

  test("a stranger's socket receives another user's comment content verbatim", async () => {
    const conn = await openWsAuthed(attacker.client);
    assert.equal(conn.ok, true, "attacker socket should open");
    if (!conn.ok) return;
    const seen = collect(conn.ws);

    // Victim posts and comments.
    await getCsrf(victim.client);
    const postRes = await victim.client.post("/api/posts", { title: "t", content: "b", category: "general" });
    const postBody = await postRes.text();
    assert.equal(postRes.status, 201, postBody);
    const postId = JSON.parse(postBody).id as number;
    const marker = `HARVEST-${Date.now().toString(36)}`;
    const cRes = await victim.client.post("/api/comments", { postId, content: marker });
    const cBody = await cRes.text();
    assert.equal(cRes.status, 201, cBody);

    await new Promise((r) => setTimeout(r, 800));
    conn.ws.terminate();

    const leaked = seen().some((m) => m.includes(marker) && m.includes("new_comment"));
    // SAFE behaviour: a user who cannot otherwise see this content should NOT have it pushed to
    // them. new_post already sends only an id and defers to fetch-time authz; new_comment should do
    // the same (or scope the broadcast). Today it ships the whole comment to everyone.
    assert.equal(leaked, false,
      "comment content was broadcast over /ws to a user with no relationship to the post");
  });
});

// ---------------------------------------------------------------------------------------------
describe("Angriff: impersonation / injection via client->server WebSocket frames", () => {
  // Attacker: a logged-in user. Goal: push a forged event (e.g. a fake notification) to other
  // users by sending frames up the socket. The server registers no message handler, so inbound
  // frames are ignored — this SHOULD be safe. We confirm a stranger receives nothing.
  let attacker: Awaited<ReturnType<typeof newUser>>;
  let bystander: Awaited<ReturnType<typeof newUser>>;

  before(async () => {
    attacker = await newUser("rt_imp_atk");
    bystander = await newUser("rt_imp_by");
  });

  test("messages sent up the socket are not relayed to other users", async () => {
    const atk = await openWsAuthed(attacker.client);
    const by = await openWsAuthed(bystander.client);
    assert.equal(atk.ok && by.ok, true, "both sockets should open");
    if (!atk.ok || !by.ok) return;
    const seen = collect(by.ws);

    const forged = JSON.stringify({ type: "notification", data: { message: "FORGED-INJECT" } });
    atk.ws.send(forged);
    atk.ws.send(JSON.stringify({ type: "new_comment", data: { content: "FORGED-INJECT" } }));

    await new Promise((r) => setTimeout(r, 600));
    atk.ws.terminate(); by.ws.terminate();

    assert.equal(seen().some((m) => m.includes("FORGED-INJECT")), false,
      "a client must not be able to inject events to other users via the WebSocket");
  });
});

// ---------------------------------------------------------------------------------------------
describe("Angriff: availability — rate limits and pagination caps", () => {
  // Attacker: a logged-in (or anonymous) user. Goal: exhaust the server or pull unbounded result
  // sets. We confirm the documented limiters are actually enforced, and probe pagination caps.

  test("login endpoint rate-limits repeated attempts from one IP", async () => {
    // authLimiter: 20 / 15min per IP (server/auth.ts:110). Fire a modest burst from a single IP.
    const c = new Client("203.0.113.77"); // fixed IP for this test
    let got429 = false;
    for (let i = 0; i < 26; i++) {
      await c.refreshCsrf();
      const r = await c.post("/api/login", { username: "nobody_x", password: "wrong" });
      if (r.status === 429) { got429 = true; break; }
    }
    assert.equal(got429, true, "expected the login limiter to return 429 within ~20 attempts from one IP");
  });

  test("pagination limit is capped (no unbounded page size)", async () => {
    const u = await newUser("rt_page");
    // Ask for a huge page; the server must clamp it. We can't read the applied limit directly, so
    // assert the feed returns at most the documented cap (100) even when limit=100000 is requested.
    const r = await u.client.get("/api/posts?limit=100000&offset=0");
    const body = await r.text();
    assert.equal(r.status, 200, body);
    const arr = JSON.parse(body);
    assert.ok(Array.isArray(arr), "posts list expected");
    assert.ok(arr.length <= 100, `page size must be capped at 100, got ${arr.length}`);
  });

  test("absurd pagination offset does not error the server", async () => {
    const u = await newUser("rt_off");
    const r = await u.client.get("/api/posts?limit=10&offset=999999999");
    // SAFE behaviour: a huge offset is handled gracefully (empty page), not a 500 / hang.
    assert.equal(r.status, 200, `huge offset should be handled, got ${r.status}: ${await r.text()}`);
    assert.ok(await serverUp(), "server must stay responsive after a huge-offset query");
  });
});

// ---------------------------------------------------------------------------------------------
describe("Angriff: expensive/admin endpoints reachable by non-privileged users", () => {
  // Attacker: a logged-in non-admin user. Goal: run the stress-test harness or read monitoring
  // internals. These must be admin-gated.
  let user: Awaited<ReturnType<typeof newUser>>;
  before(async () => { user = await newUser("rt_priv"); });

  test("stress-test runner is not reachable by a normal user", async () => {
    await getCsrf(user.client);
    const r = await user.client.post("/api/security/stress-test/cpu-intensive", { duration: 1, intensity: "low" });
    assert.ok(r.status === 401 || r.status === 403,
      `non-admin must not start a stress test, got ${r.status}`);
    assert.ok(await serverUp(), "server must stay up");
  });

  test("admin monitoring metrics are not readable by a normal user", async () => {
    const r = await user.client.get("/api/admin/monitoring/metrics/overview");
    assert.ok(r.status === 401 || r.status === 403,
      `non-admin must not read monitoring internals, got ${r.status}`);
  });
});

// ---------------------------------------------------------------------------------------------
describe("Angriff: information disclosure over HTTP", () => {
  // Attacker: anonymous client. Goal: fetch .env, server source, source maps, or internals.
  test("/.env, server source and source maps are not served as real files", async () => {
    for (const p of ["/.env", "/server/index.ts", "/server/routes/index.ts", "/assets/x.js.map", "/package.json"]) {
      const res = await fetch(BASE_URL + p);
      const body = await res.text();
      // The SPA catch-all returns index.html (200) for unknown paths, which is fine. The finding
      // would be a real file: assert no server secrets / source markers leak.
      assert.ok(!body.includes("SESSION_SECRET"), `${p} must not expose SESSION_SECRET`);
      assert.ok(!body.includes("DATABASE_URL"), `${p} must not expose DATABASE_URL`);
      assert.ok(!/import .* from ["']\.\.?\//.test(body) || body.includes("<!DOCTYPE html>"),
        `${p} must not serve raw server source`);
    }
  });

  test("responses do not advertise the server technology (X-Powered-By)", async () => {
    const res = await fetch(BASE_URL + "/api/health");
    assert.equal(res.headers.get("x-powered-by"), null, "X-Powered-By must be suppressed");
  });

  test("/api/health exposes only liveness fields", async () => {
    const res = await fetch(BASE_URL + "/api/health");
    const body = await res.json();
    const keys = Object.keys(body).sort();
    assert.deepEqual(keys, ["status", "uptime"], `health must expose only status/uptime, saw ${keys.join(",")}`);
  });

  test("the AI provider key never reaches the client", async () => {
    // Public settings and any unauthenticated surface must not carry provider secrets.
    const res = await fetch(BASE_URL + "/api/public/settings");
    const body = await res.text();
    assert.ok(!/gsk_|GROQ_API_KEY|SG\./.test(body), "provider API keys must not be sent to clients");
  });
});

// ---------------------------------------------------------------------------------------------
// DESTRUCTIVE — keep LAST. A malformed WebSocket frame currently takes the whole process down.
describe("Angriff: crash the server for everyone with one malformed WebSocket frame", { skip: RESTART_CMD ? false : "E2E_RESTART_CMD is not set: this scenario may take the server down and needs a way to restart it" }, () => {
  // Attacker: any logged-in user. Goal: deny service to all users. The /ws connection handler
  // registers no 'error' listener (server/routes/index.ts:349), so a receiver protocol error is
  // re-emitted as an unhandled 'error' -> uncaughtException -> shutdown() (server/index.ts:282).
  let attacker: Awaited<ReturnType<typeof newUser>>;
  before(async () => { attacker = await newUser("rt_crash"); });
  after(async () => { await restartServer(); }); // leave the box healthy for re-runs

  test("the server stays up after a client sends a malformed frame", async () => {
    assert.equal(await serverUp(), true, "precondition: server is up");
    const conn = await openWsAuthed(attacker.client);
    assert.equal(conn.ok, true, "attacker socket should open");
    if (!conn.ok) return;

    // Masked frame with reserved opcode 0x3 -> "Invalid WebSocket frame: invalid opcode 3".
    rawWrite(conn.ws, maskedFrame(0x03));

    // Give the process a moment to (not) die.
    let up = true;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 400));
      if (!(await serverUp())) { up = false; break; }
    }
    try { conn.ws.terminate(); } catch { /* socket already gone */ }

    assert.equal(up, true,
      "server process was taken down by a single malformed WebSocket frame (unhandled 'error' -> uncaughtException -> shutdown)");
  });
});
