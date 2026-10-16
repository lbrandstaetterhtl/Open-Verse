// Static i18n checks for the React client, shared by tests/i18n/i18n.test.ts and the CLI report:
//   npx tsx tests/i18n/scan.ts            -> prints every finding
//
// - findHardcodedText(): user-visible text in .tsx/.ts files that does not go through t()
// - findUsedKeys():      literal keys passed to t(), with their namespace
// - loadLocales():       all locale files, flattened
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const CLIENT_SRC = path.join(ROOT, "client/src");
export const LOCALES_DIR = path.join(ROOT, "client/public/locales");
export const DEFAULT_NS = "translation";

const ALLOWLIST_FILE = path.join(import.meta.dirname, "allowlist.json");

type Allowlist = {
  /** Text that may appear anywhere, e.g. brand names. Exact match after trimming. */
  text: string[];
  /** "path/relative/to/client/src::text" for one-off exceptions with a reason in `reasons`. */
  entries: string[];
  reasons: Record<string, string>;
  /** Locale keys (ns:key) that may stay identical to English in a given language. */
  sameAsEnglish: Record<string, string[]>;
};

export function loadAllowlist(): Allowlist {
  return JSON.parse(fs.readFileSync(ALLOWLIST_FILE, "utf8"));
}

/* ------------------------------------------------------------------ */
/* Source files                                                        */
/* ------------------------------------------------------------------ */

export function sourceFiles(dir = CLIENT_SRC): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(tsx|ts)$/.test(entry.name) && !/\.(test|spec|d)\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out.sort();
}

const parse = (file: string) =>
  ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/* ------------------------------------------------------------------ */
/* Hard-coded text                                                     */
/* ------------------------------------------------------------------ */

export type Finding = { file: string; line: number; text: string; kind: string };

/** JSX attributes whose value is shown to people (or read out by screen readers). */
const TEXT_ATTRIBUTES = new Set([
  "placeholder", "title", "alt", "label", "aria-label", "aria-description", "aria-valuetext",
  "description", "tooltip", "emptyText", "emptyTitle", "emptyDescription", "confirmText", "cancelText",
  "subtitle", "heading", "caption", "helperText", "errorText",
]);

/** Object properties whose value is shown to people, e.g. toast({ title, description }). */
const TEXT_PROPERTIES = new Set(["title", "description", "label", "placeholder", "message", "text", "subtitle", "heading", "tooltip"]);

/** Calls whose string arguments are shown to people. */
const TEXT_CALLS = new Set(["alert", "confirm", "prompt"]);

const HAS_WORD = /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/;
/** Things that look like text but are not prose: identifiers, URLs, CSS, formats, units. */
const NOT_PROSE = [
  /^[\w.-]+$/, // single token without spaces: keys, ids, enum values, CSS classes, "px"
  /^(https?:|mailto:|\/|#|\.|@)/, // URLs, paths, selectors, mentions
  /^[a-z0-9-]+(:[a-z0-9-/[\].]+)?( [a-z0-9-]+(:[a-z0-9-/[\].]+)?)+$/, // tailwind class lists
  /^[yMdHhmsaEPpL ,.:/'-]+$/, // date-fns format strings
];

const isTranslateCall = (node: ts.Node): boolean => {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === "t";
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text === "t"; // i18n.t(...)
  return false;
};

/** True when the node sits inside the arguments of a t() call (its key or default value). */
const insideTranslateCall = (node: ts.Node): boolean => {
  for (let p = node.parent; p; p = p.parent) {
    if (isTranslateCall(p)) return true;
    if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isFunctionLike(p)) return false;
  }
  return false;
};

/** Skip TypeScript-only positions (types, enums), imports and console/log calls. */
const ignoredContext = (node: ts.Node): boolean => {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isTypeNode(p) || ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
    if (ts.isCallExpression(p)) {
      const c = p.expression.getText();
      if (/^(console\.\w+|logger\.\w+|new Error|Error|clsx|cn|twMerge|cva|z\.|queryClient\.|setQueryData|invalidateQueries|apiRequest|fetch|localStorage\.\w+|sessionStorage\.\w+|document\.querySelector\w*|useQuery|useMutation)/.test(c)) return true;
    }
    if (ts.isNewExpression(p) && /Error$/.test(p.expression.getText())) return true;
    if (ts.isJsxAttribute(p)) return false;
  }
  return false;
};

/** A single capitalised word like "Save", "Settings:" or "Next…" is a UI label, not an identifier. */
const UI_WORD = /^[A-ZÄÖÜ][a-zäöüß]+(?:-[A-Za-z]+)?[.!?:…]*$/;

const isProse = (raw: string) => {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!HAS_WORD.test(s)) return false;
  if (UI_WORD.test(s)) return true;
  return !NOT_PROSE.some((re) => re.test(s));
};

/** Walks up through ?:, &&, ||, ??, (), `as` to find who consumes a string literal. */
const consumer = (node: ts.Node): ts.Node => {
  let n = node;
  while (
    n.parent &&
    (ts.isConditionalExpression(n.parent) || ts.isParenthesizedExpression(n.parent) ||
      ts.isAsExpression(n.parent) || ts.isTemplateSpan(n.parent) || ts.isTemplateExpression(n.parent) ||
      (ts.isBinaryExpression(n.parent) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(n.parent.operatorToken.kind)))
  ) {
    // in `a ? b : c` only b and c are values, the condition is not shown
    if (ts.isConditionalExpression(n.parent) && n.parent.condition === n) return n.parent;
    n = n.parent;
  }
  return n.parent ?? n;
};

const attributeName = (attr: ts.JsxAttribute) => attr.name.getText();

export function findHardcodedText(files = sourceFiles()): Finding[] {
  const allow = loadAllowlist();
  const allowedText = new Set(allow.text);
  const allowedEntries = new Set(allow.entries);
  const findings: Finding[] = [];

  for (const file of files) {
    const rel = path.relative(CLIENT_SRC, file);
    const sf = parse(file);
    const add = (node: ts.Node, text: string, kind: string) => {
      const clean = text.replace(/\s+/g, " ").trim();
      if (!isProse(clean) || allowedText.has(clean) || allowedEntries.has(`${rel}::${clean}`)) return;
      findings.push({ file: rel, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: clean, kind });
    };

    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) {
        add(node, node.text, "jsx-text");
      } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
        if (!insideTranslateCall(node) && !ignoredContext(node)) {
          const text = ts.isTemplateExpression(node)
            ? [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" … ")
            : node.text;
          const c = consumer(node);
          if (ts.isJsxExpression(c) && c.parent && !ts.isJsxAttribute(c.parent)) {
            add(node, text, "jsx-expression");
          } else if (ts.isJsxAttribute(c) || (ts.isJsxExpression(c) && c.parent && ts.isJsxAttribute(c.parent))) {
            const attr = (ts.isJsxAttribute(c) ? c : c.parent) as ts.JsxAttribute;
            if (TEXT_ATTRIBUTES.has(attributeName(attr))) add(node, text, `attr:${attributeName(attr)}`);
          } else if (ts.isPropertyAssignment(c) && c.initializer !== undefined) {
            const name = c.name.getText().replace(/["']/g, "");
            if (TEXT_PROPERTIES.has(name)) add(node, text, `prop:${name}`);
          } else if (ts.isCallExpression(c)) {
            const callee = c.expression.getText().replace(/^window\./, "");
            if (TEXT_CALLS.has(callee)) add(node, text, `call:${callee}`);
          } else if (ts.isBinaryExpression(c) && c.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            c.left.getText() === "document.title") {
            add(node, text, "document.title");
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const DATE_FNS_WORDY = new Set(["formatDistance", "formatDistanceToNow", "formatDistanceStrict", "formatRelative", "formatDuration", "intlFormatDistance"]);
/** date-fns tokens that produce words (month/day names, "PPP", am/pm, ordinals) and so depend on the locale. */
const WORDY_FORMAT = /MMM|LLL|E|PP|p{2,}|a|do|Do|cccc|qqq|QQQ/;

/** date-fns calls that print words but don't pass the UI language as `locale` (they would always be English). */
export function findUnlocalizedDates(files = sourceFiles()): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes("date-fns")) continue;
    const rel = path.relative(CLIENT_SRC, file);
    const sf = parse(file);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        const fmt = node.arguments[1];
        const wordy = DATE_FNS_WORDY.has(name) ||
          (name === "format" && fmt && ts.isStringLiteral(fmt) && WORDY_FORMAT.test(fmt.text.replace(/'[^']*'/g, "")));
        if (wordy) {
          const hasLocale = node.arguments.some((a) => ts.isObjectLiteralExpression(a) &&
            a.properties.some((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText() === "locale"));
          if (!hasLocale) {
            findings.push({ file: rel, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: node.getText().slice(0, 80), kind: "date-without-locale" });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Keys used in code                                                   */
/* ------------------------------------------------------------------ */

export type UsedKey = { file: string; line: number; ns: string; key: string; dynamicPrefix?: boolean; defaultValue?: string };

/** Namespace from useTranslation("ns") / useTranslation(["ns", ...]) in this file, if any. */
const fileNamespace = (sf: ts.SourceFile): string => {
  let ns = DEFAULT_NS;
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.expression.getText() === "useTranslation" && n.arguments[0]) {
      const a = n.arguments[0];
      if (ts.isStringLiteral(a)) ns = a.text;
      else if (ts.isArrayLiteralExpression(a) && a.elements[0] && ts.isStringLiteral(a.elements[0])) ns = a.elements[0].text;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return ns;
};

export function findUsedKeys(files = sourceFiles()): UsedKey[] {
  const out: UsedKey[] = [];
  for (const file of files) {
    const rel = path.relative(CLIENT_SRC, file);
    const sf = parse(file);
    const defaultNs = fileNamespace(sf);
    const visit = (node: ts.Node) => {
      if (isTranslateCall(node)) {
        const call = node as ts.CallExpression;
        const arg = call.arguments[0];
        const line = sf.getLineAndCharacterOfPosition(call.getStart()).line + 1;
        // t("key", { ns: "tickets" })
        let ns = defaultNs;
        const opts = call.arguments.find((a) => ts.isObjectLiteralExpression(a)) as ts.ObjectLiteralExpression | undefined;
        const nsProp = opts?.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === "ns") as ts.PropertyAssignment | undefined;
        if (nsProp && ts.isStringLiteral(nsProp.initializer)) ns = nsProp.initializer.text;
        // Default value: t("key", "Default") or t("key", { defaultValue: "Default" })
        let defaultValue: string | undefined;
        const second = call.arguments[1];
        if (second && (ts.isStringLiteral(second) || ts.isNoSubstitutionTemplateLiteral(second))) defaultValue = second.text;
        const dv = opts?.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === "defaultValue") as ts.PropertyAssignment | undefined;
        if (dv && (ts.isStringLiteral(dv.initializer) || ts.isNoSubstitutionTemplateLiteral(dv.initializer))) defaultValue = dv.initializer.text;
        const push = (raw: string, dynamicPrefix = false) => {
          let key = raw;
          let keyNs = ns;
          const colon = key.indexOf(":");
          if (colon > 0 && /^\w+$/.test(key.slice(0, colon))) {
            keyNs = key.slice(0, colon);
            key = key.slice(colon + 1);
          }
          out.push({ file: rel, line, ns: keyNs, key, dynamicPrefix, defaultValue: dynamicPrefix ? undefined : defaultValue });
        };
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) push(arg.text);
        else if (arg && ts.isTemplateExpression(arg) && arg.head.text.endsWith(".")) push(arg.head.text.slice(0, -1), true);
      } else if (ts.isObjectLiteralExpression(node)) {
        // Keys kept in data, translated later with t(item.labelKey, item.fallback):
        // { labelKey: "a.b", fallback: "Text" } / { descriptionKey: "a.c", descriptionFallback: "Text" }
        const props = new Map<string, string>();
        for (const p of node.properties) {
          if (ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer))) {
            props.set(p.name.getText().replace(/["']/g, ""), p.initializer.text);
          }
        }
        for (const [name, value] of props) {
          const m = name.match(/^(\w*?)Key$/);
          if (!m || !/^[\w-]+(\.[\w-]+)+$/.test(value)) continue;
          const base = m[1];
          const defaultValue = props.get(base === "label" || base === "" ? "fallback" : `${base}Fallback`) ?? props.get(`${base}Fallback`);
          out.push({ file: rel, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, ns: defaultNs, key: value, defaultValue });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Locale files                                                        */
/* ------------------------------------------------------------------ */

export type Flat = Record<string, string>;

export function flatten(obj: Record<string, unknown>, prefix = ""): Flat {
  const out: Flat = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}

export function supportedLanguages(): string[] {
  const src = fs.readFileSync(path.join(CLIENT_SRC, "lib/i18n.ts"), "utf8");
  const m = src.match(/supportedLngs:\s*\[([^\]]+)\]/);
  if (!m) throw new Error("supportedLngs not found in client/src/lib/i18n.ts");
  return [...m[1].matchAll(/["'](\w+)["']/g)].map((x) => x[1]);
}

export function namespaces(): string[] {
  const src = fs.readFileSync(path.join(CLIENT_SRC, "lib/i18n.ts"), "utf8");
  const m = src.match(/ns:\s*\[([^\]]+)\]/);
  return m ? [...m[1].matchAll(/["'](\w+)["']/g)].map((x) => x[1]) : [DEFAULT_NS];
}

/** locales[lang][ns] = flattened keys, or undefined when the file is missing. */
export function loadLocales(): Record<string, Record<string, Flat | undefined>> {
  const out: Record<string, Record<string, Flat | undefined>> = {};
  for (const lang of supportedLanguages()) {
    out[lang] = {};
    for (const ns of namespaces()) {
      const p = path.join(LOCALES_DIR, lang, `${ns}.json`);
      out[lang][ns] = fs.existsSync(p) ? flatten(JSON.parse(fs.readFileSync(p, "utf8"))) : undefined;
    }
  }
  return out;
}

export const placeholders = (s: string) =>
  [...new Set([...s.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]))].sort();

/* ------------------------------------------------------------------ */
/* CLI report                                                          */
/* ------------------------------------------------------------------ */

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const findings = findHardcodedText();
  const byFile = new Map<string, Finding[]>();
  for (const f of findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
  for (const [file, list] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${file} (${list.length})`);
    for (const f of list) console.log(`  ${f.line}\t${f.kind}\t${f.text.slice(0, 100)}`);
  }
  console.log(`\n${findings.length} hard-coded strings in ${byFile.size} files`);
  if (process.argv.includes("--json")) {
    fs.writeFileSync(process.argv[process.argv.indexOf("--json") + 1], JSON.stringify(findings, null, 1));
  }
}
