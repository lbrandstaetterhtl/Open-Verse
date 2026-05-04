import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { bans, users } from "@shared/schema";
import { eq, and, or, gt } from "drizzle-orm";
import { activityLogger } from "../services/activity-logger";
import crypto from "node:crypto";

export async function banCheckMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const userAgent = (req.headers["user-agent"] as string) || "";
  const now = Math.floor(Date.now() / 1000);
  const userId = (req.user as any)?.id;
  const deviceFingerprint = generateFingerprint(userAgent, req.headers);

  try {
    // STABILITY-FIX [STAB-010]: Consolidate Ban Checks (Batch Query)
    // Fetch all active and relevant bans in one go
    const activeBans = await db.select()
      .from(bans)
      .where(and(
        eq(bans.isActive, 1),
        or(
          eq(bans.ipAddress, ip),
          eq(bans.deviceFingerprint, deviceFingerprint),
          userId ? eq(bans.userId, userId) : undefined
        ),
        or(
          eq(bans.isPermanent, 1),
          gt(bans.expiresAt, now)
        )
      ));

    if (activeBans.length > 0) {
      // 1. IP Ban check
      if (activeBans.some(b => b.banType === 'ip' && b.ipAddress === ip)) {
        activityLogger.log({
          action: "security.blocked_ip",
          category: "security",
          description: `Blocked access from banned IP ${ip}`,
          severity: "warning",
          status: "blocked",
          req,
        }).catch(() => {});

        return res.status(403).json({ error: "Access denied", code: "IP_BANNED" });
      }

      // 2. Hardware Ban check
      if (activeBans.some(b => b.banType === 'hardware' && b.deviceFingerprint === deviceFingerprint)) {
        return res.status(403).json({ error: "Access denied", code: "DEVICE_BANNED" });
      }

      // 3. User Ban check
      if (userId) {
        const userBan = activeBans.find(b => b.userId === userId && (b.banType === 'account' || b.banType === 'shadow'));
        if (userBan) {
          if (userBan.isShadow) {
            (req as any).isShadowBanned = true;
          } else {
            if (req.session) req.session.destroy(() => {});
            return res.status(403).json({ error: "Your account has been suspended", code: "ACCOUNT_BANNED" });
          }
        }
      }
    }

    // 4. Account Freeze check (separate because it's on the users table)
    if (userId) {
      const usersList = await db.select({ isFrozen: users.isFrozen, frozenUntil: users.frozenUntil })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const user = usersList[0];

      if (user?.isFrozen) {
        if (!user.frozenUntil || user.frozenUntil > now) {
          if (req.method !== "GET") {
            return res.status(403).json({
              error: "Your account is temporarily frozen",
              code: "ACCOUNT_FROZEN",
              frozenUntil: user.frozenUntil,
            });
          }
        } else if (user.frozenUntil && user.frozenUntil <= now) {
          await db.update(users)
            .set({ isFrozen: 0, frozenUntil: null, freezeReason: null })
            .where(eq(users.id, userId));
        }
      }
    }

    (req as any).deviceFingerprint = deviceFingerprint;
    next();
  } catch (error) {
    console.error("[BanCheck] Error:", error);
    next(); 
  }
}


function generateFingerprint(userAgent: string, headers: any): string {
  const components = [
    userAgent,
    headers["accept-language"] ?? "",
    headers["accept-encoding"] ?? "",
    headers["accept"] ?? "",
  ].join("|");

  return crypto.createHash('sha256').update(components).digest('hex');
}
