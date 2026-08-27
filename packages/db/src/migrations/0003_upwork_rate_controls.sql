-- Deployment-wide Upwork controls, editable from the admin UI so polling can be
-- stopped instantly without a redeploy.
CREATE TABLE IF NOT EXISTS "platform_settings" (
  "id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
  "upwork_polling_enabled" boolean DEFAULT false NOT NULL,
  "upwork_disabled_reason" text,
  "poll_interval_minutes" integer DEFAULT 60 NOT NULL,
  "max_pages_per_profile" smallint DEFAULT 2 NOT NULL,
  "min_seconds_between_calls" numeric(5,2) DEFAULT '3' NOT NULL,
  "max_tool_calls_per_day" integer DEFAULT 500 NOT NULL,
  "max_enrichment_calls_per_run" smallint DEFAULT 5 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text
);--> statement-breakpoint

-- Usage is tracked per Upwork identity, not per application user: multiple
-- accounts can share one token and Upwork rate-limits the identity.
CREATE TABLE IF NOT EXISTS "upwork_usage_daily" (
  "day" text NOT NULL,
  "org_uid" text NOT NULL,
  "call_count" integer DEFAULT 0 NOT NULL,
  "last_call_at" timestamp with time zone
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "upwork_usage_day_org_uq" ON "upwork_usage_daily" ("day", "org_uid");--> statement-breakpoint

-- Seed the singleton row with polling OFF. Existing deployments must opt back
-- in explicitly rather than silently resuming traffic after this migration.
INSERT INTO "platform_settings" ("id", "upwork_polling_enabled", "upwork_disabled_reason")
VALUES ('global', false, 'Disabled pending Upwork Trust & Safety review')
ON CONFLICT ("id") DO NOTHING;
