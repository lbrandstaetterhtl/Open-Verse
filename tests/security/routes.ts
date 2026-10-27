// Route inventory of the Express API, built from the source with the TypeScript AST.
// Used by the access-control and input tests so that a new route is tested automatically.
//   npx tsx tests/security/routes.ts      -> prints the inventory
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "../..");

export type Route = {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string; // full path, e.g. /api/posts/:id
  file: string;
  line: number;
  middleware: string[]; // e.g. ["isAuthenticated", "checkAdminOrOwner", "hasPermission(users)"]
};

/** Mount prefixes from server/routes/index.ts: app.use("/api/posts", postsRoutes) and the import that names the file. */
function mounts(): Map<string, string[]> {
  const src = fs.readFileSync(path.join(ROOT, "server/routes/index.ts"), "utf8");
  const importOf = new Map<string, string>();
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+["']\.\/([\w-]+)["']/g)) importOf.set(m[1], m[2]);
  const out = new Map<string, string[]>();
  for (const m of src.matchAll(/app\.use\(\s*["'](\/api[^"']*)["']\s*,\s*(\w+)\s*\)/g)) {
    const file = importOf.get(m[2]);
    if (file) out.set(file, [...(out.get(file) ?? []), m[1]]);
  }
  return out;
}

const METHODS = new Set(["get", "post", "put", "patch", "delete"]);

function routesIn(file: string, prefixes: string[], receiver: RegExp): Route[] {
  const full = path.join(ROOT, file);
  const sf = ts.createSourceFile(full, fs.readFileSync(full, "utf8"), ts.ScriptTarget.Latest, true);
  const out: Route[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && METHODS.has(n.expression.name.text) &&
      receiver.test(n.expression.expression.getText()) && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const sub = (n.arguments[0] as ts.StringLiteral).text;
      const middleware = n.arguments.slice(1, -1).map((a) => a.getText().replace(/\s+/g, ""));
      for (const prefix of prefixes) {
        // users.ts: the /:username routes only answer under /api/users (usersMountOnly), not under /api or /api/user
        if (middleware.includes("usersMountOnly") && prefix !== "/api/users") continue;
        const p = (prefix + (sub === "/" ? "" : sub)).replace(/\/+$/, "") || "/";
        out.push({ method: n.expression.name.text as Route["method"], path: p, file, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, middleware });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export function apiRoutes(): Route[] {
  const all: Route[] = [];
  for (const [file, prefixes] of mounts()) all.push(...routesIn(`server/routes/${file}.ts`, prefixes, /^router$/));
  all.push(...routesIn("server/routes/index.ts", [""], /^app$/));
  all.push(...routesIn("server/auth.ts", [""], /^app$/));
  all.push(...routesIn("server/index.ts", [""], /^app$/));
  // de-duplicate (userRoutes is mounted under /api/users, /api/user and /api)
  const seen = new Set<string>();
  return all.filter((r) => r.path.startsWith("/api") && !seen.has(`${r.method} ${r.path}`) && seen.add(`${r.method} ${r.path}`))
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const r = apiRoutes();
  for (const x of r) console.log(`${x.method.toUpperCase().padEnd(6)} ${x.path.padEnd(58)} ${x.middleware.join(" ")}  (${x.file}:${x.line})`);
  console.log(`\n${r.length} routes`);
}
