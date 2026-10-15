DELETE FROM "analytics_snapshots" a USING "analytics_snapshots" b WHERE a."id" < b."id" AND a."snapshot_date" = b."snapshot_date" AND a."snapshot_hour" IS NOT DISTINCT FROM b."snapshot_hour" AND a."granularity" = b."granularity";
--> statement-breakpoint
DELETE FROM "community_analytics" a USING "community_analytics" b WHERE a."id" < b."id" AND a."community_id" = b."community_id" AND a."snapshot_date" = b."snapshot_date";
--> statement-breakpoint
DELETE FROM "creator_analytics" a USING "creator_analytics" b WHERE a."id" < b."id" AND a."user_id" = b."user_id" AND a."snapshot_date" = b."snapshot_date";
--> statement-breakpoint
DELETE FROM "moderator_performance_snapshots" a USING "moderator_performance_snapshots" b WHERE a."id" < b."id" AND a."moderator_id" = b."moderator_id" AND a."snapshot_date" = b."snapshot_date" AND a."period" = b."period";
--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_date_hour_granularity_unique" UNIQUE NULLS NOT DISTINCT("snapshot_date","snapshot_hour","granularity");
--> statement-breakpoint
ALTER TABLE "community_analytics" ADD CONSTRAINT "community_analytics_community_date_unique" UNIQUE("community_id","snapshot_date");
--> statement-breakpoint
ALTER TABLE "creator_analytics" ADD CONSTRAINT "creator_analytics_user_date_unique" UNIQUE("user_id","snapshot_date");
--> statement-breakpoint
ALTER TABLE "moderator_performance_snapshots" ADD CONSTRAINT "moderator_performance_snapshots_mod_date_period_unique" UNIQUE("moderator_id","snapshot_date","period");
