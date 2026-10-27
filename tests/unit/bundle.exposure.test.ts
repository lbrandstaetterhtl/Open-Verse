// Exposure checks for the client bundle (area "bundle"). Source checks always run; the checks of the built
// client run when dist/public exists (after `npx vite build`).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { isStaffAssetPath, normalizeStaticPath } from "../../server/staff-assets";
import { isFileRequest } from "../../server/vite";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SRC = path.join(ROOT, "client/src");
const DIST = path.join(ROOT, "dist/public");

const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : /\.(tsx?|mts)$/.test(e.name) ? [path.join(d, e.name)] : []);

type Imp = { file: string; spec: string; typeOnly: boolean; dynamic: boolean };
function imports(file: string): Imp[] {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(SRC, file).split(path.sep).join("/");
  const out: Imp[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const c = n.importClause;
      const typeOnly = !!c && (c.isTypeOnly || (!c.name && !!c.namedBindings && ts.isNamedImports(c.namedBindings) &&
        c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly)));
      out.push({ file: rel, spec: n.moduleSpecifier.text, typeOnly, dynamic: false });
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      out.push({ file: rel, spec: n.moduleSpecifier.text, typeOnly: n.isTypeOnly, dynamic: false });
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      out.push({ file: rel, spec: n.arguments[0].text, typeOnly: false, dynamic: true });
    } else if (ts.isImportTypeNode(n)) {
      return; // typeof import("…") is a type
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
const all = walk(SRC).flatMap(imports);
const isStaff = (rel: string) => rel.startsWith("staff/");

describe("client sources", () => {
  test("no runtime import of the database schema (@shared/schema) in the browser code", () => {
    const bad = all.filter((i) => /(^|\/)shared\/schema$|^@shared\/schema$/.test(i.spec) && !i.typeOnly).map((i) => `${i.file}: ${i.spec}`);
    assert.deepEqual(bad, [], "use `import type` for schema types and @shared/validation for zod rules");
  });

  test("shared/validation.ts (bundled into the browser) has no drizzle and no admin schemas", () => {
    const src = fs.readFileSync(path.join(ROOT, "shared/validation.ts"), "utf8");
    assert.doesNotMatch(src, /from\s+["']drizzle/);
    assert.doesNotMatch(src, /adminUpdateUserSchema|insertAdminGroupSchema|insertAutoPunishmentRuleSchema|isShadowBanned/);
  });

  test("public code reaches client/src/staff only through the dynamic import in lib/staff.tsx", () => {
    const bad = all.filter((i) => !isStaff(i.file) && /^@\/staff(\/|$)|(^|\/)staff\//.test(i.spec) && !i.typeOnly)
      .filter((i) => !(i.file === "lib/staff.tsx" && i.dynamic && i.spec === "@/staff"))
      .map((i) => `${i.file}: ${i.dynamic ? "import()" : "import"} ${i.spec}`);
    assert.deepEqual(bad, []);
  });

  test("no staff API path or permission map in public code", () => {
    const bad: string[] = [];
    for (const f of walk(SRC)) {
      const rel = path.relative(SRC, f).split(path.sep).join("/");
      if (isStaff(rel)) continue;
      const src = fs.readFileSync(f, "utf8");
      for (const s of ["/api/admin", "/api/security", "/api/monitoring", "stress_test", "stress-test"]) if (src.includes(s)) bad.push(`${rel}: ${s}`);
      // admin sub-routes ("/admin/bans" …) belong to client/src/staff; public code knows only "/admin" and "/admin/*"
      for (const m of src.match(/["'`]\/admin\/[a-z][^"'`]*/g) ?? []) bad.push(`${rel}: ${m}`);
    }
    assert.deepEqual(bad, []);
  });
});

describe("staff asset guard paths", () => {
  test("staff chunks and staff locale namespaces are recognised, also when encoded or in other case", () => {
    for (const p of ["/assets/staff-abc.js", "/assets/%73taff-abc.js", "/assets/./staff-abc.js", "/x/../assets/staff-abc.js", "/ASSETS/Staff-abc.js",
      "/locales/en/staff.json", "/locales/de/staffServer.json", "/locales/zh/analytics.json", "/locales/it/modPerf.json", "/locales/en/whatever.json",
      "/locales/en/%73taff.json", "/src/staff/index.tsx"]) {
      assert.equal(isStaffAssetPath(p), true, p);
    }
    for (const p of ["/assets/index-abc.js", "/locales/en/translation.json", "/locales/de/tickets.json", "/locales/fr/server.json", "/", "/admin", "/staff-abc.js"]) {
      assert.equal(isStaffAssetPath(p), false, p);
    }
    assert.equal(normalizeStaticPath("/%E0%A4%A"), null);
  });

  test("file-like requests get a 404, app routes the app", () => {
    for (const p of ["/.env", "/.git/config", "/assets/nope.js", "/x.php", "/manifest.json", "/locales/en/nope.json", "/a/b.bak", "/%2eenv"]) assert.equal(isFileRequest(p), true, p);
    for (const p of ["/", "/feed/media", "/admin/monitoring", "/users/john.doe", "/c/some.slug", "/posts/12"]) assert.equal(isFileRequest(p), false, p);
  });
});

describe("built client (dist/public)", { skip: !fs.existsSync(path.join(DIST, "index.html")) && "client not built" }, () => {
  const assets = fs.existsSync(path.join(DIST, "assets")) ? fs.readdirSync(path.join(DIST, "assets")) : [];
  const js = assets.filter((f) => f.endsWith(".js"));
  const publicJs = js.filter((f) => !f.startsWith("staff-"));
  const read = (f: string) => fs.readFileSync(path.join(DIST, "assets", f), "utf8");

  test("staff chunks exist and public chunks name only the staff entry chunk", () => {
    assert.ok(js.some((f) => f.startsWith("staff-")), "no staff-*.js chunk");
    const named = new Set(publicJs.flatMap((f) => read(f).match(/staff-[\w-]+\.js/g) ?? []));
    assert.equal(named.size, 1, `public chunks reference staff chunks: ${[...named].join(", ")}`);
  });

  test("public chunks contain no table definitions, staff API paths or staff routes", () => {
    const words = ["pgTable", "drizzle", "activity_logs", "is_shadow_banned", "isShadowBanned", "adminGroupId", "/api/admin", "/api/security",
      "/api/monitoring", "stress_test", "stress-test", "/admin/bans", "/admin/monitoring", "auto_punishment", "hardware_ban"];
    const bad = publicJs.flatMap((f) => { const s = read(f); return words.filter((w) => s.includes(w)).map((w) => `${f}: ${w}`); });
    assert.deepEqual(bad, []);
  });

  test("no source maps, no debug console output, no license banners", () => {
    assert.deepEqual(assets.filter((f) => f.endsWith(".map")), []);
    const bad = js.flatMap((f) => { const s = read(f); return [/sourceMappingURL/, /console\.(log|debug|info)\(/, /@license/].filter((r) => r.test(s)).map((r) => `${f}: ${r}`); });
    assert.deepEqual(bad, []);
  });

  test("index.html loads no Google fonts and has no build comments; unused legacy icon is gone", () => {
    const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
    assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
    assert.doesNotMatch(html, /<!--/);
    assert.ok(!fs.existsSync(path.join(DIST, "open-verse-icon.png")));
    assert.ok(assets.some((f) => /^instrument-sans-latin-400-normal-.*\.woff2$/.test(f)), "self-hosted fonts in the build");
  });
});
