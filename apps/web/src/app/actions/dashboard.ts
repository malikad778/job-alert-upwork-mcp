'use server';

import { db, jobs, jobAlerts, matches, searchProfiles, pollRuns, upworkConnections, whatsappConfigs, aiCredentials, getUpworkGuardStatus, eq, and, desc, gte, sql } from '@job-radar/db';
import { requireSession } from '../../lib/require-session';
import { logger } from '@job-radar/core/logger';
import { runJobPoll } from '@job-radar/jobs';
import { revalidatePath } from 'next/cache';

/**
 * Fetch live dashboard stats and recent matches for current user (GAP-06)
 */
export async function getDashboardDataAction() {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 1. Metrics
    //
    // allSettled, not all: these queries are independent, and a single failure
    // used to reject the whole batch and blank the entire screen - including
    // the connection panel, which reported Upwork/WhatsApp as disconnected even
    // though the rows existed. Now a broken query costs only its own tile.
    const results = await Promise.allSettled([
      // Summed from this user's own poll runs. Counting the global jobs table
      // reported every account's ingestion as if it were this user's.
      db
      .select({ count: sql<number>`coalesce(sum(${pollRuns.jobsSeen}), 0)` })
      .from(pollRuns)
      .where(and(eq(pollRuns.userId, userId), gte(pollRuns.startedAt, twentyFourHoursAgo))),
      db
      .select({ count: sql<number>`count(*)` })
      .from(jobAlerts)
      // The cutoff is passed as an ISO string and cast in SQL. Interpolating a
      // JS Date straight into a raw sql`` template gives the driver no column
      // type to infer from, and postgres-js then fails with "The 'string'
      // argument must be of type string ... Received an instance of Date".
      // That rejection took down the whole Promise.all below, which is why the
      // dashboard reported zeros and every connection as disconnected.
      .where(and(
        eq(jobAlerts.userId, userId),
        sql`coalesce(${jobAlerts.sentAt}, ${jobAlerts.queuedAt}) >= ${twentyFourHoursAgo.toISOString()}::timestamptz`,
      )),
      db
      .select({ avg: sql<number>`round(coalesce(avg(${matches.score}), 0))` })
      .from(matches)
      .where(eq(matches.userId, userId)),
      db
      .select()
      .from(pollRuns)
      .where(eq(pollRuns.userId, userId))
      .orderBy(desc(pollRuns.startedAt))
      .limit(1),
      db
      .select()
      .from(searchProfiles)
      .where(and(eq(searchProfiles.userId, userId), eq(searchProfiles.isActive, true))),
      db
      .select({
        matchId: matches.id,
        score: matches.score,
        scoreBreakdown: matches.scoreBreakdown,
        matchedKeywords: matches.matchedKeywords,
        createdAt: matches.createdAt,
        jobId: jobs.id,
        title: jobs.title,
        description: jobs.description,
        budgetAmount: jobs.budgetAmount,
        hourlyMin: jobs.hourlyMin,
        hourlyMax: jobs.hourlyMax,
        jobType: jobs.jobType,
        url: jobs.url,
        postedAt: jobs.postedAt,
        clientRating: jobs.clientRating,
        clientTotalSpent: jobs.clientTotalSpent,
        clientCountry: jobs.clientCountry,
        clientPaymentVerified: jobs.clientPaymentVerified,
        profileName: searchProfiles.name,
      })
      .from(matches)
      .innerJoin(jobs, eq(matches.jobId, jobs.id))
      .leftJoin(searchProfiles, eq(matches.profileId, searchProfiles.id))
      .where(eq(matches.userId, userId))
      .orderBy(desc(matches.createdAt))
      .limit(10),
      db.select().from(upworkConnections).where(eq(upworkConnections.userId, userId)),
      db.select().from(whatsappConfigs).where(eq(whatsappConfigs.userId, userId)),
      db.select().from(aiCredentials).where(eq(aiCredentials.userId, userId)),
    ]);

    // Unwrap each result independently, falling back to an empty set. Any query
    // that did fail is logged rather than swallowed.
    const failures: string[] = [];
    const labels = [
      'jobsSeen', 'alertsSent', 'avgScore', 'lastRun',
      'profiles', 'recentMatches', 'upworkConnection', 'whatsappConfig', 'aiCredentials',
    ];

    const unwrap = <T>(index: number): T[] => {
      const r = results[index];
      if (r.status === 'fulfilled') return r.value as T[];
      failures.push(`${labels[index]}: ${r.reason?.message ?? r.reason}`);
      return [];
    };

    const jobsSeenCount = unwrap<{ count: number }>(0);
    const alertsSentCount = unwrap<{ count: number }>(1);
    const avgScoreResult = unwrap<{ avg: number }>(2);
    const lastRun = unwrap<typeof pollRuns.$inferSelect>(3);
    const profiles = unwrap<typeof searchProfiles.$inferSelect>(4);
    const recentMatches = unwrap<any>(5);
    const upworkConn = unwrap<typeof upworkConnections.$inferSelect>(6);
    const waConfig = unwrap<typeof whatsappConfigs.$inferSelect>(7);
    const aiCreds = unwrap<typeof aiCredentials.$inferSelect>(8);

    if (failures.length > 0) {
      logger.error({ failures, userId }, 'Dashboard queries partially failed.');
    }

    const connections = {
      upwork: {
        isConnected: Boolean(upworkConn[0]?.isActive),
        isPending: Boolean(upworkConn[0] && !upworkConn[0].isActive),
      },
      whatsapp: {
        isConnected: Boolean(waConfig[0]?.isActive),
      },
      ai: {
        isConnected: true,
      }
    };

    return {
      success: true,
      metrics: {
        jobsSeenToday: Number(jobsSeenCount[0]?.count || 0),
        alertsSentToday: Number(alertsSentCount[0]?.count || 0),
        avgScore: Number(avgScoreResult[0]?.avg || 0),
        lastRunAt: lastRun[0]?.startedAt ? lastRun[0].startedAt.toISOString() : null,
        lastRunDurationMs: lastRun[0]?.durationMs || null,
        activeProfilesCount: profiles.length,
      },
      recentMatches: recentMatches.map((m) => ({
        ...m,
        createdAt: m.createdAt ? m.createdAt.toISOString() : null,
        postedAt: m.postedAt ? m.postedAt.toISOString() : null,
      })),
      connections,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      metrics: {
        jobsSeenToday: 0,
        alertsSentToday: 0,
        avgScore: 0,
        lastRunAt: null,
        lastRunDurationMs: null,
        activeProfilesCount: 0,
      },
      recentMatches: [],
      connections: {
        upwork: { isConnected: false, isPending: false },
        whatsapp: { isConnected: false },
        ai: { isConnected: false },
      }
    };
  }
}

/**
 * Trigger manual poll run now (GAP-06)
 */
export async function triggerPollNowAction() {
  try {
    const session = await requireSession();

    // "Check Upwork Now" is a direct browser-triggered path to Upwork. Gate it
    // explicitly so the button cannot generate traffic while polling is off.
    const status = await getUpworkGuardStatus();
    if (status.blocked) {
      return {
        success: false,
        error:
          status.settings.upworkDisabledReason ||
          'Upwork access is currently disabled by an administrator. No requests are being sent to Upwork.',
      };
    }

    const result = await runJobPoll({
      userId: session.user.id,
      triggerType: 'manual',
    });

    // Immediately dispatch queued alerts to WhatsApp
    const { dispatchQueuedAlerts } = await import('@job-radar/jobs');
    const dispatched = await dispatchQueuedAlerts(`manual-web-${session.user.id}`, 10);

    revalidatePath('/dashboard');
    revalidatePath('/jobs');
    return {
      success: true,
      jobsSeen: result.jobsSeen,
      jobsNew: result.jobsNew,
      matchesFound: result.matchesFound,
      alertsSent: dispatched > 0 ? dispatched : result.alertsSent,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
