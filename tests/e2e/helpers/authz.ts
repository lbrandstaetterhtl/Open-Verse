// Access-control model of every API route, derived from the route inventory (tests/security/routes.ts)
// plus the router-level guards (`router.use(...)`) of each route file. Used by tests/e2e/authz.test.ts so
// that a new route is classified — and tested — automatically.
import fs from "node:fs";
import path from "node:path";
import { apiRoutes, type Route } from "../../security/routes";

const ROOT = path.resolve(import.meta.dirname, "../../..");

/** Group permissions offered by the admin UI (client/src/components/admin/GroupsManagement.tsx). */
export const PERMISSIONS = [
  "dashboard",
  "users",
  "reports",
  "groups",
  "security",
  "auto_punishment",
  "logs",
  "analytics",
  "performance",
  "tickets",
  "stress_test",
  "settings",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type Access =
  | { kind: "public" }
  | { kind: "user" } // any logged-in user; object-level checks (if any) happen in the handler
  | { kind: "admin"; permission: Permission } // role admin/owner AND the group permission
  | { kind: "owner" }; // platform owner only

export type ClassifiedRoute = Route & { key: string; guards: string[]; access: Access };

/** Routes anyone may call without a session. Everything else must reject anonymous callers. */
const PUBLIC = new Set([
  "GET /api/health",
  "GET /api/csrf-token",
  "GET /api/public/settings",
  "POST /api/login",
  "POST /api/register",
  "POST /api/logout",
  "GET /api/posts",
  "GET /api/posts/:id",
  "GET /api/posts/:postId/comments",
  "GET /api/communities",
  "GET /api/communities/:slug",
  ...["/api", "/api/user", "/api/users"].flatMap((p) => [
    `GET ${p}/:username`,
    `GET ${p}/:username/posts`,
    `GET ${p}/:username/comments`,
    `GET ${p}/:username/liked`,
  ]),
]);

/**
 * Routes whose permission in the admin UI differs from (or is missing in) the server guard. The UI hides
 * these pages unless the admin's group has the permission (client/src/components/layout/AppSidebar.tsx,
 * AutoPunishmentPage.tsx, StressTestPage.tsx), and hasPermission's own rule is "no group permission = no
 * special access" (server/middleware/auth.ts) — so the designed permission is what the tests assert.
 */
const DESIGN_PERMISSION: Array<[RegExp, Permission]> = [
  [/^\/api\/admin\/groups(\/|$)/, "groups"],
  [/^\/api\/security\/stress-test/, "stress_test"],
  [/^\/api\/admin\/auto-punishments(\/|$)/, "auto_punishment"],
  [/^\/api\/tickets\/stats$/, "tickets"],
];

const ROLE_ONLY = new Set(["isAdmin", "checkAdminOrOwner"]);
const OWNER_ONLY = new Set(["isOwner", "checkOwner"]);

type FileInfo = { uses: Array<{ line: number; guard: string }>; aliases: Map<string, string> };
const fileCache = new Map<string, FileInfo>();

/** `router.use(isAdmin)` / `router.use(hasPermission("logs"))` lines and `const x = hasPermission("y")` aliases. */
function fileInfo(file: string): FileInfo {
  let info = fileCache.get(file);
  if (info) return info;
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const uses: FileInfo["uses"] = [];
  src.split("\n").forEach((l, i) => {
    const m = l.match(/^\s*router\.use\(\s*([A-Za-z]+(?:\(\s*["'][\w-]+["']\s*\))?)\s*\)/);
    if (m) uses.push({ line: i + 1, guard: m[1].replace(/\s+/g, "").replaceAll("'", '"') });
  });
  const aliases = new Map<string, string>();
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*(hasPermission\(\s*["'][\w-]+["']\s*\))/g)) {
    aliases.set(m[1], m[2].replace(/\s+/g, "").replaceAll("'", '"'));
  }
  info = { uses, aliases };
  fileCache.set(file, info);
  return info;
}

/** All guards that run for a route: router-level `router.use` above it, then its own middleware. */
export function guardsOf(route: Route): string[] {
  const { uses, aliases } = fileInfo(route.file);
  const own = route.middleware.map((m) => aliases.get(m) ?? m);
  return [...uses.filter((u) => u.line < route.line).map((u) => u.guard), ...own];
}

const permOf = (guards: string[]) =>
  guards.map((g) => g.match(/^hasPermission\("([\w-]+)"\)$/)?.[1]).filter(Boolean).at(-1) as Permission | undefined;

export function accessOf(route: Route, guards = guardsOf(route)): Access {
  const key = `${route.method.toUpperCase()} ${route.path}`;
  if (PUBLIC.has(key)) return { kind: "public" };
  if (guards.some((g) => OWNER_ONLY.has(g))) return { kind: "owner" };
  const design = DESIGN_PERMISSION.find(([re]) => re.test(route.path))?.[1];
  if (design) return { kind: "admin", permission: design };
  const perm = permOf(guards);
  if (perm) return { kind: "admin", permission: perm };
  if (guards.some((g) => ROLE_ONLY.has(g))) {
    throw new Error(`${key} is admin-only but has no permission in the design map (helpers/authz.ts)`);
  }
  return { kind: "user" };
}

/** Admin routes that only check the role (isAdmin / checkAdminOrOwner) and no group permission. */
export function roleOnlyRoutes(routes: ClassifiedRoute[]): string[] {
  return routes
    .filter((r) => r.guards.some((g) => ROLE_ONLY.has(g)) && !r.guards.some((g) => permOf([g]) || OWNER_ONLY.has(g)))
    .map((r) => `${r.key} (${r.file}:${r.line})`);
}

export function classifiedRoutes(): ClassifiedRoute[] {
  return apiRoutes().map((r) => {
    const guards = guardsOf(r);
    return { ...r, key: `${r.method.toUpperCase()} ${r.path}`, guards, access: accessOf(r, guards) };
  });
}

/** Path parameters that hold numeric database ids. */
export const NUMERIC_PARAMS = new Set(["id", "userId", "postId", "reportId", "cId"]);

export const paramsOf = (p: string) => [...p.matchAll(/:(\w+)\??/g)].map((m) => m[1]);

export function fillPath(p: string, values: (param: string) => string | number): string {
  return p.replace(/:(\w+)\??/g, (_, name: string) => encodeURIComponent(String(values(name))));
}

/** Response bodies must never carry SQL, driver errors or stack traces. */
export const LEAK = /failed query|syntax error|invalid input syntax|out of range for type|relation "|\bselect .* from\b|at \/|node_modules|stack/i;
