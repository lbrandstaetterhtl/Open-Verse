-- Bookmarks ("Merken"): one row per user and saved post. Idempotent, runs on every start.
CREATE TABLE IF NOT EXISTS "saved_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"post_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saved_posts_user_post_unique" ON "saved_posts" ("user_id","post_id");
