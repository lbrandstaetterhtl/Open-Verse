import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { bans, users } from "@shared/schema";
import { eq, and, or, gt, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { logger } from "../logger";

/**
 * Device bans need an identifier for one browser. Earlier versions hashed OS + browser family + language
 * from the request headers, so one "device" ban hit every user with the same setup (e.g. all German Chrome
 * users on Windows). Each browser now gets a random id in an HttpOnly cookie instead; a hardware ban
 * targets exactly that browser.
 */
export const DEVICE_COOKIE = "ov_device";
const DEVICE_ID = /^[a-f0-9]{32}$/;
const TWO_YEARS_MS = 2 * 365 * 24 * 3600 * 1000;

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eqAt = part.indexOf("=");
    if (eqAt < 0) continue;
    if (part.slice(0, eqAt).trim() === name) return decodeURIComponent(part.slice(eqAt + 1).trim());
  }
  return undefined;
}

export function deviceIdFor(req: Request, res: Response): string | undefined {
  const existing = readCookie(req, DEVICE_COOKIE);
  if (existing && DEVICE_ID.test(existing)) return existing;
  // Only API requests get a new id: static files stay cacheable without a Set-Cookie header.
  if (!req.path.startsWith("/api")) return undefined;
  const id = crypto.randomBytes(16).toString("hex");
  res.cookie(DEVICE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: TWO_YEARS_MS, path: "/" });
  return id;
}

export async function banCheckMiddleware(req: Request, res: Response, next: NextFunction) {
  // Logging out is always allowed (also for frozen or banned clients).
  if (req.path === "/api/logout") return next();

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const userId = (req.user as any)?.id;
  const deviceId = deviceIdFor(req, res);

  try {
    const activeBans = await db.select()
      .from(bans)
      .where(and(
        eq(bans.isActive, 1),
        or(
          eq(bans.ipAddress, ip),
          deviceId ? eq(bans.deviceFingerprint, deviceId) : sql`1=0`,
          userId ? eq(bans.userId, userId) : sql`1=0`
        ),
        or(
          eq(bans.isPermanent, 1),
          gt(bans.expiresAt, new Date())
        )
      ));

    if (activeBans.length > 0) {
      // IP Ban
      if (activeBans.some(b => b.banType === 'ip' && b.ipAddress === ip)) {
        return res.status(403).json({ error: "Access denied (IP ban)", code: "IP_BANNED" });
      }

      // Hardware Ban
      if (deviceId && activeBans.some(b => b.banType === 'hardware' && b.deviceFingerprint === deviceId)) {
        return res.status(403).json({ error: "This device is banned", code: "DEVICE_BANNED" });
      }

      // Account Ban
      if (userId) {
        const userBan = activeBans.find(b => b.userId === userId && (b.banType === 'account' || b.banType === 'shadow'));
        if (userBan) {
          if (userBan.isShadow) {
            (req as any).isShadowBanned = true;
          } else {
            return res.status(403).json({ error: "This account is banned", code: "ACCOUNT_BANNED" });
          }
        }
      }
    }

    if (userId) {
      const [user] = await db.select({ isFrozen: users.isFrozen, frozenUntil: users.frozenUntil })
        .from(users).where(eq(users.id, userId)).limit(1);

      if (user?.isFrozen) {
        const frozenUntilMs = user.frozenUntil instanceof Date
          ? user.frozenUntil.getTime()
          : Number(user.frozenUntil) * 1000;
        if (!user.frozenUntil || frozenUntilMs > Date.now()) {
          if (req.method !== "GET" && req.method !== "HEAD") {
            return res.status(403).json({
              error: "This account is temporarily frozen",
              code: "ACCOUNT_FROZEN",
              frozenUntil: user.frozenUntil,
            });
          }
        } else {
          // Auto-cleanup expired freeze
          await db.update(users).set({ isFrozen: 0, frozenUntil: null, freezeReason: null }).where(eq(users.id, userId));
        }
      }
    }

    (req as any).deviceFingerprint = deviceId;
    next();
  } catch (error) {
    logger.error('security', "[BanCheck] ban lookup failed", error);
    next();
  }
}
