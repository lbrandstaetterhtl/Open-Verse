-- One reaction per user and post, one like per user and comment (CONTENT-22). Idempotent, runs on every start.
-- Older data may contain duplicates from parallel requests: keep the oldest row of each pair, then add the index.
DELETE FROM "post_likes" a WHERE EXISTS (SELECT 1 FROM "post_likes" b WHERE b."user_id" = a."user_id" AND b."post_id" = a."post_id" AND b."id" < a."id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "post_likes_user_post_unique" ON "post_likes" ("user_id","post_id");
--> statement-breakpoint
DELETE FROM "comment_likes" a WHERE EXISTS (SELECT 1 FROM "comment_likes" b WHERE b."user_id" = a."user_id" AND b."comment_id" = a."comment_id" AND b."id" < a."id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comment_likes_user_comment_unique" ON "comment_likes" ("user_id","comment_id")
