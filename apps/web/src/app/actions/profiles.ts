'use server';

import { db, searchProfiles, eq, and, desc } from '@job-radar/db';
import { logger } from '@job-radar/core/logger';
import { requireSession } from '../../lib/require-session';
import { revalidatePath } from 'next/cache';

export type ProfileFormData = {
  id?: string;
  name: string;
  isActive: boolean;
  automationEnabled?: boolean;
  keywords: string[];
  negativeKeywords: string[];
  minHourlyRate?: number;
  minFixedBudget?: number;
  minMatchScore: number;
  /** Minimum keyword/skill relevance before quality signals count. */
  minRelevance?: number;
  minClientRating?: number;
  paymentVerifiedOnly?: boolean;
};

/**
 * Fetch all search profiles for authenticated user (SEC-01)
 */
export async function getProfilesAction() {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const list = await db
      .select()
      .from(searchProfiles)
      .where(eq(searchProfiles.userId, userId))
      .orderBy(desc(searchProfiles.createdAt));

    return { success: true, data: list };
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch profiles.');
    return { success: false, error: err.message, data: [] };
  }
}

/**
 * Create or Update a search profile (GAP-11)
 */
export async function saveProfileAction(data: ProfileFormData) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    if (data.id && !data.id.startsWith('prof-temp-')) {
      // Update existing
      const [updated] = await db
        .update(searchProfiles)
        .set({
          name: data.name,
          isActive: data.isActive,
          automationEnabled: data.automationEnabled !== false,
          keywords: data.keywords,
          negativeKeywords: data.negativeKeywords,
          minHourlyRate: data.minHourlyRate ? String(data.minHourlyRate) : null,
          minFixedBudget: data.minFixedBudget ? String(data.minFixedBudget) : null,
          minScore: data.minMatchScore || 65, // GAP-11: minScore column
          minRelevance: data.minRelevance ?? 25,
          minClientRating: data.minClientRating ? String(data.minClientRating) : null,
          requirePaymentVerified: Boolean(data.paymentVerifiedOnly),
          updatedAt: new Date(),
        })
        .where(and(eq(searchProfiles.id, data.id), eq(searchProfiles.userId, userId)))
        .returning();

      revalidatePath('/profiles');
      return { success: true, profile: updated };
    } else {
      // Create new
      const [created] = await db
        .insert(searchProfiles)
        .values({
          userId,
          name: data.name,
          isActive: data.isActive !== false,
          automationEnabled: data.automationEnabled !== false,
          keywords: data.keywords,
          negativeKeywords: data.negativeKeywords || [],
          minHourlyRate: data.minHourlyRate ? String(data.minHourlyRate) : null,
          minFixedBudget: data.minFixedBudget ? String(data.minFixedBudget) : null,
          minScore: data.minMatchScore || 65, // GAP-11: minScore column
          minRelevance: data.minRelevance ?? 25,
          minClientRating: data.minClientRating ? String(data.minClientRating) : null,
          requirePaymentVerified: Boolean(data.paymentVerifiedOnly),
        })
        .returning();

      revalidatePath('/profiles');
      return { success: true, profile: created };
    }
  } catch (err: any) {
    logger.error({ err }, 'Failed to save search profile.');
    return { success: false, error: err.message };
  }
}

/**
 * Toggle profile active status
 */
export async function toggleProfileStatusAction(profileId: string, isActive: boolean) {
  try {
    const session = await requireSession();
    await db
      .update(searchProfiles)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(searchProfiles.id, profileId), eq(searchProfiles.userId, session.user.id)));

    revalidatePath('/profiles');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Delete a profile
 */
export async function deleteProfileAction(profileId: string) {
  try {
    const session = await requireSession();
    await db
      .delete(searchProfiles)
      .where(and(eq(searchProfiles.id, profileId), eq(searchProfiles.userId, session.user.id)));

    revalidatePath('/profiles');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
