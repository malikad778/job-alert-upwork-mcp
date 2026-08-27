'use server';

import { db, aiCredentials, eq, and, desc } from '@job-radar/db';
import { encrypt, hint } from '@job-radar/core/crypto';
import {
  testAIConnection,
  fetchAvailableModels,
  type ProviderId,
} from '@job-radar/core/ai';
import { logger } from '@job-radar/core/logger';
import { requireSession } from '../../lib/require-session';
import { revalidatePath } from 'next/cache';

export type AIProviderId = ProviderId;

export type SaveAICredentialInput = {
  provider: AIProviderId;
  label: string;
  apiKey: string;
  defaultModel: string;
  config?: Record<string, string>;
  isDefault?: boolean;
  monthlyBudgetUsd?: number;
  availableModels?: string[];
};

/**
 * Fetch all AI credentials for the authenticated user
 */
export async function getAICredentialsAction() {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const list = await db
      .select()
      .from(aiCredentials)
      .where(eq(aiCredentials.userId, userId))
      .orderBy(desc(aiCredentials.createdAt));

    return {
      success: true,
      data: list.map((c) => ({
        id: c.id,
        provider: c.provider,
        label: c.label,
        secretHint: c.secretHint,
        defaultModel: c.defaultModel,
        availableModels: c.availableModels || [],
        config: c.config || {},
        status: c.status,
        isDefault: c.isDefault,
        monthlyBudgetUsd: c.monthlyBudgetUsd ? Number(c.monthlyBudgetUsd) : null,
        lastTestedAt: c.lastTestedAt,
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}

/**
 * Tests an AI Provider API key with a fast heartbeat ping and auto-fetches available models (AI-02)
 */
export async function testAICredentialAction(input: {
  provider: AIProviderId;
  apiKey: string;
  modelName: string;
  config?: Record<string, string>;
}): Promise<{
  success: boolean;
  latencyMs?: number;
  availableModels?: string[];
  error?: string;
}> {
  const result = await testAIConnection({
    provider: input.provider,
    apiKey: input.apiKey,
    modelName: input.modelName,
    config: input.config,
  });

  if (result.success) {
    const models = await fetchAvailableModels(input.provider, input.apiKey, input.config);
    return {
      success: true,
      latencyMs: result.latencyMs,
      availableModels: models.length > 0 ? models : undefined,
    };
  }

  return { success: false, error: result.error };
}

/**
 * Saves and encrypts an AI Provider key in the database (SEC-03)
 */
export async function saveAICredentialAction(
  input: SaveAICredentialInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const secretEnc = encrypt(input.apiKey);
    const secretHint = hint(input.apiKey);

    if (input.isDefault) {
      // Unset other defaults for this user
      await db
        .update(aiCredentials)
        .set({ isDefault: false })
        .where(eq(aiCredentials.userId, userId));
    }

    const [saved] = await db
      .insert(aiCredentials)
      .values({
        userId,
        provider: input.provider as any,
        label: input.label || `${input.provider} key`,
        secretEnc,
        secretHint,
        config: input.config || {},
        defaultModel: input.defaultModel,
        availableModels: input.availableModels || [],
        status: 'valid',
        lastTestedAt: new Date(),
        isDefault: Boolean(input.isDefault),
        monthlyBudgetUsd: input.monthlyBudgetUsd ? String(input.monthlyBudgetUsd) : null,
      })
      .returning();

    revalidatePath('/settings/ai');
    return { success: true, id: saved?.id };
  } catch (err: any) {
    logger.error({ err }, 'Failed to save AI credential.');
    return { success: false, error: err.message };
  }
}

/**
 * Deletes an AI credential with ownership verification (SEC-03)
 */
export async function deleteAICredentialAction(
  credentialId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    await db
      .delete(aiCredentials)
      .where(and(eq(aiCredentials.id, credentialId), eq(aiCredentials.userId, userId)));

    revalidatePath('/settings/ai');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Set an AI credential as default
 */
export async function setDefaultAICredentialAction(credentialId: string) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    await db
      .update(aiCredentials)
      .set({ isDefault: false })
      .where(eq(aiCredentials.userId, userId));

    await db
      .update(aiCredentials)
      .set({ isDefault: true })
      .where(and(eq(aiCredentials.id, credentialId), eq(aiCredentials.userId, userId)));

    revalidatePath('/settings/ai');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
