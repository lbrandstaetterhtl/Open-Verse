import type { Router, Request, Response, NextFunction } from "express";

const MAX_ID = 2_147_483_647; // Postgres integer

/** Strict id parsing: only plain positive integers that fit the database column ("12", not "12.5", "-1", "1e3", "abc"). */
export function parseId(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 && value <= MAX_ID ? value : null;
  if (typeof value !== "string" || !/^[1-9]\d{0,9}$/.test(value)) return null;
  const n = Number(value);
  return n <= MAX_ID ? n : null;
}

/**
 * Rejects malformed numeric route params with 404 before any handler runs, e.g.
 * validateIdParams(router, ["id", "userId"]). Prevents 500s and silent truncation ("169.5" → 169).
 */
export function validateIdParams(router: Router, names: string[]) {
  for (const name of names) {
    router.param(name, (req: Request, res: Response, next: NextFunction, value: string) => {
      if (parseId(value) === null) return res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      next();
    });
  }
}
