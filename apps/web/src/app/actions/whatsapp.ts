'use server';

import {
  db,
  whatsappConfigs,
  whatsappRecipients,
  notificationSettings,
  getOrCreateNotificationSettings,
  setAutomationPaused,
  countQueuedAlerts,
  countAlertsSentSince,
  eq,
  and,
} from '@job-radar/db';
import { WhatsAppClient } from '@job-radar/core/whatsapp';
import { formatJobAlertMessage } from '@job-radar/core/whatsapp';
import { encrypt, decrypt } from '@job-radar/core/crypto';
import { logger } from '@job-radar/core/logger';
import { requireSession } from '../../lib/require-session';
import type { NormalizedJob } from '@job-radar/core/upwork';
import type { MatchResult } from '@job-radar/core/matching';
import { revalidatePath } from 'next/cache';

/**
 * Fetch WhatsApp configuration and recipients for current user
 */
export async function getWhatsAppConfigAction() {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const [config] = await db
      .select()
      .from(whatsappConfigs)
      .where(eq(whatsappConfigs.userId, userId));

    const recipients = config
      ? await db
          .select()
          .from(whatsappRecipients)
          .where(eq(whatsappRecipients.configId, config.id))
      : [];

    const [notifSettings] = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId));

    return {
      success: true,
      config: config
        ? {
            id: config.id,
            phoneNumberId: config.phoneNumberId,
            businessAccountId: config.businessAccountId,
            graphApiVersion: config.graphApiVersion,
            isTestEnvironment: config.isTestEnvironment,
            status: config.status,
            isActive: config.isActive,
          }
        : null,
      recipients,
      notificationSettings: notifSettings || null,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Test unsaved WhatsApp credentials before saving
 */
export async function testWhatsAppCredentialsAction(input: {
  phoneNumberId: string;
  accessToken: string;
  recipientPhone: string;
  version?: string;
}): Promise<{ success: boolean; wamid?: string; error?: string }> {
  try {
    const cleanPhone = input.recipientPhone.replace(/[^0-9]/g, '');
    const client = new WhatsAppClient({
      phoneNumberId: input.phoneNumberId,
      accessToken: input.accessToken,
      version: input.version || 'v21.0',
    });

    const result = await client.sendText(
      cleanPhone,
      '✅ *Upwork MCP WhatsApp Integration Verified*\n\nYour Meta WhatsApp Cloud API credentials are valid and alerts are now ready to be dispatched to this number!',
    );

    return { success: true, wamid: result.wamid };
  } catch (err: any) {
    logger.error({ err }, 'WhatsApp credential test failed.');
    return { success: false, error: err.message || 'Meta API verification failed.' };
  }
}

/**
 * Save WhatsApp configuration
 */
export async function saveWhatsAppConfigAction(input: {
  phoneNumberId: string;
  businessAccountId?: string;
  accessToken: string;
  graphApiVersion?: string;
  isTestEnvironment?: boolean;
  recipientPhone?: string;
  recipientName?: string;
}) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const accessTokenEnc = encrypt(input.accessToken);

    const [existing] = await db
      .select()
      .from(whatsappConfigs)
      .where(eq(whatsappConfigs.userId, userId));

    let configId: string;

    if (existing) {
      const [updated] = await db
        .update(whatsappConfigs)
        .set({
          phoneNumberId: input.phoneNumberId,
          businessAccountId: input.businessAccountId || null,
          accessTokenEnc,
          graphApiVersion: input.graphApiVersion || 'v21.0',
          isTestEnvironment: Boolean(input.isTestEnvironment),
          status: 'valid',
          isActive: true,
          lastTestedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(whatsappConfigs.id, existing.id))
        .returning();
      configId = updated!.id;
    } else {
      const [created] = await db
        .insert(whatsappConfigs)
        .values({
          userId,
          phoneNumberId: input.phoneNumberId,
          businessAccountId: input.businessAccountId || null,
          accessTokenEnc,
          graphApiVersion: input.graphApiVersion || 'v21.0',
          isTestEnvironment: Boolean(input.isTestEnvironment),
          status: 'valid',
          isActive: true,
          lastTestedAt: new Date(),
        })
        .returning();
      configId = created!.id;
    }

    // Add recipient if provided
    if (input.recipientPhone) {
      const cleanPhone = input.recipientPhone.replace(/[^0-9]/g, '');
      await db
        .insert(whatsappRecipients)
        .values({
          userId,
          configId,
          phoneE164: cleanPhone,
          displayName: input.recipientName || 'Primary Alert Recipient',
          isVerified: true,
          verifiedAt: new Date(),
          isActive: true,
        })
        .onConflictDoNothing({ target: [whatsappRecipients.configId, whatsappRecipients.phoneE164] });
    }

    revalidatePath('/settings/whatsapp');
    return { success: true, configId };
  } catch (err: any) {
    logger.error({ err }, 'Failed to save WhatsApp config.');
    return { success: false, error: err.message };
  }
}

/**
 * Add a new recipient phone number
 */
export async function addWhatsAppRecipientAction(input: {
  phone: string;
  displayName?: string;
}) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const [config] = await db
      .select()
      .from(whatsappConfigs)
      .where(and(eq(whatsappConfigs.userId, userId), eq(whatsappConfigs.isActive, true)));

    if (!config) throw new Error('Configure your WhatsApp credentials first.');

    const cleanPhone = input.phone.replace(/[^0-9]/g, '');

    const [recipient] = await db
      .insert(whatsappRecipients)
      .values({
        userId,
        configId: config.id,
        phoneE164: cleanPhone,
        displayName: input.displayName || 'Alert Recipient',
        isVerified: true,
        verifiedAt: new Date(),
        isActive: true,
      })
      .returning();

    revalidatePath('/settings/whatsapp');
    return { success: true, recipient };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Remove a recipient phone number
 */
export async function deleteWhatsAppRecipientAction(recipientId: string) {
  try {
    const session = await requireSession();
    await db
      .delete(whatsappRecipients)
      .where(and(eq(whatsappRecipients.id, recipientId), eq(whatsappRecipients.userId, session.user.id)));

    revalidatePath('/settings/whatsapp');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Save notification & quiet hours settings
 */
export async function saveNotificationSettingsAction(input: {
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  maxAlertsPerHour?: number;
  minDelaySeconds?: number;
  maxAlertsPerDay?: number;
}) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    // Clamped so a bad value cannot turn the pacing limits back into a firehose.
    const values = {
      quietHoursEnabled: input.quietHoursEnabled,
      quietStart: input.quietStart,
      quietEnd: input.quietEnd,
      maxAlertsPerHour: clamp(input.maxAlertsPerHour ?? 4, 1, 60),
      minDelaySeconds: clamp(input.minDelaySeconds ?? 60, 0, 3600),
      maxAlertsPerDay: clamp(input.maxAlertsPerDay ?? 30, 1, 500),
    };

    await db
      .insert(notificationSettings)
      .values({ userId, ...values })
      .onConflictDoUpdate({
        target: notificationSettings.userId,
        set: { ...values, updatedAt: new Date() },
      });

    revalidatePath('/settings/whatsapp');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Pause or resume automatic WhatsApp alerts from the web UI. Mirrors the
 * WhatsApp "stop"/"start" commands and shares the same state.
 */
export async function setAutomationPausedAction(paused: boolean) {
  try {
    const session = await requireSession();
    const settings = await setAutomationPaused(session.user.id, paused, 'web');

    revalidatePath('/settings/whatsapp');
    revalidatePath('/dashboard');
    return { success: true, automationPaused: settings.automationPaused };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Live automation state for the settings screen. */
export async function getAutomationStatusAction() {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const [settings, queuedCount, sentLastHour, sentToday] = await Promise.all([
      getOrCreateNotificationSettings(userId),
      countQueuedAlerts(userId),
      countAlertsSentSince(userId, new Date(Date.now() - 60 * 60 * 1000)),
      countAlertsSentSince(userId, new Date(Date.now() - 24 * 60 * 60 * 1000)),
    ]);

    return { success: true, settings, queuedCount, sentLastHour, sentToday };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Server Action to dispatch a live test alert to WhatsApp (BUG-03, BUG-04, SEC-04)
 */
export async function sendTestWhatsAppAlertAction(): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const [config] = await db
      .select()
      .from(whatsappConfigs)
      .where(and(eq(whatsappConfigs.userId, userId), eq(whatsappConfigs.isActive, true)));

    if (!config) {
      throw new Error('No active WhatsApp configuration found. Configure your Meta API in Settings → WhatsApp.');
    }

    const [recipient] = await db
      .select()
      .from(whatsappRecipients)
      .where(
        and(
          eq(whatsappRecipients.configId, config.id),
          eq(whatsappRecipients.isVerified, true),
          eq(whatsappRecipients.isActive, true),
        ),
      );

    if (!recipient) {
      throw new Error('No active verified recipient found. Add a phone number in Settings → WhatsApp.');
    }

    const accessToken = decrypt(config.accessTokenEnc);
    const client = new WhatsAppClient({
      phoneNumberId: config.phoneNumberId,
      accessToken,
      version: config.graphApiVersion || 'v21.0',
    });

    const mockJob: NormalizedJob = {
      id: '2091965312266999140',
      title: 'Senior Full Stack & Database Engineer for Exam Testing Platform',
      description:
        'We need a senior developer to build an automated testing bank in Laravel with 100,000+ member questions and optimized reporting APIs.',
      url: 'https://www.upwork.com/jobs/2091965312266999140',
      jobType: 'fixed',
      hourlyMin: null,
      hourlyMax: null,
      budgetAmount: 450,
      currency: 'USD',
      skills: ['Laravel', 'PHP', 'MySQL', 'Database Architecture', 'REST API'],
      postedAt: new Date(Date.now() - 14 * 60 * 1000), // 14m ago
      proposalsCount: 6,
      client: {
        rating: 4.95,
        reviewsCount: 32,
        totalSpent: 45000,
        country: 'United States',
        city: 'Austin, TX',
        paymentVerified: true,
      },
      unmappedFields: [],
      rawPayload: {},
      normalizerVersion: 1,
    };

    // BUG-04: Strict MatchResult shape
    const mockMatch: MatchResult = {
      matched: true,
      score: 95,
      breakdown: {
        titleKeywords: 30,
        descKeywords: 15,
        skills: 20,
        budget: 15,
        clientQuality: 10,
        clientSpend: 5,
        freshness: 5,
        competition: 5,
      },
      matchedKeywords: ['laravel', 'php', 'mysql', 'rest api'],
      rejectedReason: null,
    };

    const text = formatJobAlertMessage(mockJob, mockMatch, 'Laravel Backend & APIs');
    const result = await client.sendText(recipient.phoneE164, text);

    logger.info({ wamid: result.wamid }, 'Dispatched live test WhatsApp alert.');
    // BUG-03: return result.wamid
    return { success: true, messageId: result.wamid };
  } catch (err: any) {
    logger.error({ err }, 'Failed to dispatch live WhatsApp alert.');
    return { success: false, error: err.message || 'WhatsApp delivery failed.' };
  }
}
