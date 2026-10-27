// Localization checks for the React client. Run: npm run test:i18n
// Details for a failing check: npx tsx tests/i18n/scan.ts (hard-coded text) or read the assertion message.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CLIENT_SRC, LOCALES_DIR, DEFAULT_NS, findHardcodedText, findRawEnumValues, findServerMessages, findUntranslatableErrors, findUnlocalizedDates, findUsedKeys, loadLocales, loadAllowlist,
  supportedLanguages, namespaces, placeholders, publicNamespaces, staffNamespaces, isStaffSource, sourceFiles, STAFF_SERVER_FILES,
} from "./scan";
import ts from "typescript";

const locales = loadLocales();
const languages = supportedLanguages();
const nsList = namespaces();
const en = locales.en;
const list = (items: string[], max = 40) =>
  items.slice(0, max).join("\n  ") + (items.length > max ? `\n  … and ${items.length - max} more` : "");

describe("i18n setup", () => {
  test("every supported language has a folder with every namespace file", () => {
    const missing: string[] = [];
    for (const lang of languages) for (const ns of nsList) {
      if (!fs.existsSync(path.join(LOCALES_DIR, lang, `${ns}.json`))) missing.push(`${lang}/${ns}.json`);
    }
    assert.deepEqual(missing, [], `missing locale files:\n  ${list(missing)}`);
  });

  test("the language menu offers exactly the supported languages", () => {
    const toggle = fs.readFileSync(path.join(CLIENT_SRC, "components/theme/language-toggle.tsx"), "utf8");
    const offered = [...toggle.matchAll(/loadLanguage\(["'](\w+)["']\)/g)].map((m) => m[1]).sort();
    assert.deepEqual(offered, [...languages].sort());
  });

  test("locale files are valid JSON objects", () => {
    for (const lang of languages) for (const ns of nsList) {
      const p = path.join(LOCALES_DIR, lang, `${ns}.json`);
      if (fs.existsSync(p)) assert.equal(typeof JSON.parse(fs.readFileSync(p, "utf8")), "object", p);
    }
  });
});

describe("source code", () => {
  test("no hard-coded user-visible text (use t())", () => {
    const findings = findHardcodedText();
    assert.deepEqual(
      findings.map((f) => `${f.file}:${f.line} [${f.kind}] ${f.text}`),
      [],
      `${findings.length} hard-coded strings — wrap them in t() or, if intended, add them to tests/i18n/allowlist.json`,
    );
  });

  test("code values (role, status, …) are not shown untranslated", () => {
    const findings = findRawEnumValues();
    assert.deepEqual(findings.map((f) => `${f.file}:${f.line} {${f.text}}`), [],
      "show a label: t(`area.roles.${value}`, value)");
  });

  test("dates with month/day names use the UI language (date-fns locale)", () => {
    const findings = findUnlocalizedDates();
    assert.deepEqual(findings.map((f) => `${f.file}:${f.line} ${f.text}`), [],
      "pass { locale: useDateLocale() } (client/src/lib/date-locale.ts)");
  });

  test("every key used with t() exists in English", () => {
    const missing = new Set<string>();
    for (const u of findUsedKeys()) {
      const keys = en[u.ns];
      if (!keys) { missing.add(`${u.ns}:${u.key} (unknown namespace) — ${u.file}:${u.line}`); continue; }
      const exists = u.dynamicPrefix
        ? Object.keys(keys).some((k) => k.startsWith(`${u.key}.`))
        : u.key in keys;
      if (!exists) missing.add(`${u.ns === DEFAULT_NS ? "" : u.ns + ":"}${u.key}${u.dynamicPrefix ? ".*" : ""} — ${u.file}:${u.line}`);
    }
    assert.deepEqual([...missing], [], `keys missing in en:\n  ${list([...missing])}`);
  });

  test("English default texts in code match the English locale file", () => {
    // The default is shown until the locale file has loaded; it must not differ (or be German).
    const diff = new Set<string>();
    for (const u of findUsedKeys()) {
      const value = en[u.ns]?.[u.key];
      if (u.defaultValue !== undefined && value !== undefined && value !== u.defaultValue) {
        diff.add(`${u.ns}:${u.key} — code "${u.defaultValue}" vs en "${value}" (${u.file}:${u.line})`);
      }
    }
    assert.deepEqual([...diff], [], `default text differs from en:\n  ${list([...diff])}`);
  });

  test("a key is not used with two different English default texts", () => {
    const seen = new Map<string, Set<string>>();
    for (const u of findUsedKeys()) {
      if (u.defaultValue === undefined) continue;
      const id = `${u.ns}:${u.key}`;
      seen.set(id, (seen.get(id) ?? new Set()).add(u.defaultValue));
    }
    const clashes = [...seen].filter(([, v]) => v.size > 1).map(([k, v]) => `${k}: ${[...v].map((x) => JSON.stringify(x)).join(" vs ")}`);
    assert.deepEqual(clashes, [], `same key, different meaning:\n  ${list(clashes)}`);
  });
});

describe("server messages", () => {
  test("every error text the API sends has an entry in the server namespace", () => {
    // client/src/lib/server-messages.ts looks texts up by their exact English wording
    const known = new Set([...Object.values(en.server ?? {}), ...Object.values(en.staffServer ?? {})]);
    const missing = findServerMessages().filter((m) => !known.has(m.text)).map((m) => `${m.file}:${m.line} "${m.text}"`);
    assert.deepEqual(missing, [], `add these to client/public/locales/en/server.json, or staffServer.json for admin-API-only texts (and translate):\n  ${list(missing)}`);
  });

  test("texts only the admin API sends are in staffServer (staff-only), everything else in server", () => {
    // A text is staff-only when every server/shared source file that contains it is an admin API route
    // (raw text search: many texts go through helpers such as forbidden(res, "…")).
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".ts") ? [path.join(d, e.name)] : []);
    const root = path.resolve(CLIENT_SRC, "../..");
    const sources = [...walk(path.join(root, "server")), ...walk(path.join(root, "shared"))]
      .map((f) => ({ rel: path.relative(root, f).split(path.sep).join("/"), src: fs.readFileSync(f, "utf8") }));
    const staffOnly = (text: string) => {
      const from = sources.filter((f) => f.src.includes(text) || f.src.includes(JSON.stringify(text).slice(1, -1)));
      return from.length > 0 && from.every((f) => STAFF_SERVER_FILES.test(f.rel));
    };
    const sentToEveryone = (text: string) => findServerMessages().some((m) => m.text === text && !STAFF_SERVER_FILES.test(m.file));
    const wrong = [
      ...Object.entries(en.server ?? {}).filter(([k, v]) => !k.includes(".") && staffOnly(v)).map(([k, v]) => `move to staffServer.json: ${k} "${v}"`),
      ...Object.entries(en.staffServer ?? {}).filter(([, v]) => sentToEveryone(v)).map(([k, v]) => `sent to everyone, move to server.json: ${k} "${v}"`),
    ];
    assert.deepEqual(wrong, [], `server texts in the wrong namespace (keep the key, move it in all languages):\n  ${list(wrong)}`);
  });

  test("server messages are English (the lookup key)", () => {
    const german = findServerMessages().filter((m) => /[äöüÄÖÜß]/.test(m.text)).map((m) => `${m.file}:${m.line} "${m.text}"`);
    assert.deepEqual(german, []);
  });
});

describe("translations", () => {
  const allow = loadAllowlist();
  for (const lang of languages.filter((l) => l !== "en")) {
    test(`${lang}: has every English key, no extras, no empty values`, () => {
      const problems: string[] = [];
      for (const ns of nsList) {
        const base = en[ns] ?? {};
        const tr = locales[lang][ns] ?? {};
        for (const k of Object.keys(base)) if (!(k in tr)) problems.push(`missing ${ns}:${k}`);
        for (const k of Object.keys(tr)) if (!(k in base)) problems.push(`extra ${ns}:${k}`);
        for (const [k, v] of Object.entries(tr)) if (!v.trim()) problems.push(`empty ${ns}:${k}`);
      }
      assert.deepEqual(problems, [], `${lang}: ${problems.length} problems:\n  ${list(problems)}`);
    });

    test(`${lang}: placeholders like {{name}} match English`, () => {
      const bad: string[] = [];
      for (const ns of nsList) {
        const base = en[ns] ?? {};
        for (const [k, v] of Object.entries(locales[lang][ns] ?? {})) {
          if (k in base && placeholders(v).join() !== placeholders(base[k]).join()) bad.push(`${ns}:${k}: "${base[k]}" -> "${v}"`);
        }
      }
      assert.deepEqual(bad, [], `${lang}: placeholder mismatch:\n  ${list(bad)}`);
    });

    test(`${lang}: texts are translated, not English copies`, () => {
      const allowed = new Set(allow.sameAsEnglish[lang] ?? []);
      const same: string[] = [];
      for (const ns of nsList) {
        const base = en[ns] ?? {};
        for (const [k, v] of Object.entries(locales[lang][ns] ?? {})) {
          // Only flag real sentences/phrases: 2+ words with a lowercase word of 4+ letters
          if (v === base[k] && /\b[a-z]{4,}\b/.test(v) && /\s/.test(v.trim()) && !allowed.has(`${ns}:${k}`)) same.push(`${ns}:${k} = "${v}"`);
        }
      }
      assert.deepEqual(same, [], `${lang}: ${same.length} untranslated English texts:\n  ${list(same)}`);
    });
  }
});

describe("staff translations", () => {
  const staffNs = staffNamespaces();
  const publicNs = publicNamespaces();
  const uses = findUsedKeys();
  // Bare key strings in code, e.g. ["admin_bulk.x", "Fallback"] arrays that are passed to t() later
  const literals = new Map<string, Set<string>>();
  for (const file of sourceFiles()) {
    const rel = path.relative(CLIENT_SRC, file);
    const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const set = new Set<string>();
    const visit = (n: ts.Node) => {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && /^[\w-]+(\.[\w-]+)+$/.test(n.text)) set.add(n.text);
      ts.forEachChild(n, visit);
    };
    visit(sf);
    literals.set(rel, set);
  }
  const usedBy = (ns: string, key: string, staff: boolean) =>
    uses.some((u) => isStaffSource(u.file) === staff && u.ns === ns && (u.dynamicPrefix ? key.startsWith(`${u.key}.`) : u.key === key)) ||
    (ns === DEFAULT_NS && [...literals].some(([rel, set]) => isStaffSource(rel) === staff && set.has(key)));
  /** Top-level groups of admin texts; a key there stays public only while public code uses it. */
  const STAFF_GROUPS = new Set(["bans", "autoPunishment", "analytics", "modPerf", "security", "admin", "monitoring", "admin_bulk",
    "admin_groups", "admin_tickets", "admin_autopunish", "admin_bans", "admin_logs", "admin_dashboard", "stress_test", "admin_settings"]);

  test("staff namespaces exist and are not in the list every visitor loads", () => {
    assert.ok(staffNs.includes("staff"), "STAFF_NAMESPACES in client/src/lib/i18n.ts");
    assert.deepEqual(staffNs.filter((ns) => publicNs.includes(ns)), []);
  });

  test("public code does not use staff namespaces (it would show raw keys to users)", () => {
    const bad = uses.filter((u) => !isStaffSource(u.file) && staffNs.includes(u.ns)).map((u) => `${u.ns}:${u.key} — ${u.file}:${u.line}`);
    assert.deepEqual(bad, [], `public code (outside client/src/staff) uses staff texts:\n  ${list(bad)}`);
  });

  test("texts only the admin area uses are not in the public namespaces", () => {
    const leaked: string[] = [];
    for (const ns of publicNs.filter((n) => n !== "server")) {
      for (const key of Object.keys(en[ns] ?? {})) {
        if (usedBy(ns, key, false) || key.startsWith("common.")) continue; // generic texts may stay public
        if (usedBy(ns, key, true) || (ns === DEFAULT_NS && STAFF_GROUPS.has(key.split(".")[0]))) leaked.push(`${ns}:${key}`);
      }
    }
    assert.deepEqual(leaked, [], `staff-only texts in public locale files — move them to staff.json (all languages) and use t("staff:<key>"):\n  ${list(leaked)}`);
  });
});
