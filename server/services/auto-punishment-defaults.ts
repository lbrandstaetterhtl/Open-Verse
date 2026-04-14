import { db } from "../db";
import { autoPunishmentRules } from "@shared/schema";
import { eq } from "drizzle-orm";

const DEFAULT_RULES = [
  {
    name: "Brute Force → Account einfrieren",
    description: "Friert den Account bei Brute-Force-Angriff für 2 Stunden ein",
    isActive: 1,
    anomalyType: "brute_force_login",
    severityThreshold: "high",
    action: "freeze",
    actionDurationHours: 2,
    actionReason: "Zu viele fehlgeschlagene Login-Versuche. Account vorübergehend eingefroren.",
    escalateAfterCount: 1,
    escalationWindowHours: 1,
    cooldownHours: 2,
    createdBy: null,
  },
  {
    name: "Kritischer Brute Force → IP-Ban",
    description: "IP-Ban bei wiederholtem Brute-Force (nach dem Freeze)",
    isActive: 1,
    anomalyType: "brute_force_login",
    severityThreshold: "critical",
    action: "ip_ban",
    actionDurationHours: 24,
    actionReason: "Wiederholter Brute-Force-Angriff. IP für 24 Stunden gesperrt.",
    escalateAfterCount: 3,
    escalationWindowHours: 24,
    cooldownHours: 24,
    createdBy: null,
  },
  {
    name: "Content-Spam → Account einfrieren",
    description: "Friert den Account bei extremem Content-Spam ein",
    isActive: 1,
    anomalyType: "spam_content",
    severityThreshold: "high",
    action: "freeze",
    actionDurationHours: 1,
    actionReason: "Automatisch erkanntes Spam-Verhalten. Account vorübergehend eingefroren.",
    escalateAfterCount: 1,
    escalationWindowHours: 1,
    cooldownHours: 1,
    createdBy: null,
  },
  {
    name: "Mass Action → Warnung",
    description: "Warnt den User bei Massen-Aktionen",
    isActive: 1,
    anomalyType: "mass_action",
    severityThreshold: "warning",
    action: "warn",
    actionDurationHours: 0,
    actionReason: "Ungewöhnlich hohe Aktivität erkannt. Bitte halte dich an unsere Community-Richtlinien.",
    escalateAfterCount: 1,
    escalationWindowHours: 1,
    cooldownHours: 6,
    createdBy: null,
  },
  {
    name: "API-Abuse → Shadowban",
    description: "Shadowbannt bei schwerem API-Missbrauch",
    isActive: 1,
    anomalyType: "api_abuse",
    severityThreshold: "high",
    action: "shadow_ban",
    actionDurationHours: 24,
    actionReason: "API-Missbrauch erkannt.",
    escalateAfterCount: 2,
    escalationWindowHours: 1,
    cooldownHours: 24,
    createdBy: null,
  },
];

export async function seedDefaultRules(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  try {
    for (const rule of DEFAULT_RULES) {
      const existing = await db.select()
        .from(autoPunishmentRules)
        .where(eq(autoPunishmentRules.name, rule.name))
        .get();
      if (!existing) {
        await db.insert(autoPunishmentRules).values({
          ...rule,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    console.log("[AutoPunishment] Default rules seeded");
  } catch (error) {
    console.error("[AutoPunishment] Error seeding rules:", error);
  }
}
