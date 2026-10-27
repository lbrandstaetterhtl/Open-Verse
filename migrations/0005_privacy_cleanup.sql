-- Personal data that is no longer stored (runs once, recorded in the migration journal):
-- - reports.ip_address: the reporter's IP was stored for every report but never used for a decision.
--   Existing values are removed; new reports no longer store it. (The column stays for compatibility.)
UPDATE "reports" SET "ip_address" = NULL WHERE "ip_address" IS NOT NULL;
--> statement-breakpoint
-- - verification_tokens: tokens are now stored only as SHA-256 hashes. The existing rows hold clear-text
--   tokens; nothing ever consumed them (there was no verification link handler), so they are removed.
DELETE FROM "verification_tokens";
