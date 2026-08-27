'use server';

import { db, jobs, matches, searchProfiles, eq, and, or, desc, sql, ilike, gte } from '@job-radar/db';
import { requireSession } from '../../lib/require-session';

/**
 * Fetch filtered jobs with user match status (GAP-07)
 */
export async function getJobsAction(params?: {
  search?: string;
  profileId?: string;
  minScore?: number;
  jobType?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const offset = (page - 1) * limit;
    const filters = [];

    if (params?.search?.trim()) {
      const search = `%${params.search.trim()}%`;
      filters.push(or(ilike(jobs.title, search), ilike(jobs.description, search)));
    }
    if (params?.profileId) {
      filters.push(eq(matches.profileId, params.profileId));
    }
    if (params?.minScore !== undefined) {
      filters.push(gte(matches.score, params.minScore));
    }
    if (params?.jobType) {
      filters.push(eq(jobs.jobType, params.jobType as 'hourly' | 'fixed' | 'unknown'));
    }

    let query = db
      .select({
        id: jobs.id,
        title: jobs.title,
        description: jobs.description,
        url: jobs.url,
        jobType: jobs.jobType,
        budgetAmount: jobs.budgetAmount,
        hourlyMin: jobs.hourlyMin,
        hourlyMax: jobs.hourlyMax,
        skills: jobs.skills,
        clientRating: jobs.clientRating,
        clientReviewsCount: jobs.clientReviewsCount,
        clientTotalSpent: jobs.clientTotalSpent,
        clientCountry: jobs.clientCountry,
        clientPaymentVerified: jobs.clientPaymentVerified,
        proposalsCount: jobs.proposalsCount,
        postedAt: jobs.postedAt,
        firstSeenAt: jobs.firstSeenAt,
        matchId: matches.id,
        score: matches.score,
        scoreBreakdown: matches.scoreBreakdown,
        profileName: searchProfiles.name,
        profileId: searchProfiles.id,
        matchStatus: sql<'matched' | 'unmatched'>`case when ${matches.id} is null then 'unmatched' else 'matched' end`,
      })
      .from(jobs)
      .leftJoin(
        matches,
        and(eq(matches.jobId, jobs.id), eq(matches.userId, userId)),
      )
      .leftJoin(searchProfiles, eq(matches.profileId, searchProfiles.id))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(jobs.firstSeenAt))
      .limit(limit)
      .offset(offset);

    const list = await query;

    const [totalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .leftJoin(matches, and(eq(matches.jobId, jobs.id), eq(matches.userId, userId)))
      .where(filters.length > 0 ? and(...filters) : undefined);

    return {
      success: true,
      data: list,
      total: Number(totalCount?.count || 0),
      page,
      limit,
    };
  } catch (err: any) {
    return { success: false, error: err.message, data: [], total: 0, page: 1, limit: 20 };
  }
}

/**
 * Fetch full details for a single job (GAP-08)
 */
export async function getJobDetailAction(jobId: string) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId));

    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    const [match] = await db
      .select({
        score: matches.score,
        scoreBreakdown: matches.scoreBreakdown,
        matchedKeywords: matches.matchedKeywords,
        rejectedReason: matches.rejectedReason,
        profileName: searchProfiles.name,
      })
      .from(matches)
      .leftJoin(searchProfiles, eq(matches.profileId, searchProfiles.id))
      .where(and(eq(matches.jobId, jobId), eq(matches.userId, userId)));

    if (!match) {
      return {
        success: true,
        job,
        match: null,
      };
    }

    return {
      success: true,
      job,
      match: match || null,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
