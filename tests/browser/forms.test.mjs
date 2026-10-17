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

  await test("auth", "register: double click on submit sends one request", async () => {
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
    await btn.dblclick();
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

  await test("auth", "login: double click sends one request", async () => {
    focus = page;
    await anon.api("POST", "/api/logout");
    await anon.goto("/auth", 800);
    await field("Benutzername").fill(`uireg_${RUN}`);
    await field("Passwort").fill(PW);
    const before = anon.calls("POST", /^\/api\/login$/).length;
    await page.locator("form").getByRole("button", { name: "Anmelden", exact: true }).dblclick();
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

// ---------------------------------------------------------------- summary
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} UI form checks passed`);
for (const f of failed) console.log(`  FAIL ${f.area} › ${f.name}`);
process.exitCode = failed.length ? 1 : 0;
