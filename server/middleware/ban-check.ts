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
// Long enough to keep a device ban useful, short enough not to be a long-term tracking id.
const DEVICE_COOKIE_MAX_AGE_MS = 180 * 24 * 3600 * 1000;

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eqAt = part.indexOf("=");
    if (eqAt < 0) continue;
    if (part.slice(0, eqAt).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eqAt + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** The browser's device id, if it has one. Anonymous browsing never creates one. */
export function deviceIdFor(req: Request): string | undefined {
  const existing = readCookie(req, DEVICE_COOKIE);
  return existing && DEVICE_ID.test(existing) ? existing : undefined;
}

/**
 * Gives the browser a device id (or renews the existing one) when an account signs in or registers, which
 * is where device bans matter. Visitors who only browse never get this cookie.
 */
export function issueDeviceId(req: Request, res: Response): string {
  const id = deviceIdFor(req) ?? crypto.randomBytes(16).toString("hex");
  res.cookie(DEVICE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: DEVICE_COOKIE_MAX_AGE_MS, path: "/" });
  return id;
}

export async function banCheckMiddleware(req: Request, res: Response, next: NextFunction) {
  // Logging out is always allowed (also for frozen or banned clients).
  if (req.path === "/api/logout") return next();

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const userId = (req.user as any)?.id;
  const deviceId = deviceIdFor(req);

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
      if (activeBans.some((b: any) => b.banType === 'ip' && b.ipAddress === ip)) {
        return res.status(403).json({ error: "Access denied (IP ban)", code: "IP_BANNED" });
      }

      // Hardware Ban
      if (deviceId && activeBans.some((b: any) => b.banType === 'hardware' && b.deviceFingerprint === deviceId)) {
        return res.status(403).json({ error: "This device is banned", code: "DEVICE_BANNED" });
      }

      // Account Ban
      if (userId) {
        const userBan = activeBans.find((b: any) => b.userId === userId && (b.banType === 'account' || b.banType === 'shadow'));
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
