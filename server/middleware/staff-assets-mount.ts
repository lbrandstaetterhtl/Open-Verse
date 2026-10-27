import type { Request, Response, NextFunction } from "express";

/**
 * TEMPORARY until server/staff-assets.ts (bundle area) exists: no-op guard and the path predicate that
 * decides which static paths load the session.
 */
export function staffAssetGuard(_req: Request, _res: Response, next: NextFunction) {
  next();
}

const PUBLIC_NAMESPACES = new Set(["translation", "server", "tickets"]);

export function isStaffAssetPath(path: string): boolean {
  if (path.startsWith("/assets/staff-")) return true;
  const m = /^\/locales\/[^/]+\/([^/]+)\.json$/.exec(path);
  return !!m && !PUBLIC_NAMESPACES.has(m[1]);
}
