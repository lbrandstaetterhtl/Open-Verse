import { db } from "../db";
import { adminSettings } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { ActivityLogger } from "./activity-log";
import { type Request } from "express";

/* FEATURE [AS-003]: Admin Settings – Implementation of the central settings service. */
export class SettingsService {
  private static cache: Map<string, { value: any; expiry: number }> = new Map();
  private static TTL = 5 * 60 * 1000; // 5 minutes

  static async get(category: string, key: string, defaultValue?: any): Promise<any> {
    const cacheKey = `${category}:${key}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }

    try {
      const [setting] = await db
        .select()
        .from(adminSettings)
        .where(and(eq(adminSettings.category, category), eq(adminSettings.key, key)));

      if (!setting) return defaultValue ?? null;

      let parsedValue: any = setting.value;
      if (setting.valueType === "boolean") parsedValue = setting.value === "true";
      else if (setting.valueType === "integer") parsedValue = parseInt(setting.value || "0");
      else if (setting.valueType === "json") {
        try { parsedValue = JSON.parse(setting.value || "{}"); } catch { parsedValue = {}; }
      }

      this.cache.set(cacheKey, { value: parsedValue, expiry: Date.now() + this.TTL });
      return parsedValue;
    } catch (error) {
      console.error(`Failed to fetch setting ${cacheKey}:`, error);
      return defaultValue ?? null;
    }
  }

  static async set(req: Request, category: string, key: string, value: any) {
    const user = req.user as any;
    const adminId = user?.id;

    // Get current value for logging
    const oldValue = await this.get(category, key);
    const stringValue = typeof value === "string" ? value : JSON.stringify(value);

    await db
      .update(adminSettings)
      .set({
        value: stringValue,
        updatedBy: adminId,
        updatedAt: new Date(),
      })
      .where(and(eq(adminSettings.category, category), eq(adminSettings.key, key)));

    // Invalidate cache
    this.cache.delete(`${category}:${key}`);

    // Log the change
    const [setting] = await db
      .select()
      .from(adminSettings)
      .where(and(eq(adminSettings.category, category), eq(adminSettings.key, key)));

    ActivityLogger.log(req, {
      action: "settings.update",
      category: "settings",
      targetType: "Setting",
      targetId: key,
      targetLabel: `${category}.${key}`,
      description: `Updated setting ${category}.${key}`,
      oldValue: setting?.isSensitive ? "********" : oldValue,
      newValue: setting?.isSensitive ? "********" : value,
      severity: "medium",
      status: "success",
    });
  }

  static async seed() {
    const defaults = [
      // General
      { category: "general", key: "site_name", label: "Site Name", value: "Open-Verse", valueType: "string" },
      { category: "general", key: "site_description", label: "Site Description", value: "The next generation social platform.", valueType: "text" },
      { category: "general", key: "maintenance_mode", label: "Maintenance Mode", value: "false", valueType: "boolean" },
      { category: "general", key: "support_email", label: "Support Email", value: "support@open-verse.com", valueType: "string" },
      
      // Users
      { category: "users", key: "registration_enabled", label: "Allow Registration", value: "true", valueType: "boolean" },
      { category: "users", key: "require_email_verification", label: "Require Email Verification", value: "false", valueType: "boolean" },
      { category: "users", key: "default_user_karma", label: "Default User Karma", value: "0", valueType: "integer" },
      { category: "users", key: "max_usernames_per_ip", label: "Max Accounts per IP", value: "5", valueType: "integer" },
      
      // Content
      { category: "content", key: "ai_generation_enabled", label: "AI Post Generation", value: "true", valueType: "boolean" },
      { category: "content", key: "max_upload_size_mb", label: "Max Upload Size (MB)", value: "10", valueType: "integer" },
      { category: "content", key: "post_cooldown_seconds", label: "Post Cooldown (Seconds)", value: "30", valueType: "integer" },
      { category: "content", key: "profanity_filter_enabled", label: "Enable Profanity Filter", value: "true", valueType: "boolean" },
      
      // Security
      { category: "security", key: "session_timeout_minutes", label: "Session Timeout", value: "60", valueType: "integer" },
      { category: "security", key: "max_login_attempts", label: "Max Login Attempts", value: "5", valueType: "integer" },
      { category: "security", key: "admin_ip_allowlist", label: "Admin IP Allowlist", value: "", valueType: "text" },
      
      // Email
      { category: "email", key: "smtp_host", label: "SMTP Host", value: "smtp.sendgrid.net", valueType: "string" },
      { category: "email", key: "smtp_port", label: "SMTP Port", value: "587", valueType: "integer" },
      { category: "email", key: "smtp_user", label: "SMTP User", value: "apikey", valueType: "string" },
      { category: "email", key: "smtp_password", label: "SMTP Password", value: "", valueType: "string" },
      
      // Appearance
      { category: "appearance", key: "theme", label: "Default Site Theme", value: "dark", valueType: "string" },
      { category: "appearance", key: "custom_footer_text", label: "Custom Footer Text", value: "© 2024 Open-Verse. All rights reserved.", valueType: "string" },
    ];

    for (const d of defaults) {
      const existing = await db
        .select()
        .from(adminSettings)
        .where(and(eq(adminSettings.category, d.category), eq(adminSettings.key, d.key)));
      
      if (existing.length === 0) {
        const isSqlite = process.env.USE_SQLITE === "true";
        const isSensitive = d.key.includes("password") || d.key.includes("key") || d.key.includes("secret");
        
        await db.insert(adminSettings).values({
          category: d.category,
          key: d.key,
          label: d.label,
          value: d.value,
          valueType: d.valueType,
          isSensitive: isSensitive ? (isSqlite ? 1 : true) : (isSqlite ? 0 : false),
          isReadonly: isSqlite ? 0 : false,
          // Removed updatedAt to let DEFAULT (strftime('%s', 'now')) handle it
        });
      }
    }
  }
}
