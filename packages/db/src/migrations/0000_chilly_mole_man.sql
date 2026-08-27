CREATE TYPE "public"."ai_provider" AS ENUM('anthropic', 'openai', 'google', 'google_vertex', 'openrouter', 'ollama', 'custom');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."cred_status" AS ENUM('untested', 'valid', 'invalid', 'expired', 'rate_limited');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('generating', 'ready', 'edited', 'copied', 'submitted_externally', 'discarded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."field_source" AS ENUM('search_payload', 'detail_tool', 'dashboard_tool', 'manual', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('hourly', 'fixed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'success', 'partial', 'failed', 'skipped_locked');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"label" text NOT NULL,
	"secret_enc" text NOT NULL,
	"secret_hint" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_model" text,
	"available_models" jsonb,
	"status" "cred_status" DEFAULT 'untested' NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_error" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"monthly_budget_usd" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" text NOT NULL,
	"profile_id" uuid,
	"recipient_id" uuid,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"status" "alert_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error_code" text,
	"error_message" text,
	"attempt_count" smallint DEFAULT 0 NOT NULL,
	"is_digest" boolean DEFAULT false NOT NULL,
	"parked_until" timestamp with time zone,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"changed_field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text,
	"job_type" "job_type" DEFAULT 'unknown' NOT NULL,
	"category" text,
	"subcategory" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"experience_level" text,
	"duration" text,
	"workload" text,
	"budget_amount" numeric(12, 2),
	"hourly_min" numeric(12, 2),
	"hourly_max" numeric(12, 2),
	"currency" char(3) DEFAULT 'USD',
	"proposals_count" integer,
	"interviewing" integer,
	"invites_sent" integer,
	"client_rating" numeric(3, 2),
	"client_reviews_count" integer,
	"client_total_spent" numeric(14, 2),
	"client_total_hires" integer,
	"client_active_hires" integer,
	"client_hire_rate" numeric(5, 2),
	"client_country" text,
	"client_city" text,
	"client_timezone" text,
	"client_payment_verified" boolean,
	"client_member_since" timestamp with time zone,
	"client_avg_hourly_paid" numeric(12, 2),
	"client_data_source" "field_source" DEFAULT 'unavailable' NOT NULL,
	"client_enriched_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_payload" jsonb,
	"unmapped_fields" jsonb,
	"normalizer_version" smallint DEFAULT 1 NOT NULL,
	"search_vector" text
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"score" smallint NOT NULL,
	"score_breakdown" jsonb,
	"matched_keywords" jsonb,
	"rejected_reason" text,
	"is_saved" boolean DEFAULT false NOT NULL,
	"is_dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_tool_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_names" jsonb NOT NULL,
	"schemas" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"quiet_hours_enabled" boolean DEFAULT false NOT NULL,
	"quiet_start" text DEFAULT '23:00' NOT NULL,
	"quiet_end" text DEFAULT '08:00' NOT NULL,
	"digest_on_quiet_end" boolean DEFAULT true NOT NULL,
	"max_alerts_per_hour" integer DEFAULT 20 NOT NULL,
	"include_client_data" boolean DEFAULT true NOT NULL,
	"include_ai_summary" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"trigger_source" text DEFAULT 'cron' NOT NULL,
	"pages_fetched" integer DEFAULT 0 NOT NULL,
	"jobs_seen" integer DEFAULT 0 NOT NULL,
	"jobs_new" integer DEFAULT 0 NOT NULL,
	"matches_created" integer DEFAULT 0 NOT NULL,
	"alerts_queued" integer DEFAULT 0 NOT NULL,
	"tool_calls_made" integer DEFAULT 0 NOT NULL,
	"timeline" jsonb,
	"failed_step" text,
	"error_message" text,
	"error_kind" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "proposal_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" text NOT NULL,
	"credential_id" uuid,
	"provider" "ai_provider" NOT NULL,
	"model" text NOT NULL,
	"tone" text DEFAULT 'professional' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"cover_letter" text,
	"suggested_bid" numeric(12, 2),
	"bid_rationale" text,
	"screening_answers" jsonb,
	"fit_analysis" jsonb,
	"edited_content" text,
	"status" "draft_status" DEFAULT 'generating' NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"estimated_cost_usd" numeric(10, 6),
	"latency_ms" integer,
	"error_message" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"negative_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"job_type" "job_type",
	"min_hourly_rate" numeric(12, 2),
	"min_fixed_budget" numeric(12, 2),
	"min_client_rating" numeric(3, 2),
	"min_client_spent" numeric(14, 2),
	"require_payment_verified" boolean DEFAULT false NOT NULL,
	"include_countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exclude_countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_proposals" integer,
	"experience_levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_score" smallint DEFAULT 50 NOT NULL,
	"notify_enabled" boolean DEFAULT true NOT NULL,
	"auto_draft_proposal" boolean DEFAULT false NOT NULL,
	"max_alerts_per_day" integer DEFAULT 50 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "upwork_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"token_type" text DEFAULT 'Bearer' NOT NULL,
	"scope" text,
	"expires_at" timestamp with time zone NOT NULL,
	"client_id" text,
	"client_secret_enc" text,
	"org_uid" text,
	"account_role" text,
	"account_name" text,
	"org_uid_cached_at" timestamp with time zone,
	"last_refreshed_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error_message" text,
	"consecutive_failures" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upwork_profile_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"overview" text,
	"hourly_rate" numeric(12, 2),
	"currency" char(3) DEFAULT 'USD',
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_earnings" numeric(14, 2),
	"job_success_score" numeric(5, 2),
	"total_hours" integer,
	"connects_balance" integer,
	"languages" jsonb,
	"education" jsonb,
	"employment" jsonb,
	"portfolio" jsonb,
	"work_history" jsonb,
	"availability" text,
	"raw_payload" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text DEFAULT 'Default' NOT NULL,
	"phone_number_id" text NOT NULL,
	"business_account_id" text,
	"access_token_enc" text NOT NULL,
	"graph_api_version" text DEFAULT 'v21.0' NOT NULL,
	"is_test_environment" boolean DEFAULT true NOT NULL,
	"status" "cred_status" DEFAULT 'untested' NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_error" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"config_id" uuid NOT NULL,
	"phone_e164" text NOT NULL,
	"display_name" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credentials" ADD CONSTRAINT "ai_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_profile_id_search_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."search_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_recipient_id_whatsapp_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."whatsapp_recipients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_revisions" ADD CONSTRAINT "job_revisions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_profile_id_search_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."search_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_runs" ADD CONSTRAINT "poll_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_drafts" ADD CONSTRAINT "proposal_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_drafts" ADD CONSTRAINT "proposal_drafts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_drafts" ADD CONSTRAINT "proposal_drafts_credential_id_ai_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."ai_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_profiles" ADD CONSTRAINT "search_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upwork_connections" ADD CONSTRAINT "upwork_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upwork_profile_snapshots" ADD CONSTRAINT "upwork_profile_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_configs" ADD CONSTRAINT "whatsapp_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_recipients" ADD CONSTRAINT "whatsapp_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_recipients" ADD CONSTRAINT "whatsapp_recipients_config_id_whatsapp_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."whatsapp_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_cred_user_label_uq" ON "ai_credentials" USING btree ("user_id","label");--> statement-breakpoint
CREATE INDEX "ai_cred_user_provider_idx" ON "ai_credentials" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "audit_user_created_idx" ON "audit_log" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_user_job_profile_uq" ON "job_alerts" USING btree ("user_id","job_id","profile_id");--> statement-breakpoint
CREATE INDEX "alerts_status_idx" ON "job_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "alerts_provider_msg_idx" ON "job_alerts" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "job_revisions_job_idx" ON "job_revisions" USING btree ("job_id","detected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_posted_idx" ON "jobs" USING btree ("posted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_first_seen_idx" ON "jobs" USING btree ("first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_client_rating_idx" ON "jobs" USING btree ("client_rating");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_job_profile_uq" ON "matches" USING btree ("job_id","profile_id");--> statement-breakpoint
CREATE INDEX "matches_user_created_idx" ON "matches" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "matches_user_score_idx" ON "matches" USING btree ("user_id","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mcp_snapshot_fingerprint_idx" ON "mcp_tool_snapshots" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "poll_runs_user_started_idx" ON "poll_runs" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "drafts_user_created_idx" ON "proposal_drafts" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "drafts_job_idx" ON "proposal_drafts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "search_profiles_user_active_idx" ON "search_profiles" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "upwork_conn_user_idx" ON "upwork_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profile_snap_user_time_idx" ON "upwork_profile_snapshots" USING btree ("user_id","fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "wa_config_user_idx" ON "whatsapp_configs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_recipient_uq" ON "whatsapp_recipients" USING btree ("config_id","phone_e164");