'use server';

import { db, proposalDrafts, jobs, eq, and, desc } from '@job-radar/db';
import { requireSession } from '../../lib/require-session';
import { revalidatePath } from 'next/cache';

/**
 * Fetch all proposal drafts for current user
 */
export async function getProposalDraftsAction() {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const list = await db
      .select({
        id: proposalDrafts.id,
        jobId: proposalDrafts.jobId,
        provider: proposalDrafts.provider,
        model: proposalDrafts.model,
        coverLetter: proposalDrafts.coverLetter,
        suggestedBid: proposalDrafts.suggestedBid,
        bidRationale: proposalDrafts.bidRationale,
        status: proposalDrafts.status,
        createdAt: proposalDrafts.createdAt,
        jobTitle: jobs.title,
        jobBudget: jobs.budgetAmount,
        jobHourlyMin: jobs.hourlyMin,
        jobHourlyMax: jobs.hourlyMax,
        jobType: jobs.jobType,
        jobUrl: jobs.url,
      })
      .from(proposalDrafts)
      .leftJoin(jobs, eq(proposalDrafts.jobId, jobs.id))
      .where(eq(proposalDrafts.userId, userId))
      .orderBy(desc(proposalDrafts.createdAt));

    return { success: true, data: list };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}

/**
 * Delete a proposal draft
 */
export async function deleteProposalDraftAction(draftId: string) {
  try {
    const session = await requireSession();
    await db
      .delete(proposalDrafts)
      .where(and(eq(proposalDrafts.id, draftId), eq(proposalDrafts.userId, session.user.id)));

    revalidatePath('/proposals');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Update proposal status (e.g. copied, submitted_externally, discarded)
 */
export async function updateProposalStatusAction(draftId: string, status: any) {
  try {
    const session = await requireSession();
    await db
      .update(proposalDrafts)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(proposalDrafts.id, draftId), eq(proposalDrafts.userId, session.user.id)));

    revalidatePath('/proposals');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
