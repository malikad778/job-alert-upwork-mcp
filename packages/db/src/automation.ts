import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db } from './client';
import { jobAlerts, notificationSettings, searchProfiles, users } from './schema/index';

export type NotificationSettings = typeof notificationSettings.$inferSelect;

/**
 * Loads a user's notification settings, creating the row on first access.
 *
 * Every caller must go through this. The pause/resume commands used to issue a
 * bare UPDATE against a row that had never been created, which silently
 * matched zero rows and made "stop" a no-op.
 */
export async function getOrCreateNotificationSettings(userId: string): Promise<NotificationSettings> {
  const [existing] = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId));

  if (existing) return existing;

  const [created] = await db
    .insert(notificationSettings)
    .values({ userId })
    .onConflictDoUpdate({
      target: notificationSettings.userId,
      // A no-op update so the INSERT ... RETURNING always yields the row even
      // when a concurrent poll cycle created it first.
      set: { updatedAt: new Date() },
    })
    .returning();

  return created!;
}

/**
 * Flips automation on or off for exactly one user.
 *
 * `searchProfiles.automationEnabled` is kept in sync so the poller stops
 * queueing new alerts, while alerts already queued are preserved.
 */
export async function setAutomationPaused(
  userId: string,
  paused: boolean,
  via: 'whatsapp' | 'web',
): Promise<NotificationSettings> {
  await getOrCreateNotificationSettings(userId);

  const [updated] = await db
    .update(notificationSettings)
    .set({
      automationPaused: paused,
      pausedAt: paused ? new Date() : null,
      pausedVia: paused ? via : null,
      updatedAt: new Date(),
    })
    .where(eq(notificationSettings.userId, userId))
    .returning();

  await db
    .update(searchProfiles)
    .set({ automationEnabled: !paused, updatedAt: new Date() })
    .where(eq(searchProfiles.userId, userId));

  if (!paused) {
    // The dispatcher parks alerts when throttled. Resuming must clear those
    // holds, otherwise the queue stays frozen until each park expires.
    await db
      .update(jobAlerts)
      .set({ parkedUntil: null, claimedAt: null, claimedBy: null })
      .where(and(eq(jobAlerts.userId, userId), eq(jobAlerts.status, 'queued')));
  }

  return updated!;
}

/** Number of alerts actually sent to this user within the trailing window. */
export async function countAlertsSentSince(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(jobAlerts)
    .where(
      and(
        eq(jobAlerts.userId, userId),
        eq(jobAlerts.status, 'sent'),
        gte(jobAlerts.sentAt, since),
      ),
    );

  return Number(row?.value ?? 0);
}

/** Timestamp of the most recent alert sent to this user, if any. */
export async function getLastAlertSentAt(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ sentAt: sql<Date | null>`max(${jobAlerts.sentAt})` })
    .from(jobAlerts)
    .where(and(eq(jobAlerts.userId, userId), eq(jobAlerts.status, 'sent')));

  return row?.sentAt ? new Date(row.sentAt) : null;
}

/** How many alerts are waiting in the queue for this user. */
export async function countQueuedAlerts(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(jobAlerts)
    .where(and(eq(jobAlerts.userId, userId), eq(jobAlerts.status, 'queued')));

  return Number(row?.value ?? 0);
}

/** IANA timezone for the user, defaulting to UTC. */
export async function getUserTimezone(userId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));

  return row?.timezone || 'UTC';
}
