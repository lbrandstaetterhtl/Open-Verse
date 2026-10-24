// Browser audit of every form in the React client (area "UI").
//
// Run: E2E_BASE_URL=http://127.0.0.1:5063 E2E_ADMIN_USER=routeowner E2E_ADMIN_PASSWORD='…' \
//        UI_SHOTS_DIR=/some/dir npx tsx tests/browser/forms.test.mjs [--only=auth,post,…]
//
// Playwright is installed globally (not a repo dependency), so it is loaded from `npm root -g`.
// Every browser context gets its own X-Forwarded-For IP so the per-IP rate limits of parallel runs don't collide.
// The UI language is German (localStorage i18nextLng=de) unless a test says otherwise.
// A FAIL documents a finding: the app is expected to behave as asserted here.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(path.join(execSync("npm root -g").toString().trim(), "noop.js"));
const { chromium } = require("playwright");
const repoRequire = createRequire(import.meta.url);
const sharp = repoRequire("sharp");

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:5063").replace(/\/$/, "");
const OWNER = process.env.E2E_ADMIN_USER ?? "routeowner";
const OWNER_PW = process.env.E2E_ADMIN_PASSWORD ?? "";
const SHOTS = process.env.UI_SHOTS_DIR ?? path.join(os.tmpdir(), "osiris-ui-shots");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
const RUN = Date.now().toString(36);
const PW = "Ui-Forms-Check-2026!";
fs.mkdirSync(SHOTS, { recursive: true });

const XSS_IMG = `<img src=x onerror="window.__xss=1">`;
const XSS_SCRIPT = `<script>window.__xss=1</script>`;
const XSS = `${XSS_IMG}${XSS_SCRIPT}`;
const JS_URL = "javascript:window.__xss=1";
// Toast/inline texts that mean the user is shown a raw server answer instead of a sentence.
const RAW_TEXT = /[{}[\]]|"error"|\b[1-5]\d\d\s*:|VALIDATION_ERROR|\bissues\b|Invalid input|at \S+ \(|<html|undefined|\[object/i;

let pngImage, fakePng;
const browser = await chromium.launch({ args: [`--proxy-server=${process.env.HTTPS_PROXY}`, "--proxy-bypass-list=127.0.0.1;localhost"] });
// English server texts, to detect messages shown untranslated in the German UI.
const englishServer = Object.values(flatten(await (await fetch(`${BASE}/locales/en/server.json`)).json())).filter((v) => typeof v === "string" && v.length > 12 && !v.includes("{{"));

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") flatten(v, `${prefix}${k}.`, out);
    else out[prefix + k] = v;
  }
  return out;
}

// ---------------------------------------------------------------- harness
const results = [];
let focus = null; // page that is screenshotted when the running test fails
async function test(area, name, fn) {
  if (ONLY.length && !ONLY.includes(area)) return;
  focus = null;
  try {
    await fn();
    results.push({ area, name, ok: true });
    console.log(`PASS  ${area} › ${name}`);
  } catch (e) {
    const shot = path.join(SHOTS, `${area}-${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").slice(0, 80)}.png`);
    try { if (focus) await focus.screenshot({ path: shot, fullPage: false }); } catch { /* page may be gone */ }
    results.push({ area, name, ok: false, error: e.message, shot });
    console.log(`FAIL  ${area} › ${name}\n      ${String(e.message).split("\n").slice(0, 6).join("\n      ")}\n      screenshot: ${focus ? shot : "-"}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomIp = () => `10.${120 + Math.floor(Math.random() * 100)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

/** A browser context with its own IP, German UI, toast recorder, request log and JS error log. */
async function newSession({ user, pw = PW, register = false, login = true, lang = "de", viewport = { width: 1440, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport });
  const ip = randomIp();
  await context.route(`${BASE}/**`, (r) => r.continue({ headers: { ...r.request().headers(), "x-forwarded-for": ip } }));
  await context.addInitScript((lang) => {
    try {
      localStorage.setItem("i18nextLng", lang);
      localStorage.setItem("tutorial-completed", "true");
    } catch { /* storage blocked */ }
    // TOAST_LIMIT is 1, so record every toast text as it appears.
    window.__toasts = [];
    const seen = new WeakSet();
    setInterval(() => {
      document.querySelectorAll('li[data-state="open"]').forEach((el) => {
        const text = el.innerText.trim();
        if (!text) return;
        if (!seen.has(el)) { seen.add(el); el.__last = text; window.__toasts.push(text); }
        else if (el.__last !== text) { el.__last = text; window.__toasts.push(text); }
      });
    }, 50);
  }, lang);
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  const dialogs = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message.split("\n")[0]}`));
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept().catch(() => {}); });
  page.on("request", (r) => {
    if (r.url().includes("/api/")) requests.push({ method: r.method(), url: r.url(), body: r.postData() ?? "", status: null, response: null, req: r });
  });
  page.on("response", async (r) => {
    const entry = requests.findLast((q) => q.req === r.request());
    if (!entry) return;
    entry.status = r.status();
    entry.response = await r.text().catch(() => "");
  });
  await page.goto(`${BASE}/auth`, { waitUntil: "load" });
  const api = (method, url, body) =>
    page.evaluate(async ([method, url, body]) => {
      const tok = (await (await fetch("/api/csrf-token")).json()).csrfToken;
      const r = await fetch(url, { method, headers: { "content-type": "application/json", "x-csrf-token": tok }, body: body ? JSON.stringify(body) : undefined });
      const text = await r.text();
      try { return { status: r.status, body: JSON.parse(text) }; } catch { return { status: r.status, body: text }; }
    }, [method, url, body]);
  const s = {
    context, page, errors, requests, dialogs, api, user,
    toasts: () => page.evaluate(() => window.__toasts.slice()),
    clearToasts: () => page.evaluate(() => { window.__toasts.length = 0; document.querySelectorAll('li[data-state="open"] button[toast-close], li[data-state="open"] button').forEach((b) => b.click()); }),
    calls: (method, re) => requests.filter((q) => q.method === method && re.test(new URL(q.url).pathname)),
    goto: async (p, wait = 1200) => { await page.goto(BASE + p, { waitUntil: "load" }); await page.waitForTimeout(wait); },
    close: () => context.close(),
  };
  if (user && login) {
    const r = register
      ? await api("POST", "/api/register", { username: user, email: `${user}@e2e.test`, password: pw })
      : await api("POST", "/api/login", { username: user, password: pw });
    assert.ok(r.status < 300, `${register ? "register" : "login"} ${user}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    s.id = r.body.id;
  }
  return s;
}
const owner = () => newSession({ user: OWNER, pw: OWNER_PW });
let userCounter = 0;
const fresh = (prefix) => newSession({ user: `${prefix}${(userCounter++).toString(36)}_${RUN}`.slice(0, 30), register: true });

/** Whether an injected payload ran or became markup on the current page. */
async function xssState(page) {
  return page.evaluate(() => ({
    flag: window.__xss,
    injectedImg: document.querySelectorAll('img[src="x"]').length,
    injectedScript: [...document.querySelectorAll("script")].filter((el) => el.textContent.includes("window.__xss")).length,
    jsLinks: [...document.querySelectorAll("a[href]")].filter((a) => /^\s*javascript:/i.test(a.getAttribute("href"))).map((a) => a.getAttribute("href")),
  }));
}
async function assertNoXss(page, where) {
  await page.waitForTimeout(400);
  const st = await xssState(page);
  assert.equal(st.flag, undefined, `${where}: window.__xss was set`);
  assert.equal(st.injectedImg, 0, `${where}: <img src=x> was rendered as markup`);
  assert.equal(st.injectedScript, 0, `${where}: <script> was rendered as markup`);
  assert.deepEqual(st.jsLinks, [], `${where}: javascript: link rendered`);
}
/** The page shows the text somewhere (as plain text). */
async function assertShowsText(page, text, where) {
  const body = await page.evaluate(() => document.body.innerText);
  assert.ok(body.includes(text), `${where}: expected the text ${JSON.stringify(text.slice(0, 60))} to be shown`);
}
/** Every toast is a readable translated sentence: no raw JSON/status, no untranslated English server text. */
function assertReadable(toasts, where) {
  for (const t of toasts) {
    assert.ok(!RAW_TEXT.test(t), `${where}: raw text in toast: ${JSON.stringify(t)}`);
    const english = englishServer.find((e) => t.includes(e));
    assert.ok(!english, `${where}: untranslated English server text in toast: ${JSON.stringify(t)}`);
  }
}
async function visibleErrorText(page) {
  return page.evaluate(() => [...document.querySelectorAll('p[id$="-form-item-message"], p.text-destructive, .text-destructive')].map((e) => e.innerText.trim()).filter(Boolean));
}
/** Native constraint validation blocked the form (e.g. required / type=email). */
const invalidInputs = (page) => page.evaluate(() => [...document.querySelectorAll("input,textarea")].filter((e) => !e.checkValidity()).map((e) => e.name || e.id || e.placeholder));


/** A fast human fast double click: two real mouse clicks GAP ms apart (a disabled button ignores the second). */
async function doubleClick(locator, gap = 80) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert.ok(box, "button not visible");
  const page = locator.page();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(gap);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
/** Enter pressed twice GAP ms apart. */
async function doubleEnter(locator, gap = 80) {
  await locator.press("Enter");
  await locator.page().waitForTimeout(gap);
  await locator.press("Enter");
}

pngImage = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 30, g: 120, b: 200 } } }).png().toBuffer();
fakePng = Buffer.from("this is not an image at all, only text pretending to be a png file\n".repeat(20));

// ================================================================ AUTH: login / register
{
  const anon = ONLY.length && !ONLY.includes("auth") ? null : await newSession();
  const page = anon?.page;
  const submit = (name) => page.locator("form").getByRole("button", { name, exact: true }).click();
  const field = (label) => page.locator("form").getByLabel(label, { exact: true });
  const openTab = async (name) => { await page.getByRole("tab", { name }).click(); await page.waitForTimeout(400); };

  await test("auth", "login: empty submit shows both German messages and sends nothing", async () => {
    focus = page;
    await anon.goto("/auth");
    await submit("Anmelden");
    await page.waitForTimeout(400);
    const msgs = await visibleErrorText(page);
    assert.ok(msgs.includes("Bitte gib deinen Benutzernamen ein"), JSON.stringify(msgs));
    assert.ok(msgs.includes("Bitte gib dein Passwort ein"), JSON.stringify(msgs));
    assert.equal(anon.calls("POST", /^\/api\/login$/).length, 0);
  });

  await test("auth", "login: wrong password shows a translated toast", async () => {
    focus = page;
    await field("Benutzername").fill(`nobody_${RUN}`);
    await field("Passwort").fill("wrong-password-123");
    await submit("Anmelden");
    await page.waitForTimeout(1500);
    const toasts = await anon.toasts();
    assert.ok(toasts.some((t) => t.includes("Anmeldung fehlgeschlagen")), JSON.stringify(toasts));
    assert.ok(toasts.some((t) => /Benutzername oder Passwort/.test(t)), `server reason not shown in German: ${JSON.stringify(toasts)}`);
    assertReadable(toasts, "login");
  });

  const cases = [
    ["username too short", { u: "ab", e: "ok@e2e.test", p: "Long-enough-1" }, "Der Benutzername muss mindestens 3 Zeichen lang sein"],
    ["username too long", { u: "a".repeat(31), e: "ok@e2e.test", p: "Long-enough-1" }, "Der Benutzername darf höchstens 30 Zeichen lang sein"],
    ["username with spaces/symbols", { u: "bad name!", e: "ok@e2e.test", p: "Long-enough-1" }, "Nur Buchstaben, Zahlen, „.“, „_“ und „-“ sind erlaubt"],
    ["username with markup", { u: "<img/src=x>", e: "ok@e2e.test", p: "Long-enough-1" }, "Nur Buchstaben, Zahlen, „.“, „_“ und „-“ sind erlaubt"],
    ["password too short", { u: "validname", e: "ok@e2e.test", p: "short7!" }, "Das Passwort muss mindestens 8 Zeichen lang sein"],
    ["password too long", { u: "validname", e: "ok@e2e.test", p: "x".repeat(129) }, "Das Passwort darf höchstens 128 Zeichen lang sein"],
  ];
  for (const [what, v, expected] of cases) {
    await test("auth", `register: ${what} → "${expected}"`, async () => {
      focus = page;
      await anon.goto("/auth", 800);
      await openTab("Registrieren");
      await field("Benutzername").fill(v.u);
      await field("E-Mail").fill(v.e);
      await field("Passwort").fill(v.p);
      await submit("Registrieren");
      await page.waitForTimeout(400);
      const msgs = await visibleErrorText(page);
      assert.ok(msgs.includes(expected), JSON.stringify(msgs));
      assert.equal(anon.calls("POST", /^\/api\/register$/).length, 0, "request was sent despite the client error");
    });
  }

  await test("auth", "register: empty submit shows a message for every field", async () => {
    focus = page;
    await anon.goto("/auth", 800);
    await openTab("Registrieren");
    await submit("Registrieren");
    await page.waitForTimeout(400);
    const msgs = await visibleErrorText(page);
    assert.ok(msgs.includes("Der Benutzername muss mindestens 3 Zeichen lang sein"), JSON.stringify(msgs));
    assert.ok(msgs.includes("Bitte gib eine gültige E-Mail-Adresse ein") || (await invalidInputs(page)).length > 0, JSON.stringify(msgs));
    assert.ok(msgs.includes("Das Passwort muss mindestens 8 Zeichen lang sein"), JSON.stringify(msgs));
  });

  await test("auth", "register: invalid e-mail is rejected before sending", async () => {
    focus = page;
    for (const email of ["no-at-sign", "a@b", "two@@e2e.test"]) {
      await field("Benutzername").fill("validname");
      await field("E-Mail").fill(email);
      await field("Passwort").fill("Long-enough-1");
      await submit("Registrieren");
      await page.waitForTimeout(400);
      const msgs = await visibleErrorText(page);
      const blocked = msgs.includes("Bitte gib eine gültige E-Mail-Adresse ein") || (await invalidInputs(page)).includes("email");
      assert.ok(blocked, `${email}: ${JSON.stringify(msgs)}`);
    }
    assert.equal(anon.calls("POST", /^\/api\/register$/).length, 0);
  });

  await test("auth", "register: taken username shows the translated server message", async () => {
    focus = page;
    await anon.clearToasts();
    await field("Benutzername").fill(OWNER);
    await field("E-Mail").fill(`taken_${RUN}@e2e.test`);
    await field("Passwort").fill("Long-enough-1");
    await submit("Registrieren");
    await page.waitForTimeout(1500);
    const toasts = await anon.toasts();
    assert.ok(toasts.some((t) => t.includes("Registrierung fehlgeschlagen")), JSON.stringify(toasts));
    assert.ok(toasts.some((t) => /Benutzername (existiert bereits|ist bereits vergeben)/.test(t)), JSON.stringify(toasts));
    assertReadable(toasts, "register taken");
  });

  await test("auth", "register: fast double click on submit sends one request", async () => {
    focus = page;
    await anon.goto("/auth", 800);
    await openTab("Registrieren");
    const name = `uireg_${RUN}`;
    await field("Benutzername").fill(name);
    await field("E-Mail").fill(`${name}@e2e.test`);
    await field("Passwort").fill(PW);
    const btn = page.locator("form").getByRole("button", { name: "Registrieren", exact: true });
    const before = anon.calls("POST", /^\/api\/register$/).length;
    await anon.clearToasts();
    await doubleClick(btn);
    await page.waitForTimeout(2500);
    const calls = anon.calls("POST", /^\/api\/register$/).slice(before);
    assert.equal(calls.length, 1, `register requests: ${calls.map((c) => `${c.status} ${c.response}`).join(" | ")}; toasts: ${JSON.stringify(await anon.toasts())}`);
  });

  await test("auth", "register: lands on the feed, onboarding bio dialog saves markup as text", async () => {
    focus = page;
    assert.equal(new URL(page.url()).pathname, "/", page.url());
    const dlg = page.getByRole("dialog");
    await dlg.locator("textarea").fill(`Hallo ${XSS}`);
    await dlg.getByRole("button").filter({ hasText: /Speichern|Bio/ }).first().click();
    await page.waitForTimeout(1500);
    await anon.goto("/profile", 1500);
    await assertShowsText(page, XSS_IMG, "own profile bio");
    await assertNoXss(page, "/profile after onboarding bio");
  });

  await test("auth", "login: fast double click sends one request", async () => {
    focus = page;
    await anon.api("POST", "/api/logout");
    await anon.goto("/auth", 800);
    await field("Benutzername").fill(`uireg_${RUN}`);
    await field("Passwort").fill(PW);
    const before = anon.calls("POST", /^\/api\/login$/).length;
    await doubleClick(page.locator("form").getByRole("button", { name: "Anmelden", exact: true }));
    await page.waitForTimeout(2000);
    const calls = anon.calls("POST", /^\/api\/login$/).slice(before);
    assert.equal(calls.length, 1, `login requests: ${calls.map((c) => `${c.status} ${c.response.slice(0, 80)}`).join(" | ")}; toasts: ${JSON.stringify(await anon.toasts())}`);
    assert.equal(new URL(page.url()).pathname, "/");
  });

  if (anon) {
    await test("auth", "no uncaught JS errors on the auth flows", async () => assert.deepEqual(anon.errors, []));
    await anon.close();
  }
}


// ================================================================ POSTS: discussion / news / entertainment
const created = {}; // ids shared with later sections
{
  const want = !ONLY.length || ONLY.includes("post") || ONLY.includes("comment") || ONLY.includes("report");
  const postCreated = (s) => s.calls("POST", /^\/api\/posts$/).filter((c) => c.status === 201);

  if (want) await test("post", "discussion: empty submit shows a message and creates nothing", async () => {
    const s = await fresh("pe");
    focus = s.page;
    await s.goto("/post/discussions");
    await s.page.getByRole("button", { name: "Diskussion posten" }).click();
    await s.page.waitForTimeout(1500);
    const shown = [...(await visibleErrorText(s.page)), ...(await s.toasts())];
    const sent = s.calls("POST", /^\/api\/posts$/);
    assert.equal(postCreated(s).length, 0, "an empty post was created");
    assert.ok(shown.length > 0, `nothing is shown to the user (request: ${sent.map((c) => `${c.status} ${c.response}`).join(" | ") || "none"})`);
    assertReadable(shown, "empty discussion");
    await s.close();
  });

  if (want) await test("post", "news: empty submit is blocked and creates no post", async () => {
    const s = await fresh("pn");
    focus = s.page;
    await s.goto("/post/news");
    const btn = s.page.getByRole("button", { name: "Artikel veröffentlichen" });
    if (await btn.isEnabled()) await btn.click();
    await s.page.waitForTimeout(1500);
    const made = postCreated(s);
    assert.equal(made.length, 0, `an empty news post was created: ${made.map((c) => c.response.slice(0, 160)).join(" | ")}`);
    await s.close();
  });

  if (want) await test("post", "discussion with XSS title/content: created once on fast double click, rendered as text everywhere", async () => {
    const s = await fresh("px");
    created.author = s;
    focus = s.page;
    await s.goto("/post/discussions");
    await s.page.getByLabel("Titel").fill(`Titel ${XSS}`);
    await s.page.getByLabel("Inhalt").fill(`Inhalt ${XSS} ${JS_URL}`);
    await doubleClick(s.page.getByRole("button", { name: "Diskussion posten" }));
    await s.page.waitForTimeout(2500);
    const sent = s.calls("POST", /^\/api\/posts$/);
    const ok = postCreated(s);
    assert.ok(ok.length >= 1, `post not created: ${sent.map((c) => `${c.status} ${c.response}`).join(" | ")}`);
    created.postId = JSON.parse(ok[0].response).id;
    created.postTitle = `Titel ${XSS}`;
    assert.equal(new URL(s.page.url()).pathname, "/feed/discussions");
    await assertNoXss(s.page, "/feed/discussions");
    for (const p of [`/posts/${created.postId}`, "/profile"]) {
      await s.goto(p, 1800);
      await assertNoXss(s.page, p);
    }
    await s.goto(`/posts/${created.postId}`, 1500);
    await assertShowsText(s.page, `Titel ${XSS}`, "post view title");
    assert.equal(sent.length, 1, `fast double click sent ${sent.length} create requests: ${sent.map((c) => `${c.status} ${c.response.slice(0, 80)}`).join(" | ")}; toasts ${JSON.stringify(await s.toasts())}`);
  });

  if (want) await test("post", "discussion: second post inside the cooldown shows the translated wait message", async () => {
    const s = created.author;
    assert.ok(s, "needs the previous test");
    focus = s.page;
    await s.clearToasts();
    await s.goto("/post/discussions");
    await s.page.getByLabel("Titel").fill("Zweiter Beitrag");
    await s.page.getByLabel("Inhalt").fill("Gleich danach");
    await s.page.getByRole("button", { name: "Diskussion posten" }).click();
    await s.page.waitForTimeout(2000);
    const last = s.calls("POST", /^\/api\/posts$/).at(-1);
    assert.equal(last.status, 429, `${last.status} ${last.response}`);
    const toasts = await s.toasts();
    assert.ok(toasts.some((t) => /Bitte warte \d+ Sekunden/.test(t)), `no cooldown message shown: ${JSON.stringify(toasts)}`);
    assertReadable(toasts, "cooldown");
  });

  if (want) await test("post", "news with image: uploads, redirects to the media feed and the image loads", async () => {
    const s = await fresh("pm");
    focus = s.page;
    await s.goto("/post/news");
    await s.page.getByLabel("Schlagzeile").fill(`News ${XSS_IMG}`);
    await s.page.getByLabel("Artikelinhalt").fill(`Bild-News ${XSS_SCRIPT}`);
    await s.page.locator('input[type="file"]').setInputFiles({ name: "pic.png", mimeType: "image/png", buffer: pngImage });
    await s.page.waitForTimeout(300);
    await s.page.getByRole("button", { name: "Artikel veröffentlichen" }).click();
    await s.page.waitForTimeout(3000);
    const ok = postCreated(s);
    assert.equal(ok.length, 1, s.calls("POST", /^\/api\/posts$/).map((c) => `${c.status} ${c.response}`).join(" | "));
    const post = JSON.parse(ok[0].response);
    assert.ok(post.mediaUrl, "no mediaUrl stored");
    assert.equal(new URL(s.page.url()).pathname, "/feed/media");
    await assertNoXss(s.page, "/feed/media");
    await s.goto(`/posts/${post.id}`, 2000);
    const img = await s.page.evaluate((m) => { const i = [...document.images].find((x) => x.src.includes(m)); return i ? i.naturalWidth : -1; }, post.mediaUrl);
    assert.ok(img > 0, `post image not loaded (${img})`);
    await assertNoXss(s.page, `/posts/${post.id}`);
    created.mediaAuthor = s;
    created.mediaPostId = post.id;
  });

  if (want) await test("post", "entertainment with a fake image: translated error, no post", async () => {
    const s = await fresh("pf");
    focus = s.page;
    await s.goto("/post/entertainment");
    await s.page.getByLabel("Titel").fill("Kaputtes Bild");
    await s.page.getByLabel("Inhalt").fill("Das ist kein PNG");
    await s.page.locator('input[type="file"]').setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: fakePng });
    await s.page.getByRole("button", { name: "Teilen", exact: true }).click();
    await s.page.waitForTimeout(2500);
    assert.equal(postCreated(s).length, 0);
    const toasts = await s.toasts();
    assert.ok(toasts.some((t) => /Dateiinhalt passt nicht|Dateisignatur/.test(t)), JSON.stringify(toasts));
    assertReadable(toasts, "fake image");
    await s.close();
  });

  if (want) await test("post", "entertainment: 100 000-character title is limited or rejected with a message", async () => {
    const s = await fresh("pl");
    focus = s.page;
    await s.goto("/post/entertainment");
    const title = s.page.getByLabel("Titel");
    await title.fill("T".repeat(100_000));
    const kept = (await title.inputValue()).length;
    await s.page.getByLabel("Inhalt").fill("Sehr langer Titel");
    await s.page.getByRole("button", { name: "Teilen", exact: true }).click();
    await s.page.waitForTimeout(2500);
    const made = postCreated(s);
    const shown = [...(await visibleErrorText(s.page)), ...(await s.toasts())].filter((t) => !/erstellt|geteilt/.test(t));
    const stored = made.length ? JSON.parse(made[0].response).title.length : 0;
    assert.ok(kept < 100_000 || (made.length === 0 && shown.length > 0), `input kept ${kept} chars, post created with a ${stored}-char title, messages: ${JSON.stringify(shown)}`);
    await s.close();
  });
}

// ================================================================ COMMENTS
if (!ONLY.length || ONLY.includes("comment")) {
  const author = created.author;
  const s = await fresh("cm");
  const page = s.page;
  const input = () => page.locator("#comment-input");
  const sendBtn = () => page.getByRole("button", { name: "Senden", exact: true });
  const commentCalls = () => s.calls("POST", /^\/api\/comments$/);

  await test("comment", "empty / whitespace comment sends nothing", async () => {
    focus = page;
    assert.ok(created.postId, "needs the post from the post section");
    await s.goto(`/posts/${created.postId}`, 1800);
    await sendBtn().click();
    await input().fill("    ");
    await input().press("Enter");
    await sendBtn().click();
    await page.waitForTimeout(800);
    assert.equal(commentCalls().length, 0);
  });

  await test("comment", "XSS comment is shown as text on the post and in the author's notifications", async () => {
    focus = page;
    await input().fill(`Kommentar ${XSS}`);
    await sendBtn().click();
    await page.waitForTimeout(2000);
    assert.equal(commentCalls().at(-1)?.status, 201, JSON.stringify(commentCalls().map((c) => c.status)));
    await assertShowsText(page, `Kommentar ${XSS}`, "post view");
    await assertNoXss(page, "post view with comment");
    focus = author.page;
    await author.goto("/notifications", 2000);
    await assertNoXss(author.page, "author /notifications");
    await author.goto(`/posts/${created.postId}`, 1500);
    await assertNoXss(author.page, "author's post view");
  });

  await test("comment", "Enter pressed twice 80 ms apart creates one comment", async () => {
    focus = page;
    const before = commentCalls().length;
    await input().fill(`Doppelt ${RUN}`);
    await doubleEnter(input());
    await page.waitForTimeout(2000);
    assert.equal(commentCalls().length - before, 1);
    const count = await page.evaluate((t) => document.body.innerText.split(t).length - 1, `Doppelt ${RUN}`);
    assert.equal(count, 1, `comment shown ${count} times`);
  });

  await test("comment", "comment over 10 000 characters: limited or a message is shown and the text is kept", async () => {
    focus = page;
    await s.clearToasts();
    await input().fill("K".repeat(10_050));
    const kept = (await input().inputValue()).length;
    await sendBtn().click();
    await page.waitForTimeout(2000);
    const last = commentCalls().at(-1);
    const toasts = await s.toasts();
    const left = (await input().inputValue()).length;
    assert.ok(kept <= 10_000 || (toasts.some((t) => /höchstens|zu lang/i.test(t)) && left > 0),
      `input accepted ${kept} chars, server answered ${last?.status} ${last?.response?.slice(0, 120)}, toasts ${JSON.stringify(toasts)}, text left in the box: ${left} chars`);
    assertReadable(toasts, "long comment");
  });

  await test("comment", "no uncaught JS errors (commenter and author)", async () => assert.deepEqual([...s.errors, ...(author?.errors ?? [])], []));
  created.commenter = s;
}


// ================================================================ PROFILE: edit dialog, images, password
if (!ONLY.length || ONLY.includes("profile")) {
  const s = await fresh("pr");
  const page = s.page;
  const dlg = () => page.getByRole("dialog");
  const open = async () => {
    await s.goto("/profile", 1500);
    await page.getByRole("button", { name: /Profil bearbeiten/ }).first().click();
    await page.waitForTimeout(700);
  };
  const save = () => dlg().getByRole("button", { name: "Speichern" }).click();
  const patches = () => s.calls("PATCH", /^\/api\/profile$/);

  await test("profile", "XSS in display name, bio, location and a javascript: website are rendered harmlessly", async () => {
    focus = page;
    await open();
    await dlg().getByLabel("Anzeigename").fill(`Name ${XSS_IMG}`);
    await dlg().getByLabel("Bio").fill(`Bio ${XSS}`);
    await dlg().getByLabel("Standort").fill(`Ort ${XSS_SCRIPT}`);
    await dlg().getByLabel("Website").fill(JS_URL);
    // A javascript: website is refused (by the form or the server, UI-12/ATK-XSS-2) with a message, the rest is saved
    const before = patches().length;
    await save();
    await page.waitForTimeout(2000);
    const refused = patches().slice(before);
    const websiteMsgs = [...(await visibleErrorText(page)), ...(await s.toasts())].filter((t) => /Website|URL/i.test(t));
    assert.ok(refused.every((c) => c.status >= 400) && websiteMsgs.length > 0, `javascript: website: ${refused.map((c) => c.status)} ${JSON.stringify(websiteMsgs)}`);
    if (await dlg().count() === 0) {
      await open();
      await dlg().getByLabel("Anzeigename").fill(`Name ${XSS_IMG}`);
      await dlg().getByLabel("Bio").fill(`Bio ${XSS}`);
      await dlg().getByLabel("Standort").fill(`Ort ${XSS_SCRIPT}`);
    }
    await dlg().getByLabel("Website").fill("");
    await save();
    await page.waitForTimeout(2000);
    assert.equal(patches().at(-1)?.status, 200, patches().map((c) => `${c.status} ${c.response}`).join(" | "));
    await s.goto("/profile", 1800);
    await assertShowsText(page, `Bio ${XSS}`, "/profile bio");
    await assertNoXss(page, "/profile");
    const website = await page.evaluate(() => [...document.querySelectorAll("main a[href]")].map((a) => a.href).filter((h) => h.includes("__xss")));
    assert.ok(website.every((h) => /^https?:/.test(h)), `website link: ${website}`);
    const viewer = created.commenter ?? (await fresh("pv"));
    focus = viewer.page;
    await viewer.goto(`/users/${s.user}`, 1800);
    await assertShowsText(viewer.page, `Name ${XSS_IMG}`, "public profile display name");
    await assertNoXss(viewer.page, `/users/${s.user}`);
    await viewer.page.getByRole("link").filter({ hasText: "__xss" }).first().click({ timeout: 3000 }).catch(() => {});
    await viewer.page.waitForTimeout(800);
    assert.equal(await viewer.page.evaluate(() => window.__xss), undefined, "clicking the website link ran script");
  });

  await test("profile", "bio longer than the stated 500 characters is limited or rejected", async () => {
    focus = page;
    await open();
    const bio = dlg().getByLabel("Bio");
    await bio.fill("B".repeat(700));
    const kept = (await bio.inputValue()).length;
    await save();
    await page.waitForTimeout(1800);
    const last = patches().at(-1);
    const msgs = [...(await visibleErrorText(page)), ...(await s.toasts())].filter((t) => /Bio|Zeichen/.test(t));
    assert.ok(kept <= 500 || (last?.status >= 400 && msgs.length > 0) || (last === undefined && msgs.length > 0),
      `the dialog says "Max. 500 Zeichen" but kept ${kept} chars and the server answered ${last?.status}; messages ${JSON.stringify(msgs)}`);
    await page.keyboard.press("Escape");
  });

  await test("profile", "display name of 5 000 characters is limited or rejected", async () => {
    focus = page;
    await open();
    const f = dlg().getByLabel("Anzeigename");
    await f.fill("N".repeat(5000));
    const kept = (await f.inputValue()).length;
    await save();
    await page.waitForTimeout(1800);
    const last = patches().at(-1);
    assert.ok(kept < 5000 || last?.status >= 400, `kept ${kept} chars, server answered ${last?.status}`);
    await page.keyboard.press("Escape");
  });

  await test("profile", "website that is not a URL is rejected with a message", async () => {
    focus = page;
    await open();
    await dlg().getByLabel("Website").fill("das ist keine url");
    const before = patches().length;
    await save();
    await page.waitForTimeout(1800);
    // only a request sent by THIS save counts (the previous tests saved successfully)
    const last = patches().slice(before).at(-1);
    const msgs = [...(await visibleErrorText(page)), ...(await s.toasts())].filter((t) => /Website|URL/i.test(t));
    assert.ok(msgs.length > 0 && (last === undefined || last.status >= 400), `saved with status ${last?.status}; messages ${JSON.stringify(msgs)}`);
    await page.keyboard.press("Escape");
  });

  await test("profile", "avatar upload: valid image previews, fake image shows a translated error", async () => {
    focus = page;
    await open();
    await dlg().getByRole("tab", { name: "Bilder" }).click();
    await page.setInputFiles("#avatar-upload", { name: "a.png", mimeType: "image/png", buffer: pngImage });
    await page.waitForTimeout(2500);
    const prev = await page.evaluate(() => { const i = document.querySelector('[role="dialog"] img[alt="Profilbild-Vorschau"]'); return i ? i.naturalWidth : -1; });
    assert.ok(prev > 0, `preview width ${prev}`);
    await s.clearToasts();
    await page.setInputFiles("#avatar-upload", { name: "b.png", mimeType: "image/png", buffer: fakePng });
    await page.waitForTimeout(2000);
    const toasts = await s.toasts();
    assert.ok(toasts.some((t) => /Bild/.test(t)), JSON.stringify(toasts));
    assertReadable(toasts, "fake avatar");
  });

  await test("profile", "a password change form is reachable from the profile", async () => {
    focus = page;
    await open();
    const tabs = await dlg().getByRole("tab").allInnerTexts();
    let pwFields = 0;
    for (const tab of tabs) {
      await dlg().getByRole("tab", { name: tab }).click();
      await page.waitForTimeout(300);
      pwFields += await dlg().locator('input[type="password"]').count();
    }
    await page.keyboard.press("Escape");
    assert.ok(pwFields >= 2, `no password fields in any tab of the profile dialog (${tabs.join(", ")}); PATCH /api/profile/password has no UI`);
  });

  await test("profile", "no uncaught JS errors on the profile flows", async () => assert.deepEqual(s.errors, []));
  await s.close();
}


// ================================================================ COMMUNITY: create, page, mod panel
if (!ONLY.length || ONLY.includes("community")) {
  const o = await owner();
  const page = o.page;
  // Requests the client should never have sent are answered here, so the test leaves no junk communities behind.
  const blocked = [];
  await page.route(`${BASE}/api/communities`, (r) => {
    const req = r.request();
    if (req.method() === "POST") {
      let body = {};
      try { body = JSON.parse(req.postData() || "{}"); } catch { /* not JSON */ }
      if (!String(body.name ?? "").trim() || String(body.name).length > 200) {
        blocked.push(body);
        return r.fulfill({ status: 418, contentType: "application/json", body: JSON.stringify({ error: "blocked by test" }) });
      }
    }
    return r.fallback();
  });
  const create = async (v) => {
    await o.goto("/create-community", 1200);
    if (v.name !== undefined) await page.getByLabel("Community-Name").fill(v.name);
    if (v.description !== undefined) await page.getByLabel("Beschreibung").fill(v.description);
    if (v.imageUrl !== undefined) await page.getByLabel("Bild-URL (optional)").fill(v.imageUrl);
    if (v.private) await page.getByLabel("Private Community").check();
    const btn = page.getByRole("button", { name: "Community erstellen" });
    if (v.dbl) await doubleClick(btn); else await btn.click();
    await page.waitForTimeout(2500);
  };
  const posts = () => o.calls("POST", /^\/api\/communities$/);
  const name = `Kom ${XSS_IMG} ${RUN}`;

  await test("community", "empty name: client shows a message and sends nothing", async () => {
    focus = page;
    await create({ name: "", description: "" });
    const msgs = await visibleErrorText(page);
    assert.equal(blocked.length, 0, `a create request with an empty name was sent (${JSON.stringify(blocked[0])}); messages ${JSON.stringify(msgs)}`);
    assert.ok(msgs.length > 0, "no message shown");
  });

  await test("community", "1 000-character name is limited or rejected before sending", async () => {
    focus = page;
    const before = blocked.length;
    await create({ name: "N".repeat(1000), description: "lang" });
    const kept = await page.getByLabel("Community-Name").inputValue().catch(() => "");
    assert.ok(blocked.length === before, `the client sent a ${blocked.at(-1)?.name?.length}-char name (input kept ${kept.length})`);
  });

  await test("community", "XSS name/description and javascript: image URL: refused, then one community on fast double click, harmless everywhere", async () => {
    focus = page;
    // A javascript: image URL is refused with a message (by the form or the server, ATK-XSS-1) …
    const tried = posts().length;
    await create({ name, description: `Beschreibung ${XSS}`, imageUrl: JS_URL });
    const refused = posts().slice(tried);
    const urlMsgs = [...(await visibleErrorText(page)), ...(await o.toasts())].filter((t) => /URL|Bild/i.test(t));
    assert.ok(refused.every((c) => c.status >= 400) && urlMsgs.length > 0, `javascript: image URL: ${refused.map((c) => `${c.status} ${c.response.slice(0, 80)}`)} ${JSON.stringify(urlMsgs)}`);
    // … and the community is created once without it
    const before = posts().length;
    await create({ name, description: `Beschreibung ${XSS}`, imageUrl: "", dbl: true });
    const calls = posts().slice(before);
    const ok = calls.filter((c) => c.status === 201);
    assert.ok(ok.length >= 1, calls.map((c) => `${c.status} ${c.response}`).join(" | "));
    created.community = JSON.parse(ok[0].response);
    assert.match(new URL(page.url()).pathname, /^\/c\//);
    await assertShowsText(page, `Beschreibung ${XSS}`, "community page");
    await assertNoXss(page, "community page");
    for (const p of ["/feed/communities", "/mod-panel"]) { await o.goto(p, 1800); await assertNoXss(page, p); }
    const m = await fresh("cv");
    focus = m.page;
    await m.goto(`/c/${created.community.slug}`, 1800);
    await assertNoXss(m.page, "community page as visitor");
    await m.close();
    assert.equal(calls.length, 1, `fast double click sent ${calls.length} requests: ${calls.map((c) => `${c.status} ${c.response.slice(0, 80)}`).join(" | ")}`);
  });

  await test("community", "duplicate name shows the translated server message", async () => {
    focus = page;
    await o.clearToasts();
    await create({ name, description: "noch einmal" });
    const toasts = await o.toasts();
    assert.ok(toasts.some((t) => t.includes("Eine Community mit diesem Namen gibt es bereits")), JSON.stringify(toasts));
    assertReadable(toasts, "duplicate community");
  });

  await test("community", "private community can be created", async () => {
    focus = page;
    await o.clearToasts();
    const before = posts().length;
    await create({ name: `Privat ${RUN}`, description: "privat", private: true });
    const last = posts().slice(before).at(-1);
    assert.equal(last?.status, 201, `${last?.status} ${last?.response}; toasts ${JSON.stringify(await o.toasts())}`);
    assertReadable(await o.toasts(), "private community");
  });

  await test("community", "user below 200 reputation sees the restriction instead of the form", async () => {
    const u = await fresh("ck");
    focus = u.page;
    await u.goto("/create-community", 1200);
    await assertShowsText(u.page, "Du brauchst mindestens 200 Reputationspunkte", "restriction");
    assert.equal(await u.page.getByLabel("Community-Name").count(), 0);
    await u.close();
  });

  // ---- mod panel dialogs on the community created above
  let member;
  await test("community", "mod panel: invite by a non-numeric user id shows a readable error", async () => {
    focus = page;
    assert.ok(created.community, "needs the community");
    await o.goto("/mod-panel", 1500);
    await page.getByRole("button", { name: created.community.name, exact: true }).click();
    await page.waitForTimeout(800);
    await page.getByRole("tab", { name: "Mitglieder" }).click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Benutzer einladen" }).click();
    await page.waitForTimeout(500);
    await o.clearToasts();
    await page.getByRole("dialog").getByPlaceholder("Benutzer-ID manuell eingeben").fill("abc");
    await page.getByRole("dialog").getByRole("button", { name: "Bestätigen" }).click();
    await page.waitForTimeout(1500);
    const toasts = await o.toasts();
    const sent = o.calls("POST", /\/invite$/).at(-1);
    assert.ok(!sent || toasts.length > 0, `request ${sent?.body} → ${sent?.status} without message`);
    assertReadable(toasts, "invite abc");
  });

  await test("community", "mod panel: user search encodes the query (& and #)", async () => {
    focus = page;
    const box = page.getByRole("dialog").getByRole("textbox").first();
    await box.fill("a&b#c");
    await page.waitForTimeout(1200);
    const q = o.requests.filter((r) => r.url.includes("/api/users/search")).at(-1);
    assert.ok(q, "no search request");
    assert.equal(new URL(q.url).searchParams.get("q"), "a&b#c", `request URL ${q.url}`);
    await page.keyboard.press("Escape");
  });

  await test("community", "mod panel: ban reason is capped at 500 chars and XSS reason is shown as text", async () => {
    focus = page;
    member = await fresh("cb");
    await member.api("POST", `/api/communities/${created.community.id}/join`);
    await o.goto("/mod-panel", 1500);
    await page.getByRole("button", { name: created.community.name, exact: true }).click();
    await page.waitForTimeout(800);
    await page.getByRole("tab", { name: "Mitglieder" }).click();
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: `Aktionen für ${member.user}` }).click();
    await page.waitForTimeout(400);
    await page.getByRole("menuitem", { name: /Sperren/ }).click();
    await page.waitForTimeout(500);
    const reason = page.getByLabel("Grund");
    await reason.fill("R".repeat(600));
    assert.ok((await reason.inputValue()).length <= 500, "maxLength not honoured");
    await reason.fill(`Grund ${XSS}`);
    await page.getByRole("dialog").getByRole("button", { name: /verbannen|sperren/i }).click();
    await page.waitForTimeout(1500);
    const row = (await page.locator("tbody tr").allInnerTexts()).find((r) => r.includes(member.user)) || "";
    assert.ok(row.includes(`Grund ${XSS_IMG}`), row);
    await assertNoXss(page, "mod panel member list");
  });

  await test("community", "no uncaught JS errors (owner)", async () => assert.deepEqual(o.errors, []));
  await member?.close();
  await o.close();
}

// ================================================================ CHAT
if (!ONLY.length || ONLY.includes("chat")) {
  const a = await fresh("ha");
  const b = await fresh("hb");
  await a.api("POST", `/api/follow/${b.id}`);
  await b.api("POST", `/api/follow/${a.id}`);
  const page = a.page;
  const box = () => page.getByPlaceholder("Teile deine Gedanken…");
  const sends = () => a.calls("POST", /^\/api\/messages$/);

  await test("chat", "XSS message is shown as text to sender and receiver", async () => {
    focus = page;
    await a.goto(`/chat/${b.id}`, 1800);
    await box().fill(`Hallo ${XSS}`);
    await page.getByRole("button", { name: "Senden" }).click();
    await page.waitForTimeout(2000);
    assert.equal(sends().at(-1)?.status, 201, sends().map((c) => `${c.status} ${c.response}`).join(" | "));
    await assertShowsText(page, `Hallo ${XSS}`, "sender chat");
    await assertNoXss(page, "sender chat");
    focus = b.page;
    await b.goto(`/chat/${a.id}`, 1800);
    await assertShowsText(b.page, `Hallo ${XSS}`, "receiver chat");
    await assertNoXss(b.page, "receiver chat");
    await b.goto("/notifications", 1500);
    await assertNoXss(b.page, "receiver notifications");
  });

  await test("chat", "Enter pressed twice 80 ms apart sends one message", async () => {
    focus = page;
    const before = sends().length;
    await box().fill(`Einmal ${RUN}`);
    await doubleEnter(box());
    await page.waitForTimeout(2500);
    const n = sends().length - before;
    const shown = await page.evaluate((t) => document.body.innerText.split(t).length - 1, `Einmal ${RUN}`);
    assert.equal(n, 1, `${n} send requests, message shown ${shown} times`);
  });

  await test("chat", "100 000-character message is limited or rejected with a message", async () => {
    focus = page;
    await a.clearToasts();
    await box().fill("M".repeat(100_000));
    const kept = (await box().inputValue()).length;
    await page.getByRole("button", { name: "Senden" }).click();
    await page.waitForTimeout(2500);
    const last = sends().at(-1);
    assert.ok(kept < 100_000 || last.status >= 400, `input kept ${kept} chars and the server stored it (${last.status})`);
    assertReadable(await a.toasts(), "long chat message");
  });

  await test("chat", "message to a non-mutual user shows the translated reason", async () => {
    const c = await fresh("hc");
    focus = page;
    await a.clearToasts();
    await a.goto(`/chat/${c.id}`, 1500);
    if (await box().count()) {
      await box().fill("Hallo Fremder");
      await page.getByRole("button", { name: "Senden" }).click();
      await page.waitForTimeout(1800);
      const toasts = await a.toasts();
      assert.ok(toasts.some((t) => t.includes("Du kannst nur Benutzern schreiben")), JSON.stringify(toasts));
      assertReadable(toasts, "non-mutual chat");
    }
    await c.close();
  });

  await test("chat", "no uncaught JS errors (both chat users)", async () => assert.deepEqual([...a.errors, ...b.errors], []));
  await a.close();
  await b.close();
}


// ================================================================ TICKETS: create, comment, status
if (!ONLY.length || ONLY.includes("ticket")) {
  const u = await fresh("tk");
  const o = await owner();
  const page = u.page;
  const creates = () => u.calls("POST", /^\/api\/tickets$/);
  const fill = async (v) => {
    await u.goto("/tickets/new", 1200);
    const inputs = page.locator("form input:not([type=url])");
    if (v.title !== undefined) await inputs.first().fill(v.title);
    if (v.description !== undefined) await page.locator("form textarea").fill(v.description);
    if (v.url !== undefined) await page.locator('form input[type="url"]').fill(v.url);
  };
  const submit = (dbl) => (dbl ? doubleClick(page.getByRole("button", { name: "Ticket erstellen" })) : page.getByRole("button", { name: "Ticket erstellen" }).click());
  const longDesc = `Beschreibung ${XSS} `.padEnd(80, "x");
  const ticketIds = [];

  await test("ticket", "empty submit is blocked (native required or message) and sends nothing", async () => {
    focus = page;
    await fill({});
    await submit();
    await page.waitForTimeout(800);
    const blocked = (await invalidInputs(page)).length > 0 || (await u.toasts()).length > 0;
    assert.ok(blocked, "no feedback");
    assert.equal(creates().length, 0);
  });

  await test("ticket", "title shorter than 10 characters shows the German message", async () => {
    focus = page;
    await fill({ title: "Zu kurz", description: longDesc });
    await submit();
    await page.waitForTimeout(800);
    const toasts = await u.toasts();
    assert.ok(toasts.some((t) => t.includes("Titel muss mindestens 10 Zeichen haben")), JSON.stringify(toasts));
    assert.equal(creates().length, 0);
  });

  await test("ticket", "description shorter than the server minimum (50) is explained before or by the server", async () => {
    focus = page;
    await u.clearToasts();
    await fill({ title: "Ein ausreichend langer Titel", description: "Nur dreißig Zeichen lang hier." });
    await submit();
    await page.waitForTimeout(1500);
    const toasts = await u.toasts();
    assert.ok(toasts.some((t) => /mindestens 50 Zeichen/.test(t)), JSON.stringify(toasts));
    assertReadable(toasts, "short description");
  });

  await test("ticket", "title over 200 characters is limited or rejected with a message", async () => {
    focus = page;
    await u.clearToasts();
    await fill({ title: "T".repeat(250), description: longDesc });
    await submit();
    await page.waitForTimeout(1500);
    const toasts = await u.toasts();
    const ok = creates().filter((c) => c.status === 201);
    assert.equal(ok.length, 0);
    assert.ok(toasts.some((t) => /200 Zeichen/.test(t)), JSON.stringify(toasts));
    assertReadable(toasts, "long title");
  });

  await test("ticket", "javascript: related URL is rejected by the form", async () => {
    focus = page;
    await u.clearToasts();
    await fill({ title: `Ticket mit Link ${RUN}`, description: longDesc, url: JS_URL });
    await submit();
    await page.waitForTimeout(2000);
    const ok = creates().filter((c) => c.status === 201);
    if (ok.length) ticketIds.push(JSON.parse(ok.at(-1).response).ticket.id);
    assert.equal(ok.length, 0, `ticket created with relatedUrl ${JSON.stringify(ok.length ? JSON.parse(ok.at(-1).response).ticket.relatedUrl : null)}`);
  });

  await test("ticket", "the javascript: related URL is not a clickable javascript link for the owner", async () => {
    // Refused on create (previous test) is the safe outcome: nothing to render. Old data with such a URL is
    // covered by tests/attacks/xss.browser.attack.mjs, which writes it into the database directly.
    if (!ticketIds.length) return;
    focus = o.page;
    await o.goto(`/tickets/${ticketIds[0]}`, 1800);
    const hrefs = await o.page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^\s*javascript:/i.test(h)));
    const link = o.page.locator('a[href^="javascript:"]');
    if (await link.count()) {
      const popup = o.page.waitForEvent("popup", { timeout: 2500 }).catch(() => null);
      await link.first().click({ modifiers: [] }).catch(() => {});
      const pop = await popup;
      await o.page.waitForTimeout(800);
      const ran = (await o.page.evaluate(() => window.__xss)) ?? (pop ? await pop.evaluate(() => window.__xss).catch(() => undefined) : undefined);
      assert.deepEqual(hrefs, [], `ticket detail renders <a href="${hrefs[0]}"> for the owner; clicking it ${ran ? "RAN the script" : "did not run the script in this Chromium (target=_blank)"}`);
    }
    assert.deepEqual(hrefs, []);
  });

  await test("ticket", "XSS title/description: one ticket on fast double click, text on detail, list and admin overview", async () => {
    focus = page;
    const before = creates().length;
    await fill({ title: `Ticket ${XSS_IMG}`, description: longDesc, url: "https://example.org/a" });
    await submit(true);
    await page.waitForTimeout(2500);
    const calls = creates().slice(before);
    const ok = calls.filter((c) => c.status === 201);
    assert.ok(ok.length >= 1, calls.map((c) => `${c.status} ${c.response}`).join(" | "));
    ok.forEach((c) => ticketIds.push(JSON.parse(c.response).ticket.id));
    created.ticketId = JSON.parse(ok[0].response).ticket.id;
    assert.equal(new URL(page.url()).pathname, `/tickets/${created.ticketId}`);
    await assertShowsText(page, `Ticket ${XSS_IMG}`, "ticket detail");
    await assertNoXss(page, "ticket detail");
    await u.goto("/tickets", 1500);
    await assertNoXss(page, "/tickets");
    focus = o.page;
    for (const p of ["/admin/tickets", `/tickets/${created.ticketId}`]) { await o.goto(p, 1800); await assertNoXss(o.page, p); }
    assert.equal(calls.length, 1, `fast double click sent ${calls.length} create requests (${calls.map((c) => c.status)})`);
  });

  await test("ticket", "comment: XSS shown as text, fast double click adds one comment", async () => {
    focus = page;
    await u.goto(`/tickets/${created.ticketId}`, 1500);
    const before = u.calls("POST", /\/comments$/).length;
    await page.locator("textarea").fill(`Antwort ${XSS}`);
    await doubleClick(page.getByRole("button", { name: "Antwort senden" }));
    await page.waitForTimeout(2000);
    const calls = u.calls("POST", /\/comments$/).slice(before);
    assert.equal(calls.length, 1, calls.map((c) => c.status).join(","));
    await assertShowsText(page, `Antwort ${XSS}`, "ticket comment");
    await assertNoXss(page, "ticket with comment");
  });

  await test("ticket", "owner changes the status: translated toast and system entry", async () => {
    focus = o.page;
    await o.goto(`/tickets/${created.ticketId}`, 1500);
    await o.clearToasts();
    await o.page.getByRole("combobox").first().click();
    await o.page.getByRole("option", { name: /Bearbeitung/ }).click();
    await o.page.waitForTimeout(1800);
    const toasts = await o.toasts();
    assert.ok(toasts.some((t) => /Bearbeitung/.test(t)), JSON.stringify(toasts));
    assertReadable(toasts, "status change");
  });

  await test("ticket", "creator closes the ticket; the comment box disappears", async () => {
    focus = page;
    await u.goto(`/tickets/${created.ticketId}`, 1500);
    await page.getByRole("button", { name: "Übertragung beenden" }).click();
    await page.waitForTimeout(1800);
    await u.goto(`/tickets/${created.ticketId}`, 1500);
    assert.equal(await page.locator("textarea").count(), 0, "comment box still shown on a closed ticket");
    assertReadable(await u.toasts(), "close ticket");
  });

  await test("ticket", "after the owner deletes the newest ticket, new tickets can still be created", async () => {
    // Ticket numbers are derived from the newest NOT deleted ticket, so deleting the newest one makes the next
    // number collide with the deleted row. The deleted ticket is restored right after the check (shared server).
    focus = o.page;
    const made = await u.api("POST", "/api/tickets", { title: `Wird gelöscht ${RUN}`, description: longDesc, type: "other", priority: "low" });
    assert.equal(made.status, 201, JSON.stringify(made.body).slice(0, 200));
    const victimId = made.body.ticket.id;
    ticketIds.push(victimId);
    await o.goto(`/tickets/${victimId}`, 1500);
    await o.page.getByRole("button", { name: "Signal stilllegen" }).click();
    await o.page.waitForTimeout(1500);
    let after;
    try {
      focus = page;
      await u.clearToasts();
      await fill({ title: `Nach dem Löschen ${RUN}`, description: longDesc });
      await submit();
      await page.waitForTimeout(2000);
      after = creates().at(-1);
      if (after?.status === 201) ticketIds.push(JSON.parse(after.response).ticket.id);
    } finally {
      await o.api("POST", `/api/tickets/${victimId}/restore`);
    }
    assert.equal(after?.status, 201, `creating a ticket after the delete: ${after?.status} ${after?.response}; toasts ${JSON.stringify(await u.toasts())}`);
  });

  await test("ticket", "no uncaught JS errors (creator and owner)", async () => assert.deepEqual([...u.errors, ...o.errors], []));
  // Tickets are closed, not deleted: deleting breaks the ticket numbering for everybody (see the test above).
  for (const id of ticketIds) await o.api("PATCH", `/api/tickets/${id}`, { status: "closed" });
  await u.close();
  await o.close();
}

// ================================================================ REPORT dialog
if (!ONLY.length || ONLY.includes("report")) {
  const r = await fresh("rp");
  const page = r.page;
  const reports = () => r.calls("POST", /^\/api\/reports$/);
  const openDialog = async () => {
    await r.goto(`/posts/${created.postId}`, 1800);
    await page.getByRole("button", { name: "Melden" }).first().click();
    await page.waitForTimeout(500);
  };
  const dlg = () => page.getByRole("alertdialog");

  await test("report", "submit is disabled until a reason is chosen", async () => {
    focus = page;
    assert.ok(created.postId, "needs the post from the post section");
    await openDialog();
    assert.equal(await dlg().getByRole("button", { name: "Melden" }).isDisabled(), true);
  });

  await test("report", "fast double click sends one report and shows the German confirmation", async () => {
    focus = page;
    await dlg().getByRole("combobox", { name: "Grund" }).click();
    await page.getByRole("option", { name: "Spam" }).click();
    await doubleClick(dlg().getByRole("button", { name: "Melden" }));
    await page.waitForTimeout(1800);
    assert.equal(reports().length, 1, reports().map((c) => c.status).join(","));
    const toasts = await r.toasts();
    assert.ok(toasts.some((t) => t.includes("Meldung gesendet")), JSON.stringify(toasts));
  });

  await test("report", "reporting the same post again is refused with a message", async () => {
    focus = page;
    await r.clearToasts();
    await openDialog();
    await dlg().getByRole("combobox", { name: "Grund" }).click();
    await page.getByRole("option", { name: "Spam" }).click();
    await dlg().getByRole("button", { name: "Melden" }).click();
    await page.waitForTimeout(1800);
    const last = reports().at(-1);
    assert.ok(last.status >= 400, `second report of the same post accepted (${last.status}); toasts ${JSON.stringify(await r.toasts())}`);
    assertReadable(await r.toasts(), "second report");
  });

  await test("report", "no uncaught JS errors", async () => assert.deepEqual(r.errors, []));
  await r.close();
}

// ================================================================ THEME BUILDER: save / import
if (!ONLY.length || ONLY.includes("theme")) {
  const t = await fresh("th");
  const page = t.page;
  const saves = () => t.requests.filter((q) => /\/api\/user\/themes/.test(q.url) && ["POST", "PATCH"].includes(q.method));
  const importFile = async (name, text) => {
    await t.clearToasts();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Importieren" }).click();
    await (await chooser).setFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
    await page.waitForTimeout(1200);
  };

  for (const [what, text] of [
    ["malformed JSON", "{ this is: not json"],
    ["JSON without light/dark", JSON.stringify({ name: "x", colors: [] })],
    ["light/dark of the wrong type", JSON.stringify({ light: 1, dark: "zwei" })],
  ]) {
    await test("theme", `import ${what}: the user is told the file is invalid, nothing crashes`, async () => {
      focus = page;
      await t.goto("/theme-builder", 2000);
      const errsBefore = t.errors.length;
      await importFile("bad.json", text);
      const toasts = await t.toasts();
      assert.deepEqual(t.errors.slice(errsBefore), [], "uncaught error after import");
      assert.ok(toasts.some((x) => /ungültig|fehlgeschlagen|nicht|Fehler/i.test(x)), `no feedback after importing ${what}: ${JSON.stringify(toasts)}`);
    });
  }

  await test("theme", "import of a valid exported theme works and gives feedback", async () => {
    focus = page;
    await t.goto("/theme-builder", 2000);
    const exported = await page.evaluate(() => localStorage.getItem("custom-theme"));
    const valid = exported && exported.includes("light") ? exported : JSON.stringify({ light: { primary: "200 80% 50%" }, dark: { primary: "200 80% 60%" } });
    const errsBefore = t.errors.length;
    await importFile("ok.json", valid);
    assert.deepEqual(t.errors.slice(errsBefore), []);
    const toasts = await t.toasts();
    assert.ok(toasts.some((x) => /importiert/i.test(x)), `no confirmation (key theme_builder.import_success is never used): ${JSON.stringify(toasts)}`);
  });

  await test("theme", "empty theme name cannot be saved", async () => {
    focus = page;
    await t.goto("/theme-builder", 2000);
    await page.getByRole("button", { name: "Neu", exact: true }).click();
    await page.locator("#theme-name").fill("   ");
    const before = saves().length;
    await page.getByRole("button", { name: "Speichern" }).click();
    await page.waitForTimeout(1800);
    const sent = saves().slice(before);
    assert.ok(sent.every((c) => c.status >= 400), `saved with an empty name: ${sent.map((c) => `${c.status} ${c.response.slice(0, 100)}`).join(" | ")}`);
  });

  await test("theme", "XSS theme name: one theme on fast double click, shown as text in the theme list", async () => {
    focus = page;
    await t.goto("/theme-builder", 2000);
    await page.getByRole("button", { name: "Neu", exact: true }).click();
    await page.locator("#theme-name").fill(`Theme ${XSS_IMG}`);
    const before = saves().length;
    await doubleClick(page.getByRole("button", { name: "Speichern" }));
    await page.waitForTimeout(2500);
    const sent = saves().slice(before);
    const list = await t.api("GET", "/api/user/themes");
    const mine = list.body.filter((x) => x.name === `Theme ${XSS_IMG}`);
    await page.getByRole("combobox", { name: "Theme auswählen" }).click().catch(() => page.getByRole("combobox").first().click());
    await page.waitForTimeout(500);
    await assertNoXss(page, "theme select list");
    await page.keyboard.press("Escape");
    assert.equal(mine.length, 1, `${mine.length} themes with that name after a fast double click (requests ${sent.map((c) => c.status)})`);
  });

  await test("theme", "1 000-character theme name is limited or rejected", async () => {
    focus = page;
    await page.getByRole("button", { name: "Neu", exact: true }).click();
    await page.locator("#theme-name").fill("L".repeat(1000));
    const kept = (await page.locator("#theme-name").inputValue()).length;
    const before = saves().length;
    await page.getByRole("button", { name: "Speichern" }).click();
    await page.waitForTimeout(1800);
    const last = saves().slice(before).at(-1);
    assert.ok(kept < 1000 || (last && last.status >= 400), `kept ${kept} chars, server answered ${last?.status}`);
  });

  await test("theme", "no uncaught JS errors in the theme builder", async () => assert.deepEqual(t.errors, []));
  await t.close();
}

// ================================================================ ADMIN forms (owner; only objects created here are changed)
if (!ONLY.length || ONLY.includes("admin")) {
  const o = await owner();
  const page = o.page;

  await test("admin", "admin pages render stored XSS from this run as text (dashboard, reports, logs, activity)", async () => {
    focus = page;
    for (const p of ["/admin", "/admin/users", "/admin/reports", "/admin/logs", "/admin/monitoring/activity", "/admin/bans", "/admin/settings", "/admin/tickets", "/admin/auto-punishments"]) {
      await o.goto(p, 2200);
      await assertNoXss(page, p);
    }
  });

  // Group names are limited to 50 characters (server schema, input maxLength)
  const groupName = `G ${XSS_IMG} ${RUN}`;
  await test("admin", "groups: whitespace-only name is not accepted", async () => {
    focus = page;
    await o.goto("/admin/groups", 1800);
    await page.getByRole("button", { name: "Gruppe erstellen" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("dialog").getByPlaceholder("z. B. Inhaltsmoderation").fill("   ");
    const btn = page.getByRole("dialog").getByRole("button", { name: "Gruppe speichern" });
    const before = o.calls("POST", /^\/api\/admin\/groups$/).length;
    if (await btn.isEnabled()) await btn.click();
    await page.waitForTimeout(1500);
    const made = o.calls("POST", /^\/api\/admin\/groups$/).slice(before).filter((c) => c.status === 201);
    for (const c of made) await o.api("DELETE", `/api/admin/groups/${JSON.parse(c.response).id}`);
    assert.equal(made.length, 0, "a group named '   ' was created");
    await page.keyboard.press("Escape");
  });

  await test("admin", "groups: XSS name shown as text; a duplicate name shows a readable error", async () => {
    focus = page;
    await o.goto("/admin/groups", 1800);
    const createGroup = async () => {
      await page.getByRole("button", { name: "Gruppe erstellen" }).click();
      await page.waitForTimeout(500);
      await page.getByRole("dialog").getByPlaceholder("z. B. Inhaltsmoderation").fill(groupName);
      await page.getByRole("dialog").getByPlaceholder("Wofür ist diese Gruppe zuständig?").fill(`Desc ${XSS_SCRIPT}`);
      await page.getByRole("dialog").getByRole("button", { name: "Gruppe speichern" }).click();
      await page.waitForTimeout(1800);
    };
    await createGroup();
    await assertShowsText(page, groupName, "groups list");
    await assertNoXss(page, "groups list");
    await o.clearToasts();
    await createGroup();
    const last = o.calls("POST", /^\/api\/admin\/groups$/).at(-1);
    const toasts = await o.toasts();
    await page.keyboard.press("Escape");
    const groups = (await o.api("GET", "/api/admin/groups")).body;
    for (const g of groups.filter((g) => g.name === groupName)) await o.api("DELETE", `/api/admin/groups/${g.id}`);
    assert.ok(last.status >= 400 && last.status < 500 && toasts.some((x) => /existiert|bereits|vergeben/i.test(x)),
      `duplicate group: server ${last.status} ${last.response}; toasts ${JSON.stringify(toasts)}`);
    assertReadable(toasts, "duplicate group");
  });

  await test("admin", "auto-punishment: empty submit shows the German validation toast; XSS rule name shown as text", async () => {
    focus = page;
    await o.goto("/admin/auto-punishments", 1800);
    await page.getByRole("button", { name: "Neue Regel" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
    await page.waitForTimeout(800);
    const toasts = await o.toasts();
    assert.ok(toasts.some((x) => x.includes("Name und Begründung der Maßnahme sind erforderlich")), JSON.stringify(toasts));
    const dlg = page.getByRole("dialog");
    await dlg.getByPlaceholder("z. B. Strikte Sperre bei API-Missbrauch").fill(`Regel ${XSS_IMG} ${RUN}`);
    await dlg.getByPlaceholder("Interne Begründung für genau diese Sperre…").fill(`Grund ${XSS_SCRIPT}`);
    // default action is "warn"; the rule is deleted right after the check
    await dlg.getByRole("button", { name: "Speichern" }).click();
    await page.waitForTimeout(1800);
    const rules = (await o.api("GET", "/api/admin/auto-punishments")).body.rules.filter((r) => r.name === `Regel ${XSS_IMG} ${RUN}`);
    for (const rule of rules) await o.api("DELETE", `/api/admin/auto-punishments/rules/${rule.id}`);
    assert.equal(rules.length, 1, `${rules.length} rules created`);
    await o.goto("/admin/auto-punishments", 1500);
    await assertNoXss(page, "auto-punishment list");
  });

  await test("admin", "users: 'Vollständig löschen' asks for confirmation before deleting", async () => {
    focus = page;
    const victim = await fresh("ad");
    await victim.close();
    await o.goto("/admin/users", 2000);
    await page.getByPlaceholder("Das Verse durchsuchen…").fill(victim.user);
    await page.waitForTimeout(800);
    const row = page.locator("tr", { hasText: victim.user }).first();
    await row.locator("button").last().click();
    await page.waitForTimeout(400);
    const dialogsBefore = o.dialogs.length;
    await page.getByRole("menuitem", { name: "Vollständig löschen" }).click();
    await page.waitForTimeout(1500);
    const deleted = o.calls("DELETE", /^\/api\/admin\/users\/\d+$/);
    const confirmShown = o.dialogs.length > dialogsBefore || (await page.getByRole("alertdialog").count()) > 0;
    assert.ok(confirmShown || deleted.length === 0, `account deleted with one click, no confirmation (DELETE → ${deleted.at(-1)?.status})`);
  });

  await test("admin", "no uncaught JS errors on the admin pages", async () => assert.deepEqual(o.errors, []));
  await o.close();
}

// ---------------------------------------------------------------- summary
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} UI form checks passed`);
for (const f of failed) console.log(`  FAIL ${f.area} › ${f.name}`);
process.exitCode = failed.length ? 1 : 0;
