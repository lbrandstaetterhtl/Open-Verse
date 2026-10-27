// Regression tests for the exposure fixes of area "bundle": staff-only chunks and translations, static 404s,
// self-hosted fonts. Needs a server that serves the built client (dist/public) and has staffAssetGuard mounted.
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { Client, BASE_URL, ADMIN_USER, ADMIN_PASSWORD, newUser } from "./client";

let staffEntry = "";
let mainSrc = "";
let indexHtml = "";

before(async () => {
  indexHtml = await (await fetch(`${BASE_URL}/auth`)).text();
  const main = indexHtml.match(/\/assets\/index-[\w-]+\.js/)?.[0];
  assert.ok(main, "main bundle in index.html");
  mainSrc = await (await fetch(BASE_URL + main)).text();
  staffEntry = `/assets/${mainSrc.match(/staff-[\w-]+\.js/)?.[0]}`;
  assert.match(staffEntry, /^\/assets\/staff-[\w-]+\.js$/, "the main bundle loads the staff area from one staff chunk");
});

const STAFF_LOCALES = ["/locales/en/staff.json", "/locales/de/staff.json", "/locales/zh/staffServer.json", "/locales/en/analytics.json", "/locales/it/modPerf.json"];

async function snapshot(res: Response) {
  const h = Object.fromEntries([...res.headers].filter(([k]) => !["date", "x-request-id", "set-cookie"].includes(k)));
  return { status: res.status, headers: h, body: await res.text() };
}

describe("staff-only files", () => {
  test("anonymous: staff chunk and staff translations answer exactly like an unknown file", async () => {
    const c = new Client();
    const unknown = await snapshot(await c.get("/assets/staff-doesnotexist.js"));
    const unknownPlain = await snapshot(await c.get("/assets/nope.js"));
    assert.equal(unknown.status, 404);
    assert.deepEqual(unknownPlain, unknown, "an unknown staff-* name looks like any unknown file");
    for (const u of [staffEntry, ...STAFF_LOCALES, staffEntry.replace("/staff-", "/%73taff-"), staffEntry.replace("/assets/", "/assets/./"),
      staffEntry.replace("/assets/staff-", "/ASSETS/Staff-")]) {
      assert.deepEqual(await snapshot(await c.get(u)), unknown, u);
    }
  });

  test("normal user: staff files are 404 too", async () => {
    const { client } = await newUser("expbundle");
    for (const u of [staffEntry, ...STAFF_LOCALES]) assert.equal((await client.get(u)).status, 404, u);
  });

  test("owner: staff files are served, never to a shared cache", async () => {
    const owner = new Client();
    assert.equal((await owner.login(ADMIN_USER, ADMIN_PASSWORD)).status, 200);
    const chunk = await owner.get(staffEntry);
    assert.equal(chunk.status, 200);
    assert.match(chunk.headers.get("cache-control") ?? "", /^private\b/);
    assert.match(chunk.headers.get("vary") ?? "", /Cookie/i);
    assert.match(await chunk.text(), /\/admin\/monitoring/, "staff routes live in the staff chunk");
    for (const u of STAFF_LOCALES) {
      const r = await owner.get(u);
      assert.equal(r.status, 200, u);
      assert.match(r.headers.get("cache-control") ?? "", /^private\b/, u);
    }
  });

  test("public translations stay public", async () => {
    for (const u of ["/locales/en/translation.json", "/locales/de/tickets.json", "/locales/zh/server.json"]) {
      const r = await fetch(BASE_URL + u);
      assert.equal(r.status, 200, u);
    }
    const tr = await (await fetch(`${BASE_URL}/locales/en/translation.json`)).text();
    for (const word of ["Stress", "Danger Zone", "admin_logs", "auto_punish", "monitoring", "Drizzle", "SQLite", "Bcrypt"]) {
      assert.ok(!tr.includes(word), `public translation.json contains "${word}"`);
    }
    const srv = await (await fetch(`${BASE_URL}/locales/en/server.json`)).text();
    assert.ok(!srv.includes("Admin request limit"), "admin-only server texts are in staffServer.json");
  });
});

describe("public bundle", () => {
  test("main bundle has no staff API paths, staff routes or permission map", () => {
    for (const s of ["/api/admin", "/api/security", "/api/monitoring", "stress-test", "stress_test", "/admin/bans", "/admin/monitoring",
      "auto_punishment", 'permission:"', "pgTable", "activity_logs", "isShadowBanned"]) {
      assert.ok(!mainSrc.includes(s), `main bundle contains ${s}`);
    }
  });

  test("no debug console output, no source map reference", () => {
    assert.ok(!/console\.(log|debug|info)\(/.test(mainSrc));
    assert.ok(!mainSrc.includes("sourceMappingURL"));
  });

  test("default fonts come from this origin, not Google", () => {
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(indexHtml));
    const css = indexHtml.match(/\/assets\/index-[\w-]+\.css/)?.[0];
    assert.ok(css);
    return fetch(BASE_URL + css).then(async (r) => {
      const text = await r.text();
      assert.match(text, /font-family:\s*"?Instrument Sans/);
      assert.match(text, /\/assets\/instrument-sans-latin-400-normal-[\w-]+\.woff2/);
    });
  });
});

describe("static 404s", () => {
  test("dotfiles, unknown assets and file-like paths are 404, app routes get the app", async () => {
    for (const u of ["/.env", "/.git/config", "/.well-known/security.txt", "/assets/nope.js", "/something.php", "/manifest.json", "/locales/en/nope.json", "/open-verse-icon.png"]) {
      const r = await fetch(BASE_URL + u);
      assert.equal(r.status, 404, u);
      assert.doesNotMatch(r.headers.get("content-type") ?? "", /html/, u);
    }
    for (const u of ["/feed/media", "/admin", "/users/some.name", "/c/x"]) {
      const r = await fetch(BASE_URL + u);
      assert.equal(r.status, 200, u);
      assert.match(r.headers.get("content-type") ?? "", /html/, u);
    }
    assert.equal((await fetch(`${BASE_URL}/robots.txt`)).status, 200);
  });
});
