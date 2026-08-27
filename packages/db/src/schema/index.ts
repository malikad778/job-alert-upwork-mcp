import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  char,
  index,
  uniqueIndex,
  pgEnum,
  smallint,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* ── enums ─────────────────────────────────────────────────────────── */

export const jobTypeEnum = pgEnum('job_type', ['hourly', 'fixed', 'unknown']);
export const alertStatusEnum = pgEnum('alert_status', [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'skipped',
]);
export const runStatusEnum = pgEnum('run_status', [
  'running',
  'success',
  'partial',
  'failed',
  'skipped_locked',
]);
export const aiProviderEnum = pgEnum('ai_provider', [
  'anthropic',
  'openai',
  'google',
  'google_vertex',
  'openrouter',
  'ollama',
  'aws_bedrock',
  'custom',
]);
export const credStatusEnum = pgEnum('cred_status', [
  'untested',
  'valid',
  'invalid',
  'expired',
  'rate_limited',
]);
export const draftStatusEnum = pgEnum('draft_status', [
  'generating',
  'ready',
  'edited',
  'copied',
  'submitted_externally',
  'discarded',
  'failed',
]);
export const fieldSourceEnum = pgEnum('field_source', [
  'search_payload',
  'detail_tool',
  'dashboard_tool',
  'manual',
  'unavailable',
]);

/* ── users & auth ──────────────────────────────────────────────────── */

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  role: text('role').notNull().default('user'),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  timezone: text('timezone').notNull().default('UTC'), // IANA, e.g. Asia/Karachi
  locale: text('locale').notNull().default('en'),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  issuer: text('issuer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ── Upwork connection ─────────────────────────────────────────────── */

export const upworkConnections = pgTable(
  'upwork_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

    // OAuth 2.1 - encrypted at rest, never selected into a client component
    accessTokenEnc: text('access_token_enc').notNull(),
    refreshTokenEnc: text('refresh_token_enc'),
    tokenType: text('token_type').notNull().default('Bearer'),
    scope: text('scope'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    // Dynamic client registration result, per deployment
    clientId: text('client_id'),
    clientSecretEnc: text('client_secret_enc'),

    // Resolved account context
    orgUid: text('org_uid'),
    accountRole: text('account_role'), // TALENT | CLIENT | AGENCY
    accountName: text('account_name'),
    orgUidCachedAt: timestamp('org_uid_cached_at', { withTimezone: true }),

    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    lastErrorMessage: text('last_error_message'),
    consecutiveFailures: smallint('consecutive_failures').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('upwork_conn_user_idx').on(t.userId), // one connection per user in v1
  ],
);

/** Snapshot of the freelancer's own Upwork profile - fuel for AI proposals (§12.2). */
export const upworkProfileSnapshots = pgTable(
  'upwork_profile_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title'),
    overview: text('overview'),
    hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2 }),
    currency: char('currency', { length: 3 }).default('USD'),
    skills: jsonb('skills').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    totalEarnings: numeric('total_earnings', { precision: 14, scale: 2 }),
    jobSuccessScore: numeric('job_success_score', { precision: 5, scale: 2 }),
    totalHours: integer('total_hours'),
    connectsBalance: integer('connects_balance'),
    languages: jsonb('languages').$type<{ name: string; level?: string }[]>(),
    education: jsonb('education'),
    employment: jsonb('employment'),
    portfolio: jsonb('portfolio'),
    workHistory: jsonb('work_history'),
    availability: text('availability'),
    rawPayload: jsonb('raw_payload'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('profile_snap_user_time_idx').on(t.userId, t.fetchedAt.desc())],
);

/* ── search profiles ───────────────────────────────────────────────── */

export const searchProfiles = pgTable(
  'search_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    automationEnabled: boolean('automation_enabled').notNull().default(true),

    // Matching inputs
    keywords: jsonb('keywords').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    negativeKeywords: jsonb('negative_keywords').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    requiredSkills: jsonb('required_skills').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    categories: jsonb('categories').$type<string[]>().notNull().default(sql`'[]'::jsonb`),

    // Filters
    jobType: jobTypeEnum('job_type'), // null = any
    minHourlyRate: numeric('min_hourly_rate', { precision: 12, scale: 2 }),
    minFixedBudget: numeric('min_fixed_budget', { precision: 12, scale: 2 }),
    minClientRating: numeric('min_client_rating', { precision: 3, scale: 2 }),
    minClientSpent: numeric('min_client_spent', { precision: 14, scale: 2 }),
    requirePaymentVerified: boolean('require_payment_verified').notNull().default(false),
    includeCountries: jsonb('include_countries').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    excludeCountries: jsonb('exclude_countries').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    maxProposals: integer('max_proposals'), // skip crowded jobs, if the field exists
    experienceLevels: jsonb('experience_levels').$type<string[]>().notNull().default(sql`'[]'::jsonb`),

    // Behaviour
    minScore: smallint('min_score').notNull().default(50), // 0–100 alert threshold
    /**
     * Minimum title+description+skill score before client quality, freshness and
     * competition are counted. Stops a great client on an unrelated job from
     * clearing minScore on padding alone.
     */
    minRelevance: smallint('min_relevance').notNull().default(25),
    notifyEnabled: boolean('notify_enabled').notNull().default(true),
    autoDraftProposal: boolean('auto_draft_proposal').notNull().default(false),
    maxAlertsPerDay: integer('max_alerts_per_day').notNull().default(50),

    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('search_profiles_user_active_idx').on(t.userId, t.isActive)],
);

/* ── jobs (global) ─────────────────────────────────────────────────── */

export const jobs = pgTable(
  'jobs',
  {
    /** Upwork's own identifier - ciphertext id like ~021... Use it as the PK. */
    id: text('id').primaryKey(),

    title: text('title').notNull(),
    description: text('description'),
    url: text('url'),
    jobType: jobTypeEnum('job_type').notNull().default('unknown'),
    category: text('category'),
    subcategory: text('subcategory'),
    skills: jsonb('skills').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    experienceLevel: text('experience_level'),
    duration: text('duration'),
    workload: text('workload'),

    budgetAmount: numeric('budget_amount', { precision: 12, scale: 2 }),
    hourlyMin: numeric('hourly_min', { precision: 12, scale: 2 }),
    hourlyMax: numeric('hourly_max', { precision: 12, scale: 2 }),
    currency: char('currency', { length: 3 }).default('USD'),

    proposalsCount: integer('proposals_count'),
    interviewing: integer('interviewing'),
    invitesSent: integer('invites_sent'),

    // ── Client fields. ALL NULLABLE. See §10 - availability is unconfirmed. ──
    clientRating: numeric('client_rating', { precision: 3, scale: 2 }),
    clientReviewsCount: integer('client_reviews_count'),
    clientTotalSpent: numeric('client_total_spent', { precision: 14, scale: 2 }),
    clientTotalHires: integer('client_total_hires'),
    clientActiveHires: integer('client_active_hires'),
    clientHireRate: numeric('client_hire_rate', { precision: 5, scale: 2 }),
    clientCountry: text('client_country'),
    clientCity: text('client_city'),
    clientTimezone: text('client_timezone'),
    clientPaymentVerified: boolean('client_payment_verified'),
    clientMemberSince: timestamp('client_member_since', { withTimezone: true }),
    clientAvgHourlyPaid: numeric('client_avg_hourly_paid', { precision: 12, scale: 2 }),
    /** Which pipeline stage populated the client_* block. */
    clientDataSource: fieldSourceEnum('client_data_source').notNull().default('unavailable'),
    clientEnrichedAt: timestamp('client_enriched_at', { withTimezone: true }),

    postedAt: timestamp('posted_at', { withTimezone: true }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),

    /** Everything the MCP returned, untouched. Never delete this. */
    rawPayload: jsonb('raw_payload'),
    /** Keys present in rawPayload that our normalizer did not map (§10.6). */
    unmappedFields: jsonb('unmapped_fields').$type<string[]>(),
    /** Bumped when the normalizer changes, so we can re-derive from rawPayload. */
    normalizerVersion: smallint('normalizer_version').notNull().default(1),

    searchVector: text('search_vector'),
  },
  (t) => [
    index('jobs_posted_idx').on(t.postedAt.desc()),
    index('jobs_first_seen_idx').on(t.firstSeenAt.desc()),
    index('jobs_client_rating_idx').on(t.clientRating),
  ],
);

/** Append-only ledger of changes to a job we have already alerted on (§11.7). */
export const jobRevisions = pgTable(
  'job_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
    changedField: text('changed_field').notNull(), // 'budget_amount' | 'proposals_count' | …
    oldValue: text('old_value'),
    newValue: text('new_value'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('job_revisions_job_idx').on(t.jobId, t.detectedAt.desc())],
);

/* ── matches: the join of a job and a profile ──────────────────────── */

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    jobId: text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').notNull().references(() => searchProfiles.id, { onDelete: 'cascade' }),

    score: smallint('score').notNull(),
    /** Human-readable breakdown: which rules fired and for how many points (§11.4). */
    scoreBreakdown: jsonb('score_breakdown').$type<Record<string, number>>(),
    matchedKeywords: jsonb('matched_keywords').$type<string[]>(),
    /** Why it was NOT alerted, when applicable: 'below_threshold' | 'negative_keyword' | … */
    rejectedReason: text('rejected_reason'),

    isSaved: boolean('is_saved').notNull().default(false),
    isDismissed: boolean('is_dismissed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // ⚠️ THE deduplication guarantee. One row per (job, profile) forever.
    uniqueIndex('matches_job_profile_uq').on(t.jobId, t.profileId),
    index('matches_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('matches_user_score_idx').on(t.userId, t.score.desc()),
  ],
);

/* ── WhatsApp ──────────────────────────────────────────────────────── */

export const whatsappConfigs = pgTable(
  'whatsapp_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull().default('Default'),
    phoneNumberId: text('phone_number_id').notNull(),
    businessAccountId: text('business_account_id'),
    accessTokenEnc: text('access_token_enc').notNull(),
    graphApiVersion: text('graph_api_version').notNull().default('v21.0'),
    /** Meta test numbers can only message 5 pre-verified recipients. */
    isTestEnvironment: boolean('is_test_environment').notNull().default(true),
    status: credStatusEnum('status').notNull().default('untested'),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    lastTestError: text('last_test_error'),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('wa_config_user_idx').on(t.userId)],
);

export const whatsappRecipients = pgTable(
  'whatsapp_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    configId: uuid('config_id').notNull().references(() => whatsappConfigs.id, { onDelete: 'cascade' }),
    /** E.164 without the '+', which is what the Graph API wants. */
    phoneE164: text('phone_e164').notNull(),
    displayName: text('display_name'),
    /** A recipient becomes verified only after a successful test message. */
    isVerified: boolean('is_verified').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    /** Last inbound message from this user - starts the 24h service window (§14.6). */
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('wa_recipient_uq').on(t.configId, t.phoneE164)],
);

export const jobAlerts = pgTable(
  'job_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    jobId: text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => searchProfiles.id, { onDelete: 'set null' }),
    recipientId: uuid('recipient_id').references(() => whatsappRecipients.id, { onDelete: 'set null' }),

    channel: text('channel').notNull().default('whatsapp'),
    status: alertStatusEnum('status').notNull().default('queued'),
    /** Meta's message id, e.g. wamid.HBgM… - the key for delivery webhooks. */
    providerMessageId: text('provider_message_id'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    attemptCount: smallint('attempt_count').notNull().default(0),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimedBy: text('claimed_by'),

    isDigest: boolean('is_digest').notNull().default(false),
    parkedUntil: timestamp('parked_until', { withTimezone: true }), // quiet hours

    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    // Second layer of the dedup guarantee, at the delivery level.
    uniqueIndex('alerts_user_job_profile_recipient_uq').on(t.userId, t.jobId, t.profileId, t.recipientId),
    index('alerts_status_idx').on(t.status),
    index('alerts_provider_msg_idx').on(t.providerMessageId),
  ],
);

export const notificationSettings = pgTable('notification_settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  /**
   * Explicit user-driven pause (WhatsApp "stop" or the settings toggle). Kept
   * separate from quietHoursEnabled so resuming does not clobber the schedule.
   */
  automationPaused: boolean('automation_paused').notNull().default(false),
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  /** Which surface issued the current pause - 'whatsapp' | 'web' | null. */
  pausedVia: text('paused_via'),
  quietHoursEnabled: boolean('quiet_hours_enabled').notNull().default(false),
  quietStart: text('quiet_start').notNull().default('23:00'), // HH:mm in user tz
  quietEnd: text('quiet_end').notNull().default('08:00'),
  digestOnQuietEnd: boolean('digest_on_quiet_end').notNull().default(true),
  maxAlertsPerHour: integer('max_alerts_per_hour').notNull().default(4),
  minDelaySeconds: integer('min_delay_seconds').notNull().default(60),
  /** Hard ceiling per rolling 24h, independent of the hourly rate. */
  maxAlertsPerDay: integer('max_alerts_per_day').notNull().default(30),
  includeClientData: boolean('include_client_data').notNull().default(true),
  includeAiSummary: boolean('include_ai_summary').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ── AI ────────────────────────────────────────────────────────────── */

export const aiCredentials = pgTable(
  'ai_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: aiProviderEnum('provider').notNull(),
    label: text('label').notNull(),
    /** For api-key providers. For google_vertex this holds the service-account JSON. */
    secretEnc: text('secret_enc').notNull(),
    /** Last 4 characters, plaintext, for display only. */
    secretHint: text('secret_hint').notNull(),
    /** Provider-specific non-secret config: baseUrl, project, location, org id… */
    config: jsonb('config').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    defaultModel: text('default_model'),
    availableModels: jsonb('available_models').$type<string[]>(),
    status: credStatusEnum('status').notNull().default('untested'),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    lastTestError: text('last_test_error'),
    isDefault: boolean('is_default').notNull().default(false),
    monthlyBudgetUsd: numeric('monthly_budget_usd', { precision: 10, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ai_cred_user_label_uq').on(t.userId, t.label),
    index('ai_cred_user_provider_idx').on(t.userId, t.provider),
  ],
);

export const proposalDrafts = pgTable(
  'proposal_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    jobId: text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
    credentialId: uuid('credential_id').references(() => aiCredentials.id, { onDelete: 'set null' }),

    provider: aiProviderEnum('provider').notNull(),
    model: text('model').notNull(),
    tone: text('tone').notNull().default('professional'),
    language: text('language').notNull().default('en'),

    coverLetter: text('cover_letter'),
    suggestedBid: numeric('suggested_bid', { precision: 12, scale: 2 }),
    bidRationale: text('bid_rationale'),
    screeningAnswers: jsonb('screening_answers').$type<{ question: string; answer: string }[]>(),
    fitAnalysis: jsonb('fit_analysis').$type<{ strengths: string[]; gaps: string[]; redFlags: string[] }>(),
    /** What the user actually kept, after editing. */
    editedContent: text('edited_content'),

    status: draftStatusEnum('status').notNull().default('generating'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 6 }),
    latencyMs: integer('latency_ms'),
    errorMessage: text('error_message'),
    /** Hash of the prompt template + inputs, so we can diff prompt versions later. */
    promptVersion: text('prompt_version'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('drafts_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('drafts_job_idx').on(t.jobId),
  ],
);

/* ── operations ────────────────────────────────────────────────────── */

export const pollRuns = pgTable(
  'poll_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: runStatusEnum('status').notNull().default('running'),
    triggerSource: text('trigger_source').notNull().default('cron'), // cron | manual | backfill

    pagesFetched: integer('pages_fetched').notNull().default(0),
    jobsSeen: integer('jobs_seen').notNull().default(0),
    jobsNew: integer('jobs_new').notNull().default(0),
    matchesCreated: integer('matches_created').notNull().default(0),
    alertsQueued: integer('alerts_queued').notNull().default(0),
    toolCallsMade: integer('tool_calls_made').notNull().default(0),

    /** Step-by-step timeline for the UI: [{step, ms, ok, note}] */
    timeline: jsonb('timeline'),
    failedStep: text('failed_step'),
    errorMessage: text('error_message'),
    errorKind: text('error_kind'), // auth | rate_limit | network | schema | unknown

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
  },
  (t) => [index('poll_runs_user_started_idx').on(t.userId, t.startedAt.desc())],
);

/** Snapshot of the MCP tool list, so we notice when Upwork ships new tools (§10.7). */
export const mcpToolSnapshots = pgTable(
  'mcp_tool_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    toolNames: jsonb('tool_names').$type<string[]>().notNull(),
    schemas: jsonb('schemas').notNull(),
    /** sha256 of the sorted tool list + schemas; changes ⇒ Upwork changed something. */
    fingerprint: text('fingerprint').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('mcp_snapshot_fingerprint_idx').on(t.fingerprint)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // 'ai_key.created', 'upwork.connected', …
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    metadata: jsonb('metadata'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_user_created_idx').on(t.userId, t.createdAt.desc())],
);

export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(1),
  },
  (t) => [index('rate_limits_window_idx').on(t.windowStart)],
);
