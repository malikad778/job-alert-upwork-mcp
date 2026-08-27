import {
  and,
  countAlertsSentSince,
  db,
  desc,
  eq,
  getLastAlertSentAt,
  getOrCreateNotificationSettings,
  getUserTimezone,
  notInArray,
  jobAlerts,
  jobs,
  matches,
  searchProfiles,
  sql,
  whatsappConfigs,
  whatsappRecipients,
} from '@job-radar/db';
import { WhatsAppClient, formatJobAlertMessage, isInQuietHours } from '@job-radar/core/whatsapp';
import { decrypt } from '@job-radar/core/crypto';
import { logger } from '@job-radar/core/logger';

const MAX_ATTEMPTS = 3;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Why a user's queue is not being drained right now. Alerts stay queued in
 * every case - throttling never drops a job.
 */
type ThrottleVerdict =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfterMs: number };

/**
 * Decides whether we may send one more alert to this user, honouring the
 * explicit pause, the quiet-hours schedule, and the pacing limits.
 */
async function checkThrottle(userId: string, now: Date): Promise<ThrottleVerdict> {
  const settings = await getOrCreateNotificationSettings(userId);

  if (settings.automationPaused) {
    return { allowed: false, reason: 'automation_paused', retryAfterMs: HOUR_MS };
  }

  if (settings.quietHoursEnabled) {
    const tz = await getUserTimezone(userId);
    if (isInQuietHours(now, tz, settings.quietStart, settings.quietEnd)) {
      return { allowed: false, reason: 'quiet_hours', retryAfterMs: 15 * 60 * 1000 };
    }
  }

  const sentLastDay = await countAlertsSentSince(userId, new Date(now.getTime() - DAY_MS));
  if (sentLastDay >= settings.maxAlertsPerDay) {
    return { allowed: false, reason: 'daily_cap_reached', retryAfterMs: HOUR_MS };
  }

  const sentLastHour = await countAlertsSentSince(userId, new Date(now.getTime() - HOUR_MS));
  if (sentLastHour >= settings.maxAlertsPerHour) {
    return { allowed: false, reason: 'hourly_cap_reached', retryAfterMs: 10 * 60 * 1000 };
  }

  const lastSentAt = await getLastAlertSentAt(userId);
  if (lastSentAt) {
    const elapsedMs = now.getTime() - lastSentAt.getTime();
    const minGapMs = settings.minDelaySeconds * 1000;
    if (elapsedMs < minGapMs) {
      return { allowed: false, reason: 'min_delay_not_elapsed', retryAfterMs: minGapMs - elapsedMs };
    }
  }

  return { allowed: true };
}

export async function dispatchQueuedAlerts(workerId: string, limit = 10): Promise<number> {
  let dispatched = 0;

  /**
   * Users that hit a throttle during this pass. Held in memory so one paused or
   * rate-limited account cannot stall delivery for everyone else.
   */
  const throttledUsers = new Set<string>();

  for (let index = 0; index < limit; index++) {
    const [candidate] = await db
      .select({ alert: jobAlerts, job: jobs, match: matches, profile: searchProfiles })
      .from(jobAlerts)
      .innerJoin(jobs, eq(jobAlerts.jobId, jobs.id))
      .leftJoin(matches, and(eq(matches.jobId, jobAlerts.jobId), eq(matches.profileId, jobAlerts.profileId!)))
      .leftJoin(searchProfiles, eq(searchProfiles.id, jobAlerts.profileId!))
      .where(
        and(
          eq(jobAlerts.status, 'queued'),
          sql`${jobAlerts.queuedAt} >= now() - interval '24 hours'`,
          sql`(${jobAlerts.claimedAt} is null or ${jobAlerts.claimedAt} < now() - interval '5 minutes')`,
          sql`(${jobAlerts.parkedUntil} is null or ${jobAlerts.parkedUntil} <= now())`,
          throttledUsers.size > 0
            ? notInArray(jobAlerts.userId, [...throttledUsers])
            : undefined,
        ),
      )
      .orderBy(desc(jobAlerts.queuedAt))
      .limit(1);

    if (!candidate) break;
    const now = new Date();

    // Check pacing before claiming so a throttled alert keeps a clean record
    // (no attemptCount burn, no claim to release).
    const verdict = await checkThrottle(candidate.alert.userId, now);
    if (!verdict.allowed) {
      throttledUsers.add(candidate.alert.userId);
      await db
        .update(jobAlerts)
        .set({ parkedUntil: new Date(now.getTime() + verdict.retryAfterMs) })
        .where(eq(jobAlerts.id, candidate.alert.id));

      logger.info(
        { userId: candidate.alert.userId, reason: verdict.reason, retryAfterMs: verdict.retryAfterMs },
        'Holding queued WhatsApp alerts - throttled.',
      );
      continue;
    }

    const [claimed] = await db
      .update(jobAlerts)
      .set({ claimedAt: now, claimedBy: workerId, attemptCount: (candidate.alert.attemptCount ?? 0) + 1 })
      .where(
        and(
          eq(jobAlerts.id, candidate.alert.id),
          eq(jobAlerts.status, 'queued'),
          sql`(${jobAlerts.claimedAt} is null or ${jobAlerts.claimedAt} < now() - interval '5 minutes')`,
          sql`(${jobAlerts.parkedUntil} is null or ${jobAlerts.parkedUntil} <= now())`,
        ),
      )
      .returning();

    if (!claimed) continue;

    try {
      // Load config & recipient with fallback to env
      let [config] = await db
        .select()
        .from(whatsappConfigs)
        .where(and(eq(whatsappConfigs.userId, claimed.userId), eq(whatsappConfigs.isActive, true)));

      const phoneNumberId = config?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
      const accessToken = config ? decrypt(config.accessTokenEnc) : process.env.WHATSAPP_ACCESS_TOKEN;

      let [recipient] = await db
        .select()
        .from(whatsappRecipients)
        .where(
          and(
            eq(whatsappRecipients.userId, claimed.userId),
            eq(whatsappRecipients.isActive, true),
            eq(whatsappRecipients.isVerified, true),
          ),
        );

      // No hardcoded fallback number: a stale default would silently deliver
      // one account's job alerts to somebody else's phone.
      const targetPhone = recipient?.phoneE164 || process.env.WHATSAPP_YOUR_NUMBER;

      if (!phoneNumberId || !accessToken || !targetPhone) {
        throw new Error(
          'WhatsApp delivery is not configured: add a verified recipient under Settings → WhatsApp.',
        );
      }

      const client = new WhatsAppClient({
        phoneNumberId,
        accessToken,
        version: config?.graphApiVersion || 'v21.0',
      });

      const normalizedJob = {
        ...candidate.job,
        client: {
          rating: candidate.job.clientRating ? Number(candidate.job.clientRating) : null,
          reviewsCount: candidate.job.clientReviewsCount,
          totalSpent: candidate.job.clientTotalSpent ? Number(candidate.job.clientTotalSpent) : null,
          country: candidate.job.clientCountry,
          city: candidate.job.clientCity,
          paymentVerified: candidate.job.clientPaymentVerified,
        },
        rawPayload: candidate.job.rawPayload || {},
        unmappedFields: candidate.job.unmappedFields || [],
        normalizerVersion: candidate.job.normalizerVersion,
      };

      const profileName = candidate.profile?.name || 'Matched Search Profile';
      const matchScore = candidate.match || { score: 75, reasons: ['Matched user search criteria'] };
      const alertMsg = formatJobAlertMessage(normalizedJob as any, matchScore as any, profileName);

      const result = await client.sendText(targetPhone, alertMsg);

      await db
        .update(jobAlerts)
        .set({
          status: 'sent',
          providerMessageId: result.wamid,
          sentAt: new Date(),
          claimedAt: null,
          claimedBy: null,
        })
        .where(eq(jobAlerts.id, claimed.id));

      dispatched++;
      logger.info({ alertId: claimed.id, wamid: result.wamid, to: targetPhone }, 'Successfully dispatched alert to WhatsApp.');

      // Spacing is enforced by checkThrottle on the next iteration, which reads
      // the sentAt we just wrote. A short pause only avoids a hot loop.
      await new Promise((r) => setTimeout(r, 250));
    } catch (error) {
      const status = (claimed.attemptCount ?? 0) >= MAX_ATTEMPTS ? 'failed' : 'queued';
      await db
        .update(jobAlerts)
        .set({
          status,
          errorMessage: error instanceof Error ? error.message : String(error),
          claimedAt: null,
          claimedBy: null,
        })
        .where(eq(jobAlerts.id, claimed.id));
      logger.error({ err: error, alertId: claimed.id }, 'Queued WhatsApp alert delivery failed.');
    }
  }
  return dispatched;
}

export async function releaseExpiredAlertLeases(): Promise<void> {
  await db
    .update(jobAlerts)
    .set({ claimedAt: null, claimedBy: null })
    .where(
      and(
        eq(jobAlerts.status, 'queued'),
        sql`${jobAlerts.claimedAt} <= now() - interval '5 minutes'`,
      ),
    );
}