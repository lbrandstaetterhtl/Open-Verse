import { db } from "../db";
import { adminSettings } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { activityLogger } from "./activity-logger";
import { type Request } from "express";
import { logger } from "../logger";

/* FEATURE [AS-003]: Admin Settings – Implementation of the central settings service. */
export class SettingsService {
  private static cache: Map<string, { value: any; expiry: number }> = new Map();
  private static TTL = 5 * 60 * 1000; // 5 minutes

  static clearCache(): void {
    this.cache.clear();
    logger.info('system', 'Settings cache cleared');
  }

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
      logger.error('system', `Failed to fetch setting ${cacheKey}`, error);
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

    activityLogger.logFromRequest(req, {
      action: "admin.settings_change",
      category: "settings",
      targetType: "Setting",
      targetId: key,
      targetLabel: `${category}.${key}`,
      description: `Updated setting ${category}.${key}`,
      oldValue: setting?.isSensitive ? "********" : oldValue,
      newValue: setting?.isSensitive ? "********" : value,
      severity: "warning",
      status: "success",
    }).catch(err => logger.error('system', 'admin.settings_change activity log failed', err));
  }

  static async seed() {
    const defaults = [
      // General
      { category: "general", key: "site_name", label: "Site Name", value: "Osiris", valueType: "string", description: "The global name of the platform displayed in the navigation bar and document titles." },
      { category: "general", key: "site_description", label: "Site Description", value: "The next generation social platform.", valueType: "text", description: "A short slogan or description used for SEO meta tags and social media sharing." },
      { category: "general", key: "maintenance_mode", label: "Maintenance Mode", value: "false", valueType: "boolean", description: "If enabled, blocks all non-admin users from accessing the site and displays a maintenance page." },
      { category: "general", key: "support_email", label: "Support Email", value: "support@osiris.com", valueType: "string", description: "The email address users can contact for help, shown in the footer and error pages." },
      
      // Users
      { category: "users", key: "registration_enabled", label: "Allow Registration", value: "true", valueType: "boolean", description: "Toggle whether new users can create accounts on the platform." },
      { category: "users", key: "require_email_verification", label: "Require Email Verification", value: "false", valueType: "boolean", description: "If enabled, users must verify their email before they can post, comment, or vote." },
      { category: "users", key: "default_user_karma", label: "Default User Karma", value: "0", valueType: "integer", description: "The starting amount of Karma given to newly registered users." },
      { category: "users", key: "max_usernames_per_ip", label: "Max Accounts per IP", value: "5", valueType: "integer", description: "Limit the number of accounts that can be registered from a single IP address to prevent spam." },
      
      // Content
      { category: "content", key: "ai_generation_enabled", label: "AI Post Generation", value: "true", valueType: "boolean", description: "Enable or disable the built-in AI post generator tool for users." },
      { category: "content", key: "max_upload_size_mb", label: "Max Upload Size (MB)", value: "10", valueType: "integer", description: "Maximum file size allowed for media uploads (images and videos)." },
      { category: "content", key: "post_cooldown_seconds", label: "Post Cooldown (Seconds)", value: "30", valueType: "integer", description: "Required wait time between creating new posts to prevent flooding." },
      { category: "content", key: "profanity_filter_enabled", label: "Enable Profanity Filter", value: "true", valueType: "boolean", description: "Automatically censor known profanity and slurs in posts and comments." },
      
      // Security
      { category: "security", key: "session_timeout_minutes", label: "Session Timeout", value: "60", valueType: "integer", description: "How long an inactive user session remains valid before requiring them to log in again." },
      { category: "security", key: "max_login_attempts", label: "Max Login Attempts", value: "5", valueType: "integer", description: "Number of failed login attempts allowed before temporarily locking the account." },
      { category: "security", key: "admin_ip_allowlist", label: "Admin IP Allowlist", value: "", valueType: "text", description: "Comma-separated list of IP addresses allowed to access the admin dashboard. Leave blank to disable." },
      
      // Email
      { category: "email", key: "smtp_host", label: "SMTP Host", value: "smtp.sendgrid.net", valueType: "string", description: "Hostname of the outgoing mail server used for system notifications." },
      { category: "email", key: "smtp_port", label: "SMTP Port", value: "587", valueType: "integer", description: "Port number for the SMTP server (usually 587 for TLS or 465 for SSL)." },
      { category: "email", key: "smtp_user", label: "SMTP User", value: "apikey", valueType: "string", description: "Username used to authenticate with the SMTP server." },
      { category: "email", key: "smtp_password", label: "SMTP Password", value: "", valueType: "string", description: "Password or API Key for the SMTP server. This value is encrypted and hidden." },
      
      // Appearance
      { category: "appearance", key: "theme", label: "Default Site Theme", value: "dark", valueType: "string", description: "The default visual theme applied for guests and new registrations." },
      { category: "appearance", key: "custom_footer_text", label: "Custom Footer Text", value: "© 2024 Osiris. All rights reserved.", valueType: "string", description: "Text displayed at the very bottom of every public page on the site." },
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
          description: d.description,
          value: d.value,
          valueType: d.valueType,
          isSensitive: isSensitive ? 1 : 0,
          isReadonly: 0,
          // Removed updatedAt to let DEFAULT (strftime('%s', 'now')) handle it
        });
      }
    }
  }
}
