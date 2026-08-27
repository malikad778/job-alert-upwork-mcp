/**
 * Deployment health check.
 *
 * Reports why alerts or dashboard stats may be silent for a given account.
 * Read-only - it never writes to the database.
 *
 *   pnpm tsx scripts/doctor.ts                 # all accounts
 *   pnpm tsx scripts/doctor.ts adnan@mail.com  # one account
 *
 * Point DATABASE_URL at the environment you want to inspect (e.g. AWS) before
 * running.
 */
import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const sql = postgres(connectionString, { prepare: false, connect_timeout: 10 });
const emailFilter = process.argv[2] ?? null;

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const warn = (m: string) => console.log(`  \x1b[33mWARN\x1b[0m  ${m}`);
const bad = (m: string) => console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`);

/** Columns each migration is responsible for, so we can spot an unapplied one. */
const REQUIRED_COLUMNS: Array<{ table: string; column: string; migration: string }> = [
  { table: 'search_profiles', column: 'automation_enabled', migration: '0001' },
  { table: 'job_alerts', column: 'claimed_at', migration: '0001' },
  { table: 'job_alerts', column: 'claimed_by', migration: '0001' },
  { table: 'notification_settings', column: 'min_delay_seconds', migration: '0001' },
  { table: 'notification_settings', column: 'automation_paused', migration: '0002' },
  { table: 'notification_settings', column: 'max_alerts_per_day', migration: '0002' },
  { table: 'search_profiles', column: 'min_relevance', migration: '0002' },
];

async function checkSchema(): Promise<boolean> {
  console.log('\n── Schema ────────────────────────────────');
  const rows = await sql<{ table_name: string; column_name: string }[]>`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'
  `;
  const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));

  const missing = REQUIRED_COLUMNS.filter((c) => !present.has(`${c.table}.${c.column}`));
  if (missing.length === 0) {
    ok('All expected columns present.');
    return true;
  }

  for (const m of missing) {
    bad(`Missing ${m.table}.${m.column} (migration ${m.migration} not applied)`);
  }
  console.log('\n  Fix: pnpm db:migrate   (or pnpm db:push for a dev database)');
  return false;
}

async function checkAccounts() {
  console.log('\n── Accounts ──────────────────────────────');

  const users = emailFilter
    ? await sql`select id, email, timezone from users where email = ${emailFilter}`
    : await sql`select id, email, timezone from users order by email`;

  if (users.length === 0) {
    bad(emailFilter ? `No user found with email ${emailFilter}` : 'No users in the database.');
    return;
  }

  for (const user of users) {
    console.log(`\n  \x1b[1m${user.email}\x1b[0m  (${user.id})`);

    const [conn] = await sql`
      select is_active, expires_at, consecutive_failures, last_error_message
      from upwork_connections where user_id = ${user.id}
    `;
    if (!conn) bad('No Upwork connection - the poller will not run for this account.');
    else if (!conn.is_active) bad(`Upwork connection inactive: ${conn.last_error_message ?? 'unknown reason'}`);
    else if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
      warn(`Upwork token expired at ${conn.expires_at} - will refresh on next poll.`);
    } else ok('Upwork connection active.');

    const profiles = await sql`
      select name, is_active, automation_enabled, notify_enabled, min_score, keywords
      from search_profiles where user_id = ${user.id} and deleted_at is null
    `;
    const live = profiles.filter((p: any) => p.is_active);
    if (profiles.length === 0) bad('No search profiles - nothing will ever match.');
    else if (live.length === 0) bad(`${profiles.length} profile(s), none active.`);
    else {
      ok(`${live.length} active profile(s).`);
      for (const p of live as any[]) {
        if (!p.automation_enabled) warn(`  "${p.name}": automation disabled (a WhatsApp "stop" does this).`);
        if (!p.notify_enabled) warn(`  "${p.name}": notifications disabled.`);
        if (!p.keywords || p.keywords.length === 0) warn(`  "${p.name}": no keywords set.`);
      }
    }

    const [settings] = await sql`select * from notification_settings where user_id = ${user.id}`;
    if (!settings) {
      warn('No notification_settings row - defaults apply, created on first use.');
    } else {
      if (settings.automation_paused) {
        bad(`Alerts PAUSED since ${settings.paused_at} via ${settings.paused_via ?? 'unknown'}. Send "start" on WhatsApp to resume.`);
      } else ok('Automation running.');

      if (settings.quiet_hours_enabled) {
        warn(`Quiet hours active ${settings.quiet_start}-${settings.quiet_end} (${user.timezone}).`);
      }
      ok(`Pacing: ${settings.max_alerts_per_hour}/hour, ${settings.max_alerts_per_day}/day, ${settings.min_delay_seconds}s apart.`);
    }

    const [waConfig] = await sql`
      select phone_number_id, is_active from whatsapp_configs where user_id = ${user.id}
    `;
    if (!waConfig) bad('No WhatsApp config - alerts cannot be delivered.');
    else if (!waConfig.is_active) bad('WhatsApp config inactive.');
    else ok(`WhatsApp config active (phone_number_id ${waConfig.phone_number_id}).`);

    const recipients = await sql`
      select phone_e164, is_verified, is_active from whatsapp_recipients where user_id = ${user.id}
    `;
    const usable = recipients.filter((r: any) => r.is_verified && r.is_active);
    if (usable.length === 0) bad(`No verified+active recipient (${recipients.length} total) - nothing to send to.`);
    else ok(`${usable.length} deliverable recipient(s): ${usable.map((r: any) => r.phone_e164).join(', ')}`);

    const [alerts] = await sql`
      select
        count(*) filter (where status = 'queued')  as queued,
        count(*) filter (where status = 'sent')    as sent,
        count(*) filter (where status = 'failed')  as failed,
        count(*) filter (where status = 'queued' and parked_until > now()) as parked,
        max(sent_at) as last_sent
      from job_alerts where user_id = ${user.id}
    `;
    console.log(
      `  \x1b[36mINFO\x1b[0m  Alerts: ${alerts.queued} queued (${alerts.parked} parked), ${alerts.sent} sent, ${alerts.failed} failed. Last sent: ${alerts.last_sent ?? 'never'}`,
    );

    const failures = await sql`
      select error_message, count(*) from job_alerts
      where user_id = ${user.id} and status = 'failed' and error_message is not null
      group by error_message order by count(*) desc limit 3
    `;
    for (const f of failures as any[]) bad(`  Delivery error x${f.count}: ${f.error_message}`);

    const [run] = await sql`
      select started_at, status, jobs_seen, jobs_new, matches_created, alerts_queued
      from poll_runs where user_id = ${user.id} order by started_at desc limit 1
    `;
    if (!run) bad('No poll runs recorded - the worker has never polled this account.');
    else {
      const ageMin = Math.round((Date.now() - new Date(run.started_at).getTime()) / 60000);
      const line = `Last poll ${ageMin}m ago: ${run.jobs_seen} seen, ${run.jobs_new} new, ${run.matches_created} matched, ${run.alerts_queued} queued.`;
      if (ageMin > 30) bad(`${line} Worker looks stopped (expected every 5m).`);
      else ok(line);
    }
  }
}

try {
  console.log('Upwork MCP doctor');
  console.log(`Database: ${connectionString.replace(/:[^:@]*@/, ':***@')}`);

  const schemaOk = await checkSchema();
  if (!schemaOk) {
    console.log('\nSchema is incomplete - account checks below may report false failures.');
  }
  await checkAccounts();
  console.log('');
} catch (err) {
  console.error('\nDoctor failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
