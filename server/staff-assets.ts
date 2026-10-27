import type { Request, Response, NextFunction } from "express";
import path from "node:path";

/**
 * Staff-only static files: the admin/owner area of the client is built into assets/staff-<hash>.js chunks
 * (vite.config.ts, client/src/staff) and its texts into the staff locale namespaces (client/src/lib/i18n.ts,
 * STAFF_NAMESPACES). Nobody but an admin or owner may download them: for everyone else they answer exactly like
 * a file that does not exist (same 404 as an unknown file, see sendStaticNotFound), so non-staff cannot even
 * tell which staff files exist.
 *
 * Mount staffAssetGuard after the session + passport middleware (it reads req.user) and before the static
 * file handler (serveStatic in server/vite.ts). serveStatic refuses staff files on its own unless the guard
 * has let the request through, so a missing or misplaced guard fails closed (404 for everyone).
 */

/** Locale namespaces every visitor loads (client/src/lib/i18n.ts `ns`); every other namespace is staff-only. */
export const PUBLIC_LOCALE_NAMESPACES: ReadonlySet<string> = new Set(["translation", "tickets", "server"]);

/** URL path as express.static resolves it (percent-decoded, "." and ".." collapsed); null if it cannot be decoded. */
export function normalizeStaticPath(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  // Lower case: on a case-insensitive file system (Windows/macOS dev machines) /Assets/Staff-x.js is the same file
  return path.posix.normalize(decoded.replace(/\\/g, "/")).toLowerCase();
}

/** True for staff chunks, staff locale files (any namespace that is not public) and, in dev, the staff sources. */
export function isStaffAssetPath(urlPath: string): boolean {
  const p = normalizeStaticPath(urlPath);
  if (p === null) return false;
  if (p.startsWith("/assets/staff-")) return true;
  if (p.startsWith("/src/staff/")) return true; // Vite dev server (client/src/staff)
  const m = /^\/locales\/[^/]+\/([^/]+)\.json$/.exec(p);
  return !!m && !PUBLIC_LOCALE_NAMESPACES.has(m[1]);
}

const STAFF_ROLES = new Set(["admin", "owner"]);

export function isStaffRequest(req: Request): boolean {
  const user = req.user as { role?: string | null } | undefined;
  const authenticated = typeof req.isAuthenticated === "function" ? req.isAuthenticated() : !!user;
  return authenticated && !!user && STAFF_ROLES.has(user.role ?? "");
}

/** The one answer for a static file that does not exist (also used for refused staff files). */
export function sendStaticNotFound(res: Response): void {
  res.status(404);
  res.setHeader("Cache-Control", "no-store");
  res.type("text/plain").send("Not found");
}

/** res.locals flag: the guard checked this staff file request and the user is staff. */
export const STAFF_ASSET_ALLOWED = "staffAssetAllowed";

export function staffAssetGuard(req: Request, res: Response, next: NextFunction): void {
  if (!isStaffAssetPath(req.path)) return next();
  if (!isStaffRequest(req)) return sendStaticNotFound(res);
  res.locals[STAFF_ASSET_ALLOWED] = true;
  // Per-user content: a shared cache (proxy/CDN) must never hand it to someone else
  res.setHeader("Vary", "Cookie");
  next();
}
