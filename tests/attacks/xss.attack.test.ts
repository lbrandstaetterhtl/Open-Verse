// Attacker scenarios — XSS / client-side output safety (area "xss"), API/header part.
//
// Run: E2E_BASE_URL=http://127.0.0.1:5084 E2E_ADMIN_USER=routeowner E2E_ADMIN_PASSWORD='…' \
//        npx tsx --test --test-reporter=spec tests/attacks/xss.attack.test.ts
//
// These cover the parts of the XSS surface that are visible at the HTTP layer: whether the API stores
// dangerous-scheme URLs that the client later turns into clickable links, and whether the response headers
// that limit script execution and framing (CSP, X-Frame-Options, nosniff, frame-ancestors) are present and
// consistent. The browser rendering itself is checked in tests/attacks/xss.browser.attack.mjs.
// Each test asserts the SAFE outcome; a failing test documents a finding to be fixed.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Client, newUser, BASE_URL, ADMIN_USER, ADMIN_PASSWORD, RUN_ID } from "../e2e/client";

const DANGEROUS_SCHEMES = [
  "javascript:window.__xss=1",
  "JaVaScRiPt:alert(1)",
  "  javascript:alert(1)", // leading whitespace, still parsed as a scheme by browsers
  "data:text/html,<script>window.__xss=1</script>",
  "vbscript:msgbox(1)",
];

async function freshClient(tag: string): Promise<Client> {
  const u = await newUser(tag.slice(0, 10));
  return u.client;
}

// ---------------------------------------------------------------------------------------------------------------
// Angriff: a user files a support ticket whose relatedUrl is a javascript:/data: URL. The owner/admin opens the
// ticket and TicketDetailPage renders <a href={ticket.relatedUrl}> verbatim — one click would run attacker JS in
// the staff session (only the app-page CSP currently stops it). The SAFE outcome: the API must not store a
// dangerous-scheme relatedUrl.
describe("Angriff: javascript:/data: URL stored in ticket relatedUrl", () => {
  for (const scheme of DANGEROUS_SCHEMES) {
    test(`relatedUrl ${JSON.stringify(scheme.slice(0, 24))} must be rejected or sanitized`, async () => {
      const client = await freshClient(`tkapi${Math.random().toString(36).slice(2, 6)}`);
      const res = await client.post("/api/tickets", {
        title: `relatedUrl api attack ${RUN_ID}`,
        description: "x".repeat(60),
        type: "bug_report",
        priority: "low",
        relatedUrl: scheme,
      });
      if (res.status >= 400) return; // rejected outright — safe
      assert.equal(res.status, 201, `unexpected status ${res.status}`);
      const body = await res.json();
      const stored: string = body?.ticket?.relatedUrl ?? "";
      const normalized = stored.trim().toLowerCase();
      assert.ok(
        !normalized.startsWith("javascript:") &&
          !normalized.startsWith("vbscript:") &&
          !(normalized.startsWith("data:") && !normalized.startsWith("data:image/")),
        `API stored a dangerous-scheme relatedUrl verbatim; the client renders it as a clickable href: ${JSON.stringify(stored)}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Angriff: a user puts a dangerous-scheme URL in their profile "website". ProfileHeader builds the link's href
// from it. The SAFE outcome: the API should not persist a javascript:/vbscript:/data: website verbatim.
describe("Angriff: dangerous-scheme URL stored in profile website", () => {
  for (const scheme of ["javascript:window.__xss=1", "data:text/html,<script>1</script>", "vbscript:msgbox(1)"]) {
    test(`website ${JSON.stringify(scheme.slice(0, 20))} must be rejected or sanitized`, async () => {
      const u = await newUser(`webapi${Math.random().toString(36).slice(2, 5)}`);
      const res = await u.client.patch("/api/profile", { website: scheme });
      if (res.status >= 400) return; // rejected — safe
      const check = await (await u.client.get(`/api/users/${u.username}`)).json();
      const stored: string = (check.website ?? "").trim().toLowerCase();
      assert.ok(
        !stored.startsWith("javascript:") && !stored.startsWith("vbscript:") &&
          !(stored.startsWith("data:") && !stored.startsWith("data:image/")),
        `API stored a dangerous-scheme website verbatim: ${JSON.stringify(check.website)}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Angriff: inject script via a weak CSP / missing framing protection. The SAFE outcome: the app document must
// ship a CSP that blocks inline script and javascript: URLs, plus anti-framing and nosniff headers.
describe("Angriff: response headers that limit script execution and framing", () => {
  test("the app document CSP blocks inline script (no 'unsafe-inline'/'unsafe-eval' in script-src)", async () => {
    const res = await fetch(BASE_URL + "/", { headers: { accept: "text/html" } });
    const csp = res.headers.get("content-security-policy") ?? "";
    assert.ok(csp, "app document has no Content-Security-Policy header");
    const scriptSrc = (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src")) ?? "");
    assert.ok(/\bscript-src\b/.test(csp), `CSP has no script-src directive (defaults to default-src): ${csp}`);
    assert.ok(!/'unsafe-inline'/.test(scriptSrc), `app CSP script-src allows 'unsafe-inline' — inline/JS-URL XSS not blocked: ${scriptSrc}`);
    assert.ok(!/'unsafe-eval'/.test(scriptSrc), `app CSP script-src allows 'unsafe-eval': ${scriptSrc}`);
  });

  test("the app document cannot be framed (X-Frame-Options or frame-ancestors 'none')", async () => {
    const res = await fetch(BASE_URL + "/", { headers: { accept: "text/html" } });
    const xfo = (res.headers.get("x-frame-options") ?? "").toLowerCase();
    const csp = res.headers.get("content-security-policy") ?? "";
    const fa = /frame-ancestors\s+'none'/.test(csp) || /frame-ancestors\s+'self'/.test(csp);
    assert.ok(xfo === "deny" || xfo === "sameorigin" || fa, `app document is framable: XFO=${JSON.stringify(xfo)} CSP=${csp}`);
  });

  test("the app document sets X-Content-Type-Options: nosniff", async () => {
    const res = await fetch(BASE_URL + "/", { headers: { accept: "text/html" } });
    assert.equal((res.headers.get("x-content-type-options") ?? "").toLowerCase(), "nosniff", "missing nosniff on app document");
  });

  test("API responses use the same strict script-src as the app document (no weaker CSP on /api/*)", async () => {
    const res = await fetch(BASE_URL + "/api/health");
    const csp = res.headers.get("content-security-policy") ?? "";
    const scriptSrc = (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src")) ?? "");
    assert.ok(
      !/'unsafe-inline'/.test(scriptSrc) && !/'unsafe-eval'/.test(scriptSrc),
      `/api/* ships a weaker CSP than the app document (script-src allows inline/eval): ${scriptSrc || csp}`,
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Open-redirect: there is no server-side redirect endpoint or redirect/next/returnTo query parameter in the
// codebase (grep over server/ finds no res.redirect and no req.query.<redirect|next|returnTo|url|callback>).
// Client navigation from data (notification.actionUrl) uses wouter setLocation, which only changes the SPA path
// and cannot navigate to a foreign origin, and every actionUrl is a server-generated "/..."-path. Nothing to
// automate as a failing test; recorded as info in findings-xss.json.
describe("Angriff: open redirect", () => {
  test.todo("no server redirect endpoint / redirect parameter exists to abuse (see findings ATK-XSS info note)");
});
