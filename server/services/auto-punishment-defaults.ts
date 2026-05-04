import { db } from "../db";
import { autoPunishmentRules } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * APE-FIX [DEF-001]: Hardened Default Rules
 * Increased escalation counts and windows to prevent false positives for active users.
 */
const DEFAULT_RULES = [
  {
    name: "Brute Force → Account einfrieren",
    description: "Friert den Account bei Brute-Force-Angriff (nach 3 Vorfällen) für 1 Stunde ein",
    isActive: 1,
    anomalyType: "brute_force_login",
    severityThreshold: "high",
    action: "freeze",
    actionDurationHours: 1, // War 2h -> 1h reicht für Mensch-Abkühlung
    actionReason: "Ungewöhnlich viele fehlgeschlagene Login-Versuche. Account zur Sicherheit 1h eingefroren.",
    escalateAfterCount: 3, // War 1 -> Jetzt 3 Anomalien nötig (Puffer für Tippfehler)
    escalationWindowHours: 24, // 24h Gedächtnis
    cooldownHours: 2,
    createdBy: null,
  },
  {
    name: "Kritischer Brute Force → IP-Ban",
    description: "IP-Ban bei massiven Brute-Force Attacken",
    isActive: 1,
    anomalyType: "brute_force_login",
    severityThreshold: "critical",
    action: "ip_ban",
    actionDurationHours: 24,
    actionReason: "Massive Brute-Force Attacke erkannt. IP temporär gesperrt.",
    escalateAfterCount: 5, // Erhöht auf 5
    escalationWindowHours: 24,
    cooldownHours: 24,
    createdBy: null,
  },
  {
    name: "Content-Spam → Warnung & Rate Limit",
    description: "Warnt den User zuerst bei Content-Spam",
    isActive: 1,
    anomalyType: "spam_content",
    severityThreshold: "high",
    action: "warn", // War 'freeze' -> Jetzt zuerst Warnung
    actionDurationHours: 0,
    actionReason: "Bitte poste nicht so schnell hintereinander. Dein Account wurde als auffällig markiert.",
    escalateAfterCount: 3, // 3 Vorfälle bis Warnung
    escalationWindowHours: 24,
    cooldownHours: 6,
    createdBy: null,
  },
  {
    name: "Wiederholter Spam → Account einfrieren",
    description: "Friert Account ein wenn Warnung ignoriert wird",
    isActive: 1,
    anomalyType: "spam_content",
    severityThreshold: "critical",
    action: "freeze",
    actionDurationHours: 2,
    actionReason: "Wiederholter Content-Spam trotz Warnung. Account 2h eingefroren.",
    escalateAfterCount: 5,
    escalationWindowHours: 24,
    cooldownHours: 12,
    createdBy: null,
  },
  {
    name: "API-Abuse → Shadowban",
    description: "Shadowbannt bei schwerem API-Missbrauch",
    isActive: 1,
    anomalyType: "api_abuse",
    severityThreshold: "high",
    action: "shadow_ban",
    actionDurationHours: 12,
    actionReason: "API-Missbrauch erkannt.",
    escalateAfterCount: 3, // War 2 -> 3
    escalationWindowHours: 2,
    cooldownHours: 24,
    createdBy: null,
  },
];

export async function seedDefaultRules(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  try {
    for (const rule of DEFAULT_RULES) {
      const results = await db.select()
        .from(autoPunishmentRules)
        .where(eq(autoPunishmentRules.name, rule.name))
        .limit(1);
      
      if (results.length === 0) {
        await db.insert(autoPunishmentRules).values({
          ...rule,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        // APE-FIX: Update existing rules to new thresholds if they are defaults
        await db.update(autoPunishmentRules)
          .set({
            escalateAfterCount: rule.escalateAfterCount,
            action: rule.action,
            actionDurationHours: rule.actionDurationHours,
            severityThreshold: rule.severityThreshold,
            updatedAt: now
          })
          .where(eq(autoPunishmentRules.name, rule.name));
      }
    }
    console.log("[AutoPunishment] Default rules updated with hardened thresholds");
  } catch (error) {
    console.error("[AutoPunishment] Error seeding rules:", error);
  }
}
