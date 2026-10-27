// Browser check of the public/staff bundle split (exposure area "bundle"):
//  - anonymous visitors and normal users never download staff code or staff translations, and get 404 for them
//  - the owner gets the admin area (staff chunks + staff translations), pages render without raw keys
//  - no request to Google for the default fonts
//  - no raw translation keys on a few pages in de and zh
//
// Run: E2E_BASE_URL=http://127.0.0.1:5174 E2E_ADMIN_USER=routeowner E2E_ADMIN_PASSWORD='…' npx tsx tests/browser/staff-bundle.test.mjs
// Playwright is installed globally (not a repo dependency), so it is loaded from `npm root -g`.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(path.join(execSync("npm root -g").toString().trim(), "noop.js"));
const { chromium } = require("playwright");

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:5063").replace(/\/$/, "");
const OWNER = process.env.E2E_ADMIN_USER ?? "routeowner";
const OWNER_PW = process.env.E2E_ADMIN_PASSWORD ?? "";
const RUN = Date.now().toString(36);
const LOCALES = path.resolve(import.meta.dirname, "../../client/public/locales");

// Top-level groups of every namespace: "nav.bans" or "admin_logs.title" on screen means a missing translation
const groups = new Set();
for (const file of fs.readdirSync(path.join(LOCALES, "en"))) {
  for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(LOCALES, "en", file), "utf8")))) if (k.length > 2) groups.add(k);
}
const RAW_KEY = new RegExp(`(^|[^\\w./@-])((?:staff|analytics|modPerf|staffServer|server|tickets):)?(${[...groups].join("|")})\\.[a-zA-Z_][\\w.]*`, "m");

const browser = await chromium.launch({ args: [`--proxy-server=${process.env.HTTPS_PROXY}`, "--proxy-bypass-list=127.0.0.1;localhost"] });
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`FAIL  ${name}\n      ${e.message.split("\n").join("\n      ")}`);
  }
}

let ipCounter = 10;
async function context(lang = "en") {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": `10.77.${RUN.length}.${ipCounter++}` } });
  await ctx.addInitScript((l) => { try { localStorage.setItem("i18nextLng", l); localStorage.setItem("tutorial-completed", "true"); } catch {} }, lang);
  const page = await ctx.newPage();
  const rec = { requests: [], responses: [], errors: [] };
  page.on("request", (r) => rec.requests.push(r.url()));
  page.on("response", (r) => rec.responses.push({ url: r.url(), status: r.status() }));
  page.on("pageerror", (e) => rec.errors.push(String(e)));
  return { ctx, page, rec };
}

async function login(page, username, password) {
  await page.goto(`${BASE}/auth`);
  const res = await page.evaluate(async ({ username, password }) => {
    const t = await (await fetch("/api/csrf-token")).json();
    const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": t.csrfToken }, body: JSON.stringify({ username, password }) });
    return r.status;
  }, { username, password });
  assert.equal(res, 200, `login ${username}`);
}

async function register(page, username) {
  await page.goto(`${BASE}/auth`);
  const res = await page.evaluate(async ({ username }) => {
    const t = await (await fetch("/api/csrf-token")).json();
    const r = await fetch("/api/register", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": t.csrfToken }, body: JSON.stringify({ username, email: `${username}@example.com`, password: "Staff-Bundle-Check-2026!" }) });
    return r.status;
  }, { username });
  assert.ok(res === 201 || res === 200, `register ${username}: ${res}`);
}

const isStaffUrl = (u) => /\/assets\/staff-/.test(u) || /\/locales\/[^/]+\/(staff|analytics|modPerf|staffServer)\.json/.test(u);
const isGoogle = (u) => /fonts\.(googleapis|gstatic)\.com/.test(u);

/** Staff file URLs a visitor could guess: the staff entry named in the main bundle, plus staff locale files. */
async function staffUrls(page) {
  const main = await page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /\/assets\/index-.*\.js$/.test(s)));
  const src = await (await fetch(main)).text();
  const chunks = [...new Set(src.match(/staff-[\w-]+\.js/g) ?? [])].map((c) => `/assets/${c}`);
  assert.ok(chunks.length >= 1, "main bundle names the staff entry chunk");
  return [...chunks, "/locales/en/staff.json", "/locales/de/staff.json", "/locales/en/staffServer.json", "/locales/en/analytics.json", "/locales/en/modPerf.json"];
}

async function statusOf(page, url) {
  return page.evaluate(async (u) => (await fetch(u, { cache: "no-store" })).status, url);
}

async function visit(page, url) {
  await page.goto(`${BASE}${url}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
}

async function noRawKeys(page, where) {
  const text = await page.evaluate(() => document.body.innerText);
  const m = text.match(RAW_KEY);
  assert.equal(m, null, `${where}: raw key on screen: ${m?.[0]}`);
}

// ---------------------------------------------------------------- anonymous
await test("anonymous: no staff code, no staff texts, no Google fonts; staff files are 404", async () => {
  const { ctx, page, rec } = await context("de");
  await visit(page, "/auth");
  await visit(page, "/admin");
  await visit(page, "/admin/monitoring");
  assert.deepEqual(rec.requests.filter(isStaffUrl), [], "staff files requested");
  assert.deepEqual(rec.requests.filter(isGoogle), [], "Google Fonts requested");
  for (const u of await staffUrls(page)) assert.equal(await statusOf(page, u), 404, u);
  assert.equal(await statusOf(page, "/assets/nope.js"), 404);
  assert.equal(await statusOf(page, "/.env"), 404);
  assert.equal(await statusOf(page, "/something.php"), 404);
  assert.deepEqual(rec.errors, []);
  await ctx.close();
});

// ---------------------------------------------------------------- normal user
await test("normal user: app works, admin area redirects, staff files are 404, no staff downloads", async () => {
  const { ctx, page, rec } = await context("de");
  await register(page, `sb${RUN}`);
  for (const u of ["/feed/media", "/feed/discussions", "/tickets", "/profile", "/notifications", "/admin", "/admin/security/stress-test"]) {
    await visit(page, u);
    await noRawKeys(page, `de ${u}`);
  }
  assert.ok(!page.url().includes("/admin"), `non-staff stays out of /admin (at ${page.url()})`);
  assert.deepEqual(rec.requests.filter(isStaffUrl), [], "staff files requested");
  assert.deepEqual(rec.requests.filter(isGoogle), [], "Google Fonts requested");
  for (const u of await staffUrls(page)) assert.equal(await statusOf(page, u), 404, u);
  assert.deepEqual(rec.errors, []);
  await ctx.close();
});

// ---------------------------------------------------------------- owner
for (const lang of ["de", "zh"]) {
  await test(`owner (${lang}): admin pages load from staff chunks, translated, no raw keys`, async () => {
    const { ctx, page, rec } = await context(lang);
    await login(page, OWNER, OWNER_PW);
    const pages = ["/admin", "/admin/users", "/admin/reports", "/admin/groups", "/admin/tickets", "/admin/bans", "/admin/auto-punishments",
      "/admin/performance", "/admin/monitoring", "/admin/monitoring/activity", "/admin/logs", "/admin/analytics", "/admin/security/stress-test", "/admin/settings"];
    for (const u of pages) {
      await visit(page, u);
      assert.ok(page.url().endsWith(u), `owner stays on ${u} (at ${page.url()})`);
      await noRawKeys(page, `${lang} ${u}`);
    }
    const staffLoaded = rec.responses.filter((r) => /\/assets\/staff-/.test(r.url));
    assert.ok(staffLoaded.length >= 3, "staff chunks loaded");
    assert.deepEqual(staffLoaded.filter((r) => r.status !== 200 && r.status !== 304), [], "staff chunks served");
    assert.ok(rec.responses.some((r) => r.url.includes(`/locales/${lang}/staff.json`) && r.status === 200), "staff translations loaded");
    for (const u of ["/feed/media", "/tickets", "/theme-builder"]) {
      await visit(page, u);
      await noRawKeys(page, `${lang} ${u}`);
    }
    assert.deepEqual(rec.requests.filter(isGoogle), [], "Google Fonts requested");
    assert.deepEqual(rec.errors, []);
    await ctx.close();
  });
}

await test("default fonts are self-hosted (computed font is Instrument Sans, loaded from this origin)", async () => {
  const { ctx, page, rec } = await context("en");
  await visit(page, "/auth");
  const loaded = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")); });
  assert.ok(loaded.includes("Instrument Sans"), `loaded fonts: ${loaded.join(", ")}`);
  assert.ok(rec.requests.some((u) => u.startsWith(BASE) && /instrument-sans.*\.woff2/.test(u)), "woff2 from the app origin");
  assert.deepEqual(rec.requests.filter(isGoogle), []);
  await ctx.close();
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
