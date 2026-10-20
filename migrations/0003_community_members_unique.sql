-- One membership row per user and community. Duplicate rows (created by repeated approve/invite calls) are
-- removed, keeping the row with the highest role and then the oldest one. Idempotent, runs on every start.
DELETE FROM "community_members" a USING "community_members" b
WHERE a."community_id" = b."community_id" AND a."user_id" = b."user_id" AND a."id" <> b."id"
  AND (
    (CASE b."role" WHEN 'owner' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END) > (CASE a."role" WHEN 'owner' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END)
    OR ((CASE b."role" WHEN 'owner' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END) = (CASE a."role" WHEN 'owner' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END) AND b."id" < a."id")
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "community_members_community_user_unique" ON "community_members" ("community_id","user_id");
