'use server';

import { db, jobs, jobAlerts, matches, searchProfiles, pollRuns, upworkConnections, whatsappConfigs, aiCredentials, eq, and, desc, gte, sql } from '@job-radar/db';
import { requireSession } from '../../lib/require-session';
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
    const [jobsSeenCount, alertsSentCount, avgScoreResult, lastRun, profiles, recentMatches, upworkConn, waConfig, aiCreds] = await Promise.all([
      // Summed from this user's own poll runs. Counting the global jobs table
      // reported every account's ingestion as if it were this user's.
      db
      .select({ count: sql<number>`coalesce(sum(${pollRuns.jobsSeen}), 0)` })
      .from(pollRuns)
      .where(and(eq(pollRuns.userId, userId), gte(pollRuns.startedAt, twentyFourHoursAgo))),
      db
      .select({ count: sql<number>`count(*)` })
      .from(jobAlerts)
      .where(and(eq(jobAlerts.userId, userId), sql`coalesce(${jobAlerts.sentAt}, ${jobAlerts.queuedAt}) >= ${twentyFourHoursAgo}`)),
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
        lastRunAt: lastRun[0]?.startedAt || null,
        lastRunDurationMs: lastRun[0]?.durationMs || null,
        activeProfilesCount: profiles.length,
      },
      recentMatches,
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
