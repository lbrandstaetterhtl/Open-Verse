const Database = require('better-sqlite3');
const db = new Database('local.db');

const defaults = [
  // General
  { category: "general", key: "site_name", description: "The global name of the platform displayed in the navigation bar and document titles." },
  { category: "general", key: "site_description", description: "A short slogan or description used for SEO meta tags and social media sharing." },
  { category: "general", key: "maintenance_mode", description: "If enabled, blocks all non-admin users from accessing the site and displays a maintenance page." },
  { category: "general", key: "support_email", description: "The email address users can contact for help, shown in the footer and error pages." },
  
  // Users
  { category: "users", key: "registration_enabled", description: "Toggle whether new users can create accounts on the platform." },
  { category: "users", key: "require_email_verification", description: "If enabled, users must verify their email before they can post, comment, or vote." },
  { category: "users", key: "default_user_karma", description: "The starting amount of Karma given to newly registered users." },
  { category: "users", key: "max_usernames_per_ip", description: "Limit the number of accounts that can be registered from a single IP address to prevent spam." },
  
  // Content
  { category: "content", key: "ai_generation_enabled", description: "Enable or disable the built-in AI post generator tool for users." },
  { category: "content", key: "max_upload_size_mb", description: "Maximum file size allowed for media uploads (images and videos)." },
  { category: "content", key: "post_cooldown_seconds", description: "Required wait time between creating new posts to prevent flooding." },
  { category: "content", key: "profanity_filter_enabled", description: "Automatically censor known profanity and slurs in posts and comments." },
  
  // Security
  { category: "security", key: "session_timeout_minutes", description: "How long an inactive user session remains valid before requiring them to log in again." },
  { category: "security", key: "max_login_attempts", description: "Number of failed login attempts allowed before temporarily locking the account." },
  { category: "security", key: "admin_ip_allowlist", description: "Comma-separated list of IP addresses allowed to access the admin dashboard. Leave blank to disable." },
  
  // Email
  { category: "email", key: "smtp_host", description: "Hostname of the outgoing mail server used for system notifications." },
  { category: "email", key: "smtp_port", description: "Port number for the SMTP server (usually 587 for TLS or 465 for SSL)." },
  { category: "email", key: "smtp_user", description: "Username used to authenticate with the SMTP server." },
  { category: "email", key: "smtp_password", description: "Password or API Key for the SMTP server. This value is encrypted and hidden." },
  
  // Appearance
  { category: "appearance", key: "theme", description: "The default visual theme applied for guests and new registrations." },
  { category: "appearance", key: "custom_footer_text", description: "Text displayed at the very bottom of every public page on the site." },
];

const stmt = db.prepare("UPDATE admin_settings SET description = ? WHERE category = ? AND key = ?");
let updated = 0;

for (const d of defaults) {
  const info = stmt.run(d.description, d.category, d.key);
  updated += info.changes;
}

console.log(`Updated ${updated} setting descriptions in local.db`);
