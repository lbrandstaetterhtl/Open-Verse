// Localization checks for the React client. Run: npm run test:i18n
// Details for a failing check: npx tsx tests/i18n/scan.ts (hard-coded text) or read the assertion message.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CLIENT_SRC, LOCALES_DIR, DEFAULT_NS, findHardcodedText, findUnlocalizedDates, findUsedKeys, loadLocales, loadAllowlist,
  supportedLanguages, namespaces, placeholders,
} from "./scan";

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
