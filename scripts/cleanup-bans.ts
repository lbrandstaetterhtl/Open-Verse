import { db } from "../server/db";
import { bans, users } from "../shared/schema";
import { eq, and, gte, inArray } from "drizzle-orm";

/**
 * APE-FIX [CLEANUP-001]: Reverse False-Positive Auto-Bans
 * Identifies and revokes bans created by the auto-punishment system that likely
 * hit legitimate users due to the analyzed bugs.
 */
async function cleanupFalsePositiveBans() {
  console.log("Starting Auto-Punishment Cleanup...");
  
  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = now - (30 * 86400);

  try {
    // 1. Find all active bans created by auto-punishment
    const affectedBans = await db.select()
      .from(bans)
      .where(and(
        eq(bans.createdByType, 'auto_punishment'),
        eq(bans.isActive, 1),
        gte(bans.createdAt, thirtyDaysAgo)
      ))
      .execute();

    console.log(`Found ${affectedBans.length} active auto-bans to review.`);

    for (const ban of affectedBans) {
      console.log(`Revoking ban ${ban.id} for user ${ban.userId || 'IP: ' + ban.ipAddress}`);
      
      // Revoke the ban
      await db.update(bans)
        .set({
          isActive: 0,
          revokedAt: now,
          revokeReason: "Automatisch aufgehoben: Systemweites Update der Auto-Punishment Thresholds & Fix der Timestamp-Logik (APE-FIX-001)",
        })
        .where(eq(bans.id, ban.id));

      // Reset user status if it was frozen or shadowbanned
      if (ban.userId) {
        await db.update(users)
          .set({
            isFrozen: 0,
            isShadowBanned: 0,
            frozenUntil: null,
            freezeReason: null,
          })
          .where(eq(users.id, ban.userId));
      }
    }

    console.log("Cleanup complete. All suspicious auto-bans have been revoked.");
  } catch (error) {
    console.error("Cleanup failed:", error);
  }
}

// Execute
cleanupFalsePositiveBans().then(() => process.exit(0));
