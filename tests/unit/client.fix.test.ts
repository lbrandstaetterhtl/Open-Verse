// Regression tests for the client fixes ATK-XSS-2 (only http(s) links) and ATK-XSS-3 / UI-6 (theme values that
// reach inline styles are validated; invalid theme files are rejected). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeExternalUrl } from "../../client/src/lib/safe-url";
import {
  defaultBackground,
  defaultTheme,
  importTheme,
  isSafeGradient,
  migrateTheme,
  safeBackgroundImageUrl,
  sanitizeBackground,
  type CustomTheme,
} from "../../client/src/lib/theme-utils";

test("ATK-XSS-2: only http(s) addresses become links", () => {
  assert.equal(safeExternalUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(safeExternalUrl("HTTP://Example.com"), "http://example.com/");
  for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "mailto:a@b.c", "//evil.example", "/local", "", "https://", 42, null]) {
    assert.equal(safeExternalUrl(bad), null, String(bad));
    assert.equal(safeExternalUrl(bad, { assumeHttps: true }), null, `assumeHttps ${String(bad)}`);
  }
  // A bare domain (as the profile form allows) becomes https, text that is no address does not
  assert.equal(safeExternalUrl("example.com/me", { assumeHttps: true }), "https://example.com/me");
  assert.equal(safeExternalUrl("example.com/me"), null);
  assert.equal(safeExternalUrl("das ist keine url", { assumeHttps: true }), null);
});

test("ATK-XSS-3: gradients may only use gradient and color functions", () => {
  assert.ok(isSafeGradient(defaultBackground.gradient));
  assert.ok(isSafeGradient("linear-gradient(135deg, hsl(260 80% 10%), hsl(280 60% 20%) 50%, #102030)"));
  assert.ok(isSafeGradient("radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.5), transparent), conic-gradient(red, blue)"));
  for (const bad of [
    "url(https://beacon.example/p.png)",
    "linear-gradient(red, blue), url(https://beacon.example/p.png)",
    "linear-gradient(red, blue); background-image: url(x)",
    "linear-gradient(red, image-set('x.png' 1x))",
    "linear-gradient(red, blue) \\75rl(x)",
    "linear-gradient(red, blue",
    "red",
    "expression(alert(1))",
    42,
  ]) {
    assert.equal(isSafeGradient(bad), false, String(bad));
  }
});

test("ATK-XSS-3: background image URLs must be http(s) or same-origin paths", () => {
  assert.equal(safeBackgroundImageUrl("https://img.example/a b\".png"), "https://img.example/a%20b%22.png");
  assert.equal(safeBackgroundImageUrl("/uploads/x.png"), "http://localhost/uploads/x.png");
  for (const bad of ["javascript:alert(1)", "data:image/svg+xml,<svg/>", "//evil.example/x.png", "x.png", "blob:http://x/1", ""]) {
    assert.equal(safeBackgroundImageUrl(bad), null, bad);
  }
});

test("ATK-XSS-3: sanitizeBackground falls back to the default for unsafe values", () => {
  const bg = sanitizeBackground({
    mode: "gradient",
    gradient: "url(https://beacon.example/p.png)",
    image: { type: "url", value: "javascript:alert(1)" },
    overlay: { opacity: 5, blur: -1, tint: "0 0% 0%); background: url(x" },
  });
  assert.equal(bg.gradient, defaultBackground.gradient);
  assert.equal(bg.image, undefined);
  assert.equal(bg.overlay.opacity, 1);
  assert.equal(bg.overlay.blur, 0);
  assert.equal(bg.overlay.tint, defaultBackground.overlay.tint);
  assert.deepEqual(sanitizeBackground({ mode: "image", image: { type: "fileRef", value: "../../etc/passwd" }, overlay: defaultBackground.overlay }).image, undefined);
  assert.deepEqual(sanitizeBackground({ mode: "image", image: { type: "fileRef", value: "theme-bg-1.png" }, overlay: defaultBackground.overlay }).image, { type: "fileRef", value: "theme-bg-1.png" });
});

test("ATK-XSS-3: migrateTheme keeps only known palette keys with plain color values", () => {
  const theme = {
    ...defaultTheme,
    version: undefined,
    dark: { ...defaultTheme.dark, primary: "150 80% 45%", ring: "url(https://beacon.example/x)", bgGradient: "url(x)" },
    background: { mode: "gradient", gradient: "linear-gradient(red, blue), url(https://beacon.example/p.png)", overlay: defaultBackground.overlay },
  } as unknown as CustomTheme;
  const migrated = migrateTheme(theme);
  assert.equal(migrated.dark.primary, "150 80% 45%");
  assert.equal(migrated.dark.ring, defaultTheme.dark.ring);
  assert.equal((migrated.dark as unknown as Record<string, unknown>).bgGradient, undefined);
  assert.equal(migrated.background?.gradient, defaultBackground.gradient);
});

test("UI-6: importTheme rejects files whose light/dark palettes are not objects", () => {
  assert.equal(importTheme("{ this is: not json"), null);
  assert.equal(importTheme(JSON.stringify({ name: "x", colors: [] })), null);
  assert.equal(importTheme(JSON.stringify({ light: 1, dark: "zwei" })), null);
  assert.equal(importTheme(JSON.stringify({ light: [], dark: [] })), null);
  assert.equal(importTheme("null"), null);
  assert.ok(importTheme(JSON.stringify({ light: { primary: "200 80% 50%" }, dark: { primary: "200 80% 60%" } })));
});
