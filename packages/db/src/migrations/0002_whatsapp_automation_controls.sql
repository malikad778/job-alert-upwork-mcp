-- Explicit pause state, kept separate from the quiet-hours schedule so that
-- resuming over WhatsApp does not silently disable a user's nightly window.
ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "automation_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "paused_via" text;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "max_alerts_per_day" integer DEFAULT 30 NOT NULL;--> statement-breakpoint

-- New conservative pacing defaults (4/hour, 60s apart).
ALTER TABLE "notification_settings" ALTER COLUMN "max_alerts_per_hour" SET DEFAULT 4;--> statement-breakpoint
ALTER TABLE "notification_settings" ALTER COLUMN "min_delay_seconds" SET DEFAULT 60;--> statement-breakpoint

-- Rows still sitting on the old burst-prone defaults are migrated to the new
-- pacing. Rows a user has deliberately tuned away from 20/10 are left alone.
UPDATE "notification_settings" SET "max_alerts_per_hour" = 4 WHERE "max_alerts_per_hour" = 20;--> statement-breakpoint
UPDATE "notification_settings" SET "min_delay_seconds" = 60 WHERE "min_delay_seconds" = 10;--> statement-breakpoint

-- Relevance gate for job matching.
ALTER TABLE "search_profiles" ADD COLUMN IF NOT EXISTS "min_relevance" smallint DEFAULT 25 NOT NULL;--> statement-breakpoint

-- Every user with a WhatsApp config needs a settings row to exist, otherwise
-- the pause/resume UPDATE has nothing to write to and silently no-ops.
INSERT INTO "notification_settings" ("user_id")
SELECT DISTINCT "user_id" FROM "whatsapp_configs"
ON CONFLICT ("user_id") DO NOTHING;
