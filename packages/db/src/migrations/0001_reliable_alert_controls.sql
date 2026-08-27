ALTER TABLE "search_profiles" ADD COLUMN IF NOT EXISTS "automation_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "job_alerts" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_alerts" ADD COLUMN IF NOT EXISTS "claimed_by" text;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "min_delay_seconds" integer DEFAULT 10 NOT NULL;
DROP INDEX IF EXISTS "alerts_user_job_profile_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "alerts_user_job_profile_recipient_uq" ON "job_alerts" ("user_id", "job_id", "profile_id", "recipient_id");