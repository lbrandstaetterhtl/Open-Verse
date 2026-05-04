import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { bans, users } from "@shared/schema";
import { eq, and, or, gt, sql } from "drizzle-orm";
import { activityLogger } from "../services/activity-logger";
import crypto from "node:crypto";

/**
 * APE-FIX [SEC-010]: Stable Hardware Fingerprinting
 * Extracts OS and Browser Family to prevent fingerprint changes on browser updates.
 */
export async function banCheckMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const userAgent = (req.headers["user-agent"] as string) || "";
  const now = Math.floor(Date.now() / 1000);
  const userId = (req.user as any)?.id;
  
  const deviceFingerprint = generateFingerprint(userAgent, req.headers);

  try {
    const activeBans = await db.select()
      .from(bans)
      .where(and(
        eq(bans.isActive, 1),
        or(
          eq(bans.ipAddress, ip),
          eq(bans.deviceFingerprint, deviceFingerprint),
          userId ? eq(bans.userId, userId) : sql`1=0`
        ),
        or(
          eq(bans.isPermanent, 1),
          gt(bans.expiresAt, now)
        )
      ));

    if (activeBans.length > 0) {
      // IP Ban
      if (activeBans.some(b => b.banType === 'ip' && b.ipAddress === ip)) {
        return res.status(403).json({ error: "Zugriff verweigert (IP-Sperre)", code: "IP_BANNED" });
      }

      // Hardware Ban
      if (activeBans.some(b => b.banType === 'hardware' && b.deviceFingerprint === deviceFingerprint)) {
        return res.status(403).json({ error: "Hardware gesperrt", code: "DEVICE_BANNED" });
      }

      // Account Ban
      if (userId) {
        const userBan = activeBans.find(b => b.userId === userId && (b.banType === 'account' || b.banType === 'shadow'));
        if (userBan) {
          if (userBan.isShadow) {
            (req as any).isShadowBanned = true;
          } else {
            return res.status(403).json({ error: "Account gesperrt", code: "ACCOUNT_BANNED" });
          }
        }
      }
    }

    if (userId) {
      const [user] = await db.select({ isFrozen: users.isFrozen, frozenUntil: users.frozenUntil })
        .from(users).where(eq(users.id, userId)).limit(1);

      if (user?.isFrozen) {
        if (!user.frozenUntil || user.frozenUntil > now) {
          if (req.method !== "GET") {
            return res.status(403).json({
              error: "Account vorübergehend eingefroren",
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

    (req as any).deviceFingerprint = deviceFingerprint;
    next();
  } catch (error) {
    console.error("[BanCheck] Error:", error);
    next(); 
  }
}

function generateFingerprint(userAgent: string, headers: any): string {
  // Extract stable components
  const os = /Windows/.test(userAgent) ? 'Win' :
             /Mac/.test(userAgent) ? 'Mac' :
             /Linux/.test(userAgent) ? 'Lin' :
             /Android/.test(userAgent) ? 'And' :
             /iPhone|iPad/.test(userAgent) ? 'iOS' : 'Unk';
             
  const browser = /Firefox/.test(userAgent) ? 'FF' :
                  /Edg/.test(userAgent) ? 'Edge' :
                  /Chrome/.test(userAgent) ? 'Chr' :
                  /Safari/.test(userAgent) ? 'Saf' : 'Oth';
                  
  const lang = (headers['accept-language'] || '').split(',')[0].split('-')[0];

  const components = `${os}|${browser}|${lang}`;
  return crypto.createHash('sha256').update(components).digest('hex').slice(0, 16);
}
