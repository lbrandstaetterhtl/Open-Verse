-- Indexes for the lookups that run on every request or every logged action (ban check, brute-force and
-- anomaly checks, activity log by user / IP / time, feeds, notifications, messages, followers ...).
-- Before, these tables had only their primary key and every such query was a sequential scan.
-- Idempotent (IF NOT EXISTS) and safe for existing data. Each index is built once; on a very large
-- activity_logs table the first start after the upgrade takes a little longer (writes to that table wait
-- until its indexes are built). Declared in shared/schema.ts too, so `drizzle-kit push` keeps them.
CREATE INDEX IF NOT EXISTS "activity_logs_user_created_idx" ON "activity_logs" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_user_action_created_idx" ON "activity_logs" ("user_id", "action", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_ip_created_idx" ON "activity_logs" ("ip_address", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_action_created_idx" ON "activity_logs" ("action", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_category_created_idx" ON "activity_logs" ("category", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_created_idx" ON "activity_logs" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "anomaly_events_user_type_created_idx" ON "anomaly_events" ("user_id", "anomaly_type", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "anomaly_events_created_idx" ON "anomaly_events" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bans_user_idx" ON "bans" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bans_ip_idx" ON "bans" ("ip_address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bans_device_idx" ON "bans" ("device_fingerprint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_author_created_idx" ON "posts" ("author_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_community_created_idx" ON "posts" ("community_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_created_idx" ON "posts" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_post_created_idx" ON "comments" ("post_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_author_idx" ON "comments" ("author_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_likes_post_idx" ON "post_likes" ("post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_likes_comment_idx" ON "comment_likes" ("comment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_sender_receiver_created_idx" ON "messages" ("sender_id", "receiver_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_receiver_read_idx" ON "messages" ("receiver_id", "read");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "followers_follower_following_idx" ON "followers" ("follower_id", "following_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "followers_following_idx" ON "followers" ("following_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_members_user_idx" ON "community_members" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_reporter_idx" ON "reports" ("reporter_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_status_created_idx" ON "reports" ("status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_tokens_user_idx" ON "verification_tokens" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_tokens_expires_idx" ON "verification_tokens" ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_created_by_idx" ON "tickets" ("created_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_assigned_to_idx" ON "tickets" ("assigned_to");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "system_metrics_name_period_idx" ON "system_metrics" ("metric_name", "period_start");
--> statement-breakpoint
-- Planner statistics for the new indexes
ANALYZE "activity_logs";
--> statement-breakpoint
ANALYZE "bans";
--> statement-breakpoint
ANALYZE "anomaly_events";
