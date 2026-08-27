import {
  db,
  jobs,
  matches,
  pollRuns,
  searchProfiles,
  whatsappConfigs,
  whatsappRecipients,
  upworkConnections,
  jobAlerts,
  assertUpworkAllowed,
  recordUpworkCalls,
  getUpworkUsageToday,
  UpworkBlockedError,
  eq,
  and,
} from '@job-radar/db';
import {
  UpworkMcpClient,
  decryptTokens,
  encryptTokens,
  isTokenExpiring,
  refreshUpworkOAuthToken,
  normalizeJob,
  type FindJobsResult,
} from '@job-radar/core/upwork';
import { scoreJob } from '@job-radar/core/matching';
import { logger } from '@job-radar/core/logger';
import { decrypt } from '@job-radar/core/crypto';

export type PollOptions = {
  userId: string;
  triggerType?: 'scheduled' | 'manual' | 'retry';
};

export async function runJobPoll(options: PollOptions): Promise<{
  jobsSeen: number;
  jobsNew: number;
  matchesFound: number;
  alertsSent: number;
}> {
  const startTime = Date.now();
  const empty = { jobsSeen: 0, jobsNew: 0, matchesFound: 0, alertsSent: 0 };

  // Gate before any network access or poll_runs row is written, so a disabled
  // deployment leaves no trace of attempted Upwork activity.
  let settings;
  try {
    settings = await assertUpworkAllowed();
  } catch (err) {
    if (err instanceof UpworkBlockedError) {
      logger.warn({ userId: options.userId, code: err.code }, err.message);
      return empty;
    }
    throw err;
  }

  logger.info({ userId: options.userId }, 'Starting job polling run (§10.7)...');

  // 1. Load active Upwork connection
  const [connection] = await db
    .select()
    .from(upworkConnections)
    .where(and(eq(upworkConnections.userId, options.userId), eq(upworkConnections.isActive, true)));

  if (!connection) {
    logger.warn({ userId: options.userId }, 'No active Upwork connection found.');
    return { jobsSeen: 0, jobsNew: 0, matchesFound: 0, alertsSent: 0 };
  }

  // BUG-02: Token expiry check and refresh
  let { accessToken, refreshToken } = decryptTokens({
    accessTokenEnc: connection.accessTokenEnc,
    refreshTokenEnc: connection.refreshTokenEnc,
  });

  if (isTokenExpiring(connection.expiresAt)) {
    if (!refreshToken || !connection.clientId) {
      await db
        .update(upworkConnections)
        .set({
          isActive: false,
          lastErrorMessage: 'Token expired and no refresh token available.',
          lastErrorAt: new Date(),
        })
        .where(eq(upworkConnections.id, connection.id));
      return { jobsSeen: 0, jobsNew: 0, matchesFound: 0, alertsSent: 0 };
    }

    try {
      const clientSecret = connection.clientSecretEnc
        ? decrypt(connection.clientSecretEnc)
        : null;

      const refreshed = await refreshUpworkOAuthToken(
        refreshToken,
        connection.clientId,
        clientSecret,
      );

      const { accessTokenEnc, refreshTokenEnc } = encryptTokens({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
      });

      await db
        .update(upworkConnections)
        .set({
          accessTokenEnc,
          refreshTokenEnc,
          expiresAt: refreshed.expiresAt,
          lastRefreshedAt: new Date(),
          consecutiveFailures: 0,
          lastErrorMessage: null,
        })
        .where(eq(upworkConnections.id, connection.id));

      accessToken = refreshed.accessToken;
      if (refreshed.refreshToken) {
        refreshToken = refreshed.refreshToken;
      }
    } catch (refreshErr) {
      const failures = (connection.consecutiveFailures ?? 0) + 1;
      await db
        .update(upworkConnections)
        .set({
          consecutiveFailures: failures,
          lastErrorAt: new Date(),
          lastErrorMessage: String(refreshErr),
          isActive: failures < 3,
        })
        .where(eq(upworkConnections.id, connection.id));

      logger.error({ err: refreshErr, userId: options.userId }, 'Failed to refresh Upwork OAuth token.');
      return { jobsSeen: 0, jobsNew: 0, matchesFound: 0, alertsSent: 0 };
    }
  }

  // BUG-05: Resolve and cache orgUid if missing
  let orgUid = connection.orgUid;
  if (!orgUid) {
    try {
      const upworkTemp = new UpworkMcpClient({ accessToken });
      const resolved = await upworkTemp.resolveOrgUid();
      if (!resolved.orgUid) {
        logger.error({ userId: options.userId }, 'Could not resolve Upwork org_uid.');
        return { jobsSeen: 0, jobsNew: 0, matchesFound: 0, alertsSent: 0 };
      }
      orgUid = resolved.orgUid;
      await db
        .update(upworkConnections)
        .set({
          orgUid: resolved.orgUid,
          accountRole: resolved.role,
          accountName: resolved.accountName,
          orgUidCachedAt: new Date(),
        })
        .where(eq(upworkConnections.id, connection.id));
    } catch (orgErr) {
      logger.error({ err: orgErr, userId: options.userId }, 'Error resolving org_uid from Upwork.');
      return { jobsSeen: 0, jobsNew: 0, matchesFound: 0, alertsSent: 0 };
    }
  }

  // Budget is enforced per Upwork identity, since several application accounts
  // may share one token and Upwork rate-limits the identity, not our user rows.
  try {
    await assertUpworkAllowed(orgUid);
  } catch (err) {
    if (err instanceof UpworkBlockedError) {
      logger.warn({ userId: options.userId, orgUid, code: err.code }, err.message);
      return empty;
    }
    throw err;
  }

  const upwork = new UpworkMcpClient({
    accessToken,
    orgUid,
    // Previously omitted, so the configured gap was silently ignored and the
    // client fell back to its 1.5s default.
    minGapSeconds: Number(settings.minSecondsBetweenCalls),
  });

  /** Remaining calls this identity may make today. */
  let callBudget = settings.maxToolCallsPerDay - (await getUpworkUsageToday(orgUid));

  /** Records a call against the daily budget and reports whether to continue. */
  const spendCall = async (): Promise<boolean> => {
    if (callBudget <= 0) return false;
    callBudget--;
    await recordUpworkCalls(orgUid!, 1);
    return true;
  };

  // 2. Load active search profiles
  const profiles = await db
    .select()
    .from(searchProfiles)
    .where(and(eq(searchProfiles.userId, options.userId), eq(searchProfiles.isActive, true)));

  if (profiles.length === 0) {
    logger.info({ userId: options.userId }, 'No active search profiles found.');
    return { jobsSeen: 0, jobsNew: 0, matchesFound: 0, alertsSent: 0 };
  }

  // 3. Load WhatsApp configuration & verified recipients (BUG-01)
  const [waConfig] = await db
    .select()
    .from(whatsappConfigs)
    .where(and(eq(whatsappConfigs.userId, options.userId), eq(whatsappConfigs.isActive, true)));

  let recipients: typeof whatsappRecipients.$inferSelect[] = [];

  if (waConfig) {
    try {
      recipients = await db
        .select()
        .from(whatsappRecipients)
        .where(
          and(
            eq(whatsappRecipients.configId, waConfig.id),
            eq(whatsappRecipients.isVerified, true),
            eq(whatsappRecipients.isActive, true),
          ),
        );
    } catch (err) {
      logger.error({ err, userId: options.userId }, 'Failed to initialize WhatsApp client.');
    }
  }

  let totalJobsSeen = 0;
  let totalJobsNew = 0;
  let totalMatchesFound = 0;
  let totalAlertsSent = 0;
  let totalEnrichmentCalls = 0;
  // Driven by admin settings (default 2) rather than a hardcoded 10. Ten pages
  // per profile per cycle was the main driver of the request volume that got
  // the account restricted.
  const MAX_PAGES = settings.maxPagesPerProfile;
  const MAX_ENRICHMENT = settings.maxEnrichmentCallsPerRun;

  // 4. Poll Upwork for each profile
  for (const prof of profiles) {
    const query = prof.keywords.join(' OR ');
    logger.info({ profileId: prof.id, profileName: prof.name, query }, 'Polling Upwork search...');

    let cursor: string | undefined = undefined;
    let page = 0;

    // GAP-02: Pagination loop
    while (page < MAX_PAGES) {
      if (!(await spendCall())) {
        logger.warn({ orgUid, profileId: prof.id }, 'Daily Upwork call budget exhausted; stopping poll.');
        break;
      }

      try {
        const searchResult = await upwork.findJobs({
          query,
          orgUid,
          cursor,
        });

        totalJobsSeen += searchResult.jobs.length;
        let newJobsThisPage = 0;

        for (const normalized of searchResult.jobs) {
          // Upsert job into database (§8.3)
          const [insertedJob] = await db
            .insert(jobs)
            .values({
              id: normalized.id,
              title: normalized.title,
              description: normalized.description,
              url: normalized.url,
              jobType: normalized.jobType,
              budgetAmount: normalized.budgetAmount ? String(normalized.budgetAmount) : null,
              hourlyMin: normalized.hourlyMin ? String(normalized.hourlyMin) : null,
              hourlyMax: normalized.hourlyMax ? String(normalized.hourlyMax) : null,
              currency: normalized.currency,
              skills: normalized.skills,
              clientRating: normalized.client.rating ? String(normalized.client.rating) : null,
              clientReviewsCount: normalized.client.reviewsCount,
              clientTotalSpent: normalized.client.totalSpent ? String(normalized.client.totalSpent) : null,
              clientCountry: normalized.client.country,
              clientPaymentVerified: normalized.client.paymentVerified,
              proposalsCount: normalized.proposalsCount,
              postedAt: normalized.postedAt,
              rawPayload: normalized.rawPayload,
              normalizerVersion: normalized.normalizerVersion,
            })
            .onConflictDoNothing()
            .returning();

          if (insertedJob) {
            totalJobsNew++;
            newJobsThisPage++;
          }

          // Score against profile (§11)
          const match = scoreJob(normalized, prof as any);
          if (match.matched) {
            totalMatchesFound++;

            // MT-05: Record match in DB with explicit unique conflict target
            await db
              .insert(matches)
              .values({
                userId: options.userId,
                jobId: normalized.id,
                profileId: prof.id,
                score: match.score,
                scoreBreakdown: match.breakdown,
                matchedKeywords: match.matchedKeywords,
              })
              .onConflictDoNothing({ target: [matches.jobId, matches.profileId] });

            // GAP-03: Pipeline B enrichment if needed (max 20 calls per run)
            if (insertedJob && totalEnrichmentCalls < MAX_ENRICHMENT && (await spendCall())) {
              try {
                const detail = await upwork.getJobDetails(normalized.id, orgUid);
                if (detail) {
                  const enriched = normalizeJob({ ...normalized.rawPayload, ...detail });
                  await db
                    .update(jobs)
                    .set({
                      clientRating: enriched.client.rating ? String(enriched.client.rating) : null,
                      clientTotalSpent: enriched.client.totalSpent ? String(enriched.client.totalSpent) : null,
                      clientCountry: enriched.client.country,
                      clientPaymentVerified: enriched.client.paymentVerified,
                      clientDataSource: 'detail_tool',
                      clientEnrichedAt: new Date(),
                    })
                    .where(eq(jobs.id, normalized.id));
                }
                totalEnrichmentCalls++;
              } catch (enrichErr) {
                logger.warn({ err: enrichErr, jobId: normalized.id }, 'Enrichment call failed.');
              }
            }

            // Check if alert should be sent (§14)
            if (recipients.length > 0 && prof.notifyEnabled && prof.automationEnabled && match.score >= prof.minScore) {
              {
                for (const recipient of recipients) {
                  try {
                    const [queuedAlert] = await db
                      .insert(jobAlerts)
                      .values({
                        userId: options.userId,
                        jobId: normalized.id,
                        profileId: prof.id,
                        recipientId: recipient.id,
                        channel: 'whatsapp',
                        status: 'queued',
                      })
                      .onConflictDoNothing({
                        target: [jobAlerts.userId, jobAlerts.jobId, jobAlerts.profileId, jobAlerts.recipientId],
                      })
                      .returning({ id: jobAlerts.id });

                    if (!queuedAlert) {
                      logger.info({ jobId: normalized.id, recipientId: recipient.id }, 'Skipped duplicate WhatsApp alert.');
                      continue;
                    }
                    totalAlertsSent++;
                    logger.info({ jobId: normalized.id, score: match.score, alertId: queuedAlert.id }, 'Queued WhatsApp alert.');
                  } catch (waErr: any) {
                    logger.error({ err: waErr, jobId: normalized.id }, 'Failed to dispatch WhatsApp alert.');
                    logger.error({ err: waErr, jobId: normalized.id }, 'Failed to queue WhatsApp alert.');
                  }
                }
              }
            }
          }
        }

        // Pagination loop guards
        if (newJobsThisPage === 0 && page > 0) break; // Caught up with already seen jobs
        if (!searchResult.hasNextPage || !searchResult.nextCursor) break;
        if (searchResult.nextCursor === cursor) break; // Loop guard

        cursor = searchResult.nextCursor;
        page++;
      } catch (searchErr) {
        logger.error({ err: searchErr, profileId: prof.id, page }, 'Error during profile job poll page.');
        break;
      }
    }
  }

  // 5. Record poll run metrics (§8.3) with correct schema column names (BUG-01)
  const durationMs = Date.now() - startTime;
  await db.insert(pollRuns).values({
    userId: options.userId,
    startedAt: new Date(startTime),
    finishedAt: new Date(),
    durationMs,
    status: 'success',
    jobsSeen: totalJobsSeen,
    jobsNew: totalJobsNew,
    matchesCreated: totalMatchesFound,
    alertsQueued: totalAlertsSent,
  });

  logger.info(
    { durationMs, totalJobsSeen, totalJobsNew, totalMatchesFound, totalAlertsSent },
    'Completed job polling run.',
  );

  return {
    jobsSeen: totalJobsSeen,
    jobsNew: totalJobsNew,
    matchesFound: totalMatchesFound,
    alertsSent: totalAlertsSent,
  };
}
