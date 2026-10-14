CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"user_email" text,
	"user_role" text,
	"user_username" text,
	"action" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"target_type" text,
	"target_id" text,
	"target_label" text,
	"description" text NOT NULL,
	"metadata" text DEFAULT '{}',
	"old_value" text,
	"new_value" text,
	"ip_address" text,
	"ip_country" text,
	"ip_city" text,
	"user_agent" text,
	"device_type" text,
	"device_os" text,
	"device_browser" text,
	"session_id" text,
	"device_fingerprint" text,
	"status" text DEFAULT 'success' NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"is_anomaly" integer DEFAULT 0,
	"anomaly_type" text,
	"anomaly_score" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" text NOT NULL,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "admin_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"value" text,
	"value_type" text DEFAULT 'string' NOT NULL,
	"is_sensitive" integer DEFAULT 0,
	"is_readonly" integer DEFAULT 0,
	"updated_by" integer,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "alert_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer,
	"rule_name" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"metric_value" real,
	"threshold_value" real,
	"status" text DEFAULT 'firing',
	"acknowledged_by" integer,
	"acknowledged_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"metric" text NOT NULL,
	"condition" text NOT NULL,
	"threshold" real NOT NULL,
	"window_seconds" integer DEFAULT 300,
	"severity" text DEFAULT 'warning' NOT NULL,
	"is_active" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_date" text NOT NULL,
	"snapshot_hour" integer,
	"granularity" text DEFAULT 'day' NOT NULL,
	"new_users" integer DEFAULT 0,
	"total_users" integer DEFAULT 0,
	"active_users_day" integer DEFAULT 0,
	"active_users_week" integer DEFAULT 0,
	"active_users_month" integer DEFAULT 0,
	"new_posts" integer DEFAULT 0,
	"new_comments" integer DEFAULT 0,
	"new_likes" integer DEFAULT 0,
	"new_follows" integer DEFAULT 0,
	"new_communities" integer DEFAULT 0,
	"engagement_rate" real DEFAULT 0,
	"d1_retention" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomaly_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"anomaly_type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"evidence" text DEFAULT '{}',
	"trigger_value" real,
	"threshold_value" real,
	"status" text DEFAULT 'open',
	"resolved_by" integer,
	"resolved_at" timestamp,
	"resolution_note" text,
	"auto_action" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_punishment_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer,
	"rule_name" text NOT NULL,
	"anomaly_id" integer,
	"user_id" integer,
	"ban_id" integer,
	"action_taken" text NOT NULL,
	"action_detail" text,
	"success" integer DEFAULT 1,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_punishment_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" integer DEFAULT 1,
	"anomaly_type" text NOT NULL,
	"severity_threshold" text DEFAULT 'high' NOT NULL,
	"action" text NOT NULL,
	"action_duration_hours" integer,
	"action_reason" text NOT NULL,
	"escalate_after_count" integer DEFAULT 1,
	"escalation_window_hours" integer DEFAULT 24,
	"cooldown_hours" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bans" (
	"id" serial PRIMARY KEY NOT NULL,
	"ban_type" text NOT NULL,
	"user_id" integer,
	"ip_address" text,
	"ip_range" text,
	"device_fingerprint" text,
	"reason" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"is_permanent" integer DEFAULT 0,
	"expires_at" timestamp,
	"is_shadow" integer DEFAULT 0,
	"created_by" integer,
	"created_by_type" text DEFAULT 'admin',
	"anomaly_id" integer,
	"is_active" integer DEFAULT 1,
	"revoked_by" integer,
	"revoked_at" timestamp,
	"revoke_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_action_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"performed_by" integer NOT NULL,
	"action_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_ids" text NOT NULL,
	"target_count" integer NOT NULL,
	"success_count" integer DEFAULT 0,
	"fail_count" integer DEFAULT 0,
	"reason" text,
	"metadata" text DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"comment_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"author_id" integer NOT NULL,
	"post_id" integer NOT NULL,
	"karma" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image_url" text,
	"creator_id" integer NOT NULL,
	"allowed_categories" text DEFAULT 'news,entertainment,discussion' NOT NULL,
	"is_private" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "communities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "community_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"community_id" integer NOT NULL,
	"snapshot_date" text NOT NULL,
	"new_members" integer DEFAULT 0,
	"total_members" integer DEFAULT 0,
	"new_posts" integer DEFAULT 0,
	"total_posts" integer DEFAULT 0,
	"active_members" integer DEFAULT 0,
	"engagement_score" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_bans" (
	"id" serial PRIMARY KEY NOT NULL,
	"community_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"reason" text,
	"banned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_join_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"community_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"community_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"snapshot_date" text NOT NULL,
	"new_posts" integer DEFAULT 0,
	"total_posts" integer DEFAULT 0,
	"new_followers" integer DEFAULT 0,
	"total_followers" integer DEFAULT 0,
	"post_likes_received" integer DEFAULT 0,
	"post_comments_received" integer DEFAULT 0,
	"total_reach" integer DEFAULT 0,
	"engagement_score" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "followers" (
	"id" serial PRIMARY KEY NOT NULL,
	"follower_id" integer NOT NULL,
	"following_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"receiver_id" integer NOT NULL,
	"content" text NOT NULL,
	"read" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderator_performance_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"moderator_id" integer NOT NULL,
	"moderator_username" text NOT NULL,
	"moderator_role" text NOT NULL,
	"snapshot_date" text NOT NULL,
	"period" text DEFAULT 'day' NOT NULL,
	"reports_resolved" integer DEFAULT 0,
	"reports_dismissed" integer DEFAULT 0,
	"reports_total_handled" integer DEFAULT 0,
	"avg_report_resolution_s" integer DEFAULT 0,
	"tickets_resolved" integer DEFAULT 0,
	"tickets_commented" integer DEFAULT 0,
	"avg_ticket_response_s" integer DEFAULT 0,
	"avg_ticket_resolution_s" integer DEFAULT 0,
	"total_admin_actions" integer DEFAULT 0,
	"user_bans" integer DEFAULT 0,
	"user_unbans" integer DEFAULT 0,
	"content_removals" integer DEFAULT 0,
	"performance_score" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"like_post" integer DEFAULT 1 NOT NULL,
	"like_comment" integer DEFAULT 1 NOT NULL,
	"comment_post" integer DEFAULT 1 NOT NULL,
	"reply_comment" integer DEFAULT 1 NOT NULL,
	"mention_post" integer DEFAULT 1 NOT NULL,
	"mention_comment" integer DEFAULT 1 NOT NULL,
	"new_follower" integer DEFAULT 1 NOT NULL,
	"community_invite" integer DEFAULT 1 NOT NULL,
	"community_post" integer DEFAULT 1 NOT NULL,
	"post_milestone" integer DEFAULT 1 NOT NULL,
	"system_announcement" integer DEFAULT 1 NOT NULL,
	"browser_notifications" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"actor_id" integer,
	"type" text NOT NULL,
	"post_id" integer,
	"comment_id" integer,
	"community_id" integer,
	"title" text,
	"message" text,
	"preview" text,
	"action_url" text,
	"read" integer DEFAULT 0 NOT NULL,
	"seen" integer DEFAULT 0 NOT NULL,
	"archived" integer DEFAULT 0 NOT NULL,
	"group_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"post_id" integer NOT NULL,
	"is_like" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"author_id" integer NOT NULL,
	"category" text NOT NULL,
	"karma" integer DEFAULT 0 NOT NULL,
	"media_url" text,
	"media_type" text,
	"community_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"reporter_id" integer NOT NULL,
	"post_id" integer,
	"comment_id" integer,
	"discussion_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_by" integer,
	"resolved_at" timestamp,
	"resolution_time_seconds" integer
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" text PRIMARY KEY NOT NULL,
	"sess" text NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric_name" text NOT NULL,
	"metric_value" real NOT NULL,
	"metric_unit" text,
	"dimensions" text DEFAULT '{}',
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"granularity" text DEFAULT 'minute',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"colors" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"content" text NOT NULL,
	"is_system" integer DEFAULT 0 NOT NULL,
	"is_internal" integer DEFAULT 0 NOT NULL,
	"change_type" text,
	"change_from" text,
	"change_to" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ticket_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"changed_by" integer NOT NULL,
	"from_status" text,
	"to_status" text,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_number" text NOT NULL,
	"created_by" integer NOT NULL,
	"assigned_to" integer,
	"type" text,
	"priority" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"related_user_id" integer,
	"related_post_id" integer,
	"related_url" text,
	"tags" text,
	"attachments" text,
	"status" text DEFAULT 'open' NOT NULL,
	"response_time_seconds" integer,
	"resolution_time_seconds" integer,
	"first_response_at" timestamp,
	"resolved_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"karma" integer DEFAULT 0 NOT NULL,
	"email_verified" integer DEFAULT 0 NOT NULL,
	"is_admin" integer DEFAULT 0 NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"verified" integer DEFAULT 0 NOT NULL,
	"bio" text,
	"display_name" text,
	"avatar_url" text,
	"profile_picture_url" text,
	"cover_url" text,
	"location" text,
	"website" text,
	"is_private" integer DEFAULT 0 NOT NULL,
	"is_frozen" integer DEFAULT 0,
	"is_shadow_banned" integer DEFAULT 0,
	"frozen_until" timestamp,
	"freeze_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"admin_group_id" integer,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "session" USING btree ("expire");