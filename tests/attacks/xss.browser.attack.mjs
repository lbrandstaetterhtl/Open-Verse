// Attacker scenarios — XSS / client-side output safety (area "xss"), browser part.
//
// Run: E2E_BASE_URL=http://127.0.0.1:5084 E2E_ADMIN_USER=routeowner E2E_ADMIN_PASSWORD='…' \
//        node --test tests/attacks/xss.browser.attack.mjs
//
// Playwright is installed globally (not a repo dependency), loaded from `npm root -g` like tests/browser/forms.test.mjs.
// Each scenario drives a real Chromium: it stores a harmless marker payload through the API, renders the page that
// shows the value, and asserts the SAFE outcome — the payload appears as TEXT, nothing executes (no dialog, no
// console marker, no window.__xss global, no <script>/<img onerror> markup, no active javascript: link), external
// links use http(s) and carry rel=noopener, and theme values stay inside their CSS variable.
// A FAILING assertion documents a finding; the app is expected to behave as asserted here.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";

const require = createRequire(path.join(execSync("npm root -g").toString().trim(), "noop.js"));
const { chromium } = require("playwright");

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:5084").replace(/\/$/, "");
const OWNER = process.env.E2E_ADMIN_USER ?? "routeowner";
const OWNER_PW = process.env.E2E_ADMIN_PASSWORD ?? "";
const RUN = Date.now().toString(36);
const PW = "Xss-Attack-2026!";

// Unique marker so we can find the payload as rendered TEXT on the page.
const MARK = `XSSMARK${RUN}`;
// Payloads that must never execute or become live markup. Each embeds MARK so we can also assert it shows as text.
const SCRIPT = `<script>window.__xss=1;console.log('XSSFIRE ${MARK}')</script>`;
const IMG = `<img src=x onerror="window.__xss=1;console.log('XSSFIRE ${MARK}')">`;
const SVG = `<svg onload="window.__xss=1"></svg>`;
const PAYLOAD = `${MARK} ${SCRIPT}${IMG}${SVG}`;

let browser;
let ipc = 0;
const randomIp = () => `10.${150 + Math.floor(Math.random() * 90)}.${Math.floor(Math.random() * 250)}.${(ipc++ % 250) + 1}`;

/** Browser context with its own IP, and recorders for dialogs, console, page errors and external requests. */
async function newSession() {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const ip = randomIp();
  // One handler: same-origin requests get this context's own X-Forwarded-For (so per-IP rate limits don't
  // collide between sessions); any cross-origin request (e.g. a CSS url() beacon) is recorded and aborted.
  const external = [];
  await context.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE)) {
      return r.continue({ headers: { ...r.request().headers(), "x-forwarded-for": ip } });
    }
    if (u.startsWith("data:") || u.startsWith("blob:")) return r.continue();
    external.push(u);
    return r.abort();
  });
  const page = await context.newPage();
  const dialogs = [];
  const consoleMsgs = [];
  const pageErrors = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  page.on("console", (m) => consoleMsgs.push(m.text()));
  page.on("pageerror", (e) => pageErrors.push(e.message.split("\n")[0]));
  await page.goto(`${BASE}/auth`, { waitUntil: "load" });
  const api = (method, url, body) =>
    page.evaluate(async ([method, url, body]) => {
      const tok = (await (await fetch("/api/csrf-token")).json()).csrfToken;
      const r = await fetch(url, { method, headers: { "content-type": "application/json", "x-csrf-token": tok }, body: body ? JSON.stringify(body) : undefined });
      const text = await r.text();
      try { return { status: r.status, body: JSON.parse(text) }; } catch { return { status: r.status, body: text }; }
    }, [method, url, body]);
  return {
    context, page, dialogs, consoleMsgs, pageErrors, api,
    goto: async (p, wait = 1200) => { await page.goto(BASE + p, { waitUntil: "load" }); await page.waitForTimeout(wait); },
    external: () => external.slice(),
    close: () => context.close(),
  };
}

async function login(s, user, pw) {
  const r = await s.api("POST", "/api/login", { username: user, password: pw });
  assert.ok(r.status < 300, `login ${user}: ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`);
  return r.body;
}
async function register(s, user, pw = PW) {
  const r = await s.api("POST", "/api/register", { username: user, email: `${user}@e2e.test`, password: pw });
  assert.ok(r.status < 300, `register ${user}: ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`);
  return r.body;
}
let uc = 0;
const uname = (tag) => `x${tag}${(uc++).toString(36)}_${RUN}`.slice(0, 30);

/** The injected payload neither executed nor became live markup on the current page. */
async function assertNoExec(s, where) {
  await s.page.waitForTimeout(300);
  const st = await s.page.evaluate(() => ({
    flag: window.__xss,
    injectedImg: document.querySelectorAll('img[src="x"]').length,
    injectedScript: [...document.querySelectorAll("script")].filter((el) => el.textContent.includes("window.__xss")).length,
    injectedSvgOnload: [...document.querySelectorAll("svg")].filter((el) => el.hasAttribute("onload")).length,
    jsLinks: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^\s*(javascript|data|vbscript):/i.test(h)),
  }));
  assert.equal(st.flag, undefined, `${where}: window.__xss was set — payload executed`);
  assert.equal(st.injectedImg, 0, `${where}: <img src=x onerror> rendered as live markup`);
  assert.equal(st.injectedScript, 0, `${where}: <script> rendered as live markup`);
  assert.equal(st.injectedSvgOnload, 0, `${where}: <svg onload> rendered as live markup`);
  assert.deepEqual(st.jsLinks, [], `${where}: dangerous-scheme link(s) rendered: ${JSON.stringify(st.jsLinks)}`);
  assert.ok(!s.dialogs.length, `${where}: a dialog fired: ${JSON.stringify(s.dialogs)}`);
  assert.ok(!s.consoleMsgs.some((m) => m.includes("XSSFIRE")), `${where}: payload console beacon fired: ${JSON.stringify(s.consoleMsgs.filter((m) => m.includes("XSSFIRE")))}`);
}
async function assertShowsText(s, where, text = MARK) {
  const body = await s.page.evaluate(() => document.body.innerText);
  assert.ok(body.includes(text), `${where}: marker ${JSON.stringify(text)} not shown as text (payload may have been dropped silently or executed)`);
}

before(async () => {
  browser = await chromium.launch({ args: [`--proxy-server=${process.env.HTTPS_PROXY ?? ""}`, "--proxy-bypass-list=127.0.0.1;localhost"] });
});
after(async () => { if (browser) await browser.close(); });

// ---------------------------------------------------------------------------------------------------------------
// Angriff: stored script/markup payload in profile text fields (displayName, bio, location) runs in a viewer's browser.
// attacker = a registered user who sets markup in their profile; victim = anyone opening /users/:name.
describe("Angriff: stored payload in profile fields", () => {
  test("displayName / bio / location render as text, execute nothing", async () => {
    const atk = await newSession();
    try {
      const u = uname("prof");
      await register(atk, u);
      const r = await atk.api("PATCH", "/api/profile", { displayName: `${MARK} ${IMG}`, bio: PAYLOAD, location: `${MARK}loc ${SVG}` });
      assert.ok(r.status < 300, `profile update: ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`);
      const victim = await newSession();
      try {
        await register(victim, uname("vic"));
        await victim.goto(`/users/${u}`);
        await assertNoExec(victim, "profile view");
        await assertShowsText(victim, "profile view");
      } finally { await victim.close(); }
    } finally { await atk.close(); }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Angriff: stored payload in a post (title + content) and in a comment runs when the post is opened.
describe("Angriff: stored payload in posts and comments", () => {
  test("post title/content and comment render as text, execute nothing", async () => {
    const atk = await newSession();
    try {
      await register(atk, uname("pa"));
      const post = await atk.api("POST", "/api/posts", { category: "discussion", title: `${MARK} ${IMG}`, content: PAYLOAD });
      assert.ok(post.status === 201, `create post: ${post.status} ${JSON.stringify(post.body).slice(0, 150)}`);
      const pid = post.body.id;
      const c = await atk.api("POST", "/api/comments", { postId: pid, content: `${MARK}cmt ${SCRIPT}${IMG}` });
      assert.ok(c.status < 300, `create comment: ${c.status} ${JSON.stringify(c.body).slice(0, 150)}`);
      const victim = await newSession();
      try {
        await register(victim, uname("pv"));
        await victim.goto(`/posts/${pid}`);
        await assertNoExec(victim, "post view");
        await assertShowsText(victim, "post view");
        await assertShowsText(victim, "post view (comment)", `${MARK}cmt`);
      } finally { await victim.close(); }
    } finally { await atk.close(); }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Angriff: stored payload in a community name/description runs when the community page is opened.
describe("Angriff: stored payload in community name/description", () => {
  test("community name/description render as text, execute nothing", async () => {
    const atk = await newSession();
    try {
      await login(atk, OWNER, OWNER_PW); // owner may create communities without karma
      const name = `${MARK} ${IMG}`.slice(0, 60);
      const com = await atk.api("POST", "/api/communities", { name, description: PAYLOAD });
      assert.ok(com.status === 201, `create community: ${com.status} ${JSON.stringify(com.body).slice(0, 200)}`);
      const slug = com.body.slug;
      await atk.goto(`/c/${slug}`);
      await assertNoExec(atk, "community page");
      await assertShowsText(atk, "community page", MARK);
    } finally { await atk.close(); }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Angriff: stored payload in a direct message runs in the recipient's chat view.
describe("Angriff: stored payload in direct messages", () => {
  test("DM content renders as text, executes nothing", async () => {
    const sender = await newSession();
    const recipient = await newSession();
    try {
      const rUser = await register(recipient, uname("dmr"));
      const sUser = await register(sender, uname("dms"));
      // DMs require a mutual follow; establish it so we reach the message-rendering path.
      await sender.api("POST", `/api/users/follow/${rUser.id}`);
      await recipient.api("POST", `/api/users/follow/${sUser.id}`);
      const m = await sender.api("POST", "/api/messages", { receiverId: rUser.id, content: `${MARK}dm ${SCRIPT}${IMG}` });
      assert.ok(m.status < 300, `send DM: ${m.status} ${JSON.stringify(m.body).slice(0, 150)}`);
      await recipient.goto(`/chat/${sUser.id}`, 1800); // open the conversation with the sender
      await assertNoExec(recipient, "chat view");
      await assertShowsText(recipient, "chat view", `${MARK}dm`);
    } finally { await sender.close(); await recipient.close(); }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Angriff: a user files a support ticket whose "relatedUrl" is a javascript: URL; the owner/admin opens the ticket
// and the rendered link is a live javascript: href — one click runs attacker JS in the admin's session.
describe("Angriff: javascript: URL in ticket relatedUrl (stored XSS targeting staff)", () => {
  test("ticket relatedUrl link is http(s) only, never a javascript:/data: href", async () => {
    const atk = await newSession();
    try {
      await register(atk, uname("tk"));
      const payloadUrl = `javascript:window.__xss=1;console.log('XSSFIRE ${MARK}')`;
      const t = await atk.api("POST", "/api/tickets", {
        title: `${MARK} relatedUrl attack`,
        description: "x".repeat(60),
        type: "bug_report",
        priority: "low",
        relatedUrl: payloadUrl,
      });
      assert.ok(t.status === 201, `create ticket: ${t.status} ${JSON.stringify(t.body).slice(0, 150)}`);
      const id = t.body.ticket.id;
      // The owner opens the ticket (owner role can view every ticket).
      const admin = await newSession();
      try {
        await login(admin, OWNER, OWNER_PW);
        await admin.goto(`/tickets/${id}`, 1500);
        const related = await admin.page.evaluate(() =>
          [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /alert|__xss|XSSFIRE|javascript:/i.test(h)),
        );
        assert.deepEqual(related, [], `relatedUrl rendered as a dangerous href the admin can click: ${JSON.stringify(related)}`);
        // Even if present, it must not have executed on render.
        await assertNoExec(admin, "ticket detail (admin)");
      } finally { await admin.close(); }
    } finally { await atk.close(); }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Angriff: profile "website" link — reverse tabnabbing (target=_blank без rel=noopener) and dangerous scheme.
describe("Angriff: profile website link (tabnabbing / scheme)", () => {
  test("external website link is http(s) and carries rel=noopener/noreferrer", async () => {
    const atk = await newSession();
    try {
      const u = uname("web");
      await register(atk, u);
      await atk.api("PATCH", "/api/profile", { website: "https://example.com/attacker" });
      const victim = await newSession();
      try {
        await register(victim, uname("wv"));
        await victim.goto(`/users/${u}`);
        const link = await victim.page.evaluate(() => {
          const a = [...document.querySelectorAll("a[target='_blank']")].find((x) => /example\.com|http/i.test(x.getAttribute("href") || ""));
          return a ? { href: a.getAttribute("href"), rel: a.getAttribute("rel") } : null;
        });
        assert.ok(link, "website link not found on profile");
        assert.match(link.href, /^https?:\/\//, `website href is not http(s): ${link.href}`);
        assert.ok(link.rel && /noopener|noreferrer/.test(link.rel), `website link opens in a new tab without rel=noopener (reverse tabnabbing): rel=${JSON.stringify(link.rel)}`);
      } finally { await victim.close(); }
    } finally { await atk.close(); }
  });

  test("javascript: scheme in website never becomes an executable link", async () => {
    const atk = await newSession();
    try {
      const u = uname("webj");
      await register(atk, u);
      await atk.api("PATCH", "/api/profile", { website: "javascript:window.__xss=1" });
      const victim = await newSession();
      try {
        await register(victim, uname("wvj"));
        await victim.goto(`/users/${u}`);
        await assertNoExec(victim, "profile website (javascript:)");
      } finally { await victim.close(); }
    } finally { await atk.close(); }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Angriff: a theme value (background gradient / image URL) injects CSS that loads an external resource or breaks
// out of its CSS variable. Themes are applied from the user's own stored config; this checks the value stays
// contained and no cross-origin resource is fetched (CSP img-src 'self' is the backstop).
describe("Angriff: theme CSS value injection", () => {
  test("gradient/image-url theme value cannot fetch a cross-origin beacon or run JS", async () => {
    const s = await newSession();
    try {
      await register(s, uname("thm"));
      // Inject a hostile theme into the client's own localStorage, then reload so the theme engine applies it.
      const beacon = "https://xss-beacon.example.com/pixel.png";
      await s.page.evaluate((beacon) => {
        const theme = {
          version: 1,
          colors: { background: `0 0% 0%); background-image: url(${beacon}` },
          background: { mode: "gradient", gradient: `url(${beacon})`, image: { type: "url", value: beacon }, overlay: { opacity: 0, blur: 0, tint: "0 0% 0%" } },
        };
        try { localStorage.setItem("customTheme", JSON.stringify(theme)); } catch {}
      }, beacon);
      await s.goto(`/`, 1500);
      await assertNoExec(s, "theme injection");
      const ext = s.external().filter((u) => u.includes("xss-beacon.example.com"));
      assert.deepEqual(ext, [], `theme CSS value caused a cross-origin resource load (CSS exfil): ${JSON.stringify(ext)}`);
    } finally { await s.close(); }
  });
});
