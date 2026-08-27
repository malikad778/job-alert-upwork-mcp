import { and, eq, sql } from 'drizzle-orm';
import { db } from './client';
import { platformSettings, upworkUsageDaily } from './schema/index';

export type PlatformSettings = typeof platformSettings.$inferSelect;

/** Thrown whenever something tries to reach Upwork while it is not permitted. */
export class UpworkBlockedError extends Error {
  readonly code: 'POLLING_DISABLED' | 'DAILY_LIMIT_REACHED';

  constructor(code: 'POLLING_DISABLED' | 'DAILY_LIMIT_REACHED', message: string) {
    super(message);
    this.name = 'UpworkBlockedError';
    this.code = code;
  }
}

/** Loads the singleton settings row, creating it (polling off) on first access. */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const [existing] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.id, 'global'));

  if (existing) return existing;

  const [created] = await db
    .insert(platformSettings)
    .values({ id: 'global' })
    .onConflictDoUpdate({
      target: platformSettings.id,
      set: { updatedAt: new Date() },
    })
    .returning();

  return created!;
}

export async function updatePlatformSettings(
  patch: Partial<Omit<PlatformSettings, 'id' | 'updatedAt'>>,
  updatedBy: string,
): Promise<PlatformSettings> {
  await getPlatformSettings();

  const [updated] = await db
    .update(platformSettings)
    .set({ ...patch, updatedBy, updatedAt: new Date() })
    .where(eq(platformSettings.id, 'global'))
    .returning();

  return updated!;
}

/** Current UTC day key, matching how the usage table is bucketed. */
function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function getUpworkUsageToday(orgUid: string): Promise<number> {
  const [row] = await db
    .select({ callCount: upworkUsageDaily.callCount })
    .from(upworkUsageDaily)
    .where(and(eq(upworkUsageDaily.day, utcDay()), eq(upworkUsageDaily.orgUid, orgUid)));

  return row?.callCount ?? 0;
}

/** Records Upwork tool calls against an identity's daily budget. */
export async function recordUpworkCalls(orgUid: string, count = 1): Promise<number> {
  const [row] = await db
    .insert(upworkUsageDaily)
    .values({ day: utcDay(), orgUid, callCount: count, lastCallAt: new Date() })
    .onConflictDoUpdate({
      target: [upworkUsageDaily.day, upworkUsageDaily.orgUid],
      set: {
        callCount: sql`${upworkUsageDaily.callCount} + ${count}`,
        lastCallAt: new Date(),
      },
    })
    .returning({ callCount: upworkUsageDaily.callCount });

  return row?.callCount ?? count;
}

/**
 * The single gate every Upwork code path must pass through.
 *
 * Throws when polling is switched off, or when the identity has exhausted its
 * daily call budget. Callers should let this propagate rather than swallowing
 * it, so a blocked state is visible instead of silently looking like "no jobs".
 */
export async function assertUpworkAllowed(orgUid?: string | null): Promise<PlatformSettings> {
  const settings = await getPlatformSettings();

  if (!settings.upworkPollingEnabled) {
    throw new UpworkBlockedError(
      'POLLING_DISABLED',
      settings.upworkDisabledReason
        ? `Upwork access is disabled: ${settings.upworkDisabledReason}`
        : 'Upwork access is disabled by an administrator.',
    );
  }

  if (orgUid) {
    const used = await getUpworkUsageToday(orgUid);
    if (used >= settings.maxToolCallsPerDay) {
      throw new UpworkBlockedError(
        'DAILY_LIMIT_REACHED',
        `Daily Upwork call limit reached for this account (${used}/${settings.maxToolCallsPerDay}). Polling resumes tomorrow (UTC).`,
      );
    }
  }

  return settings;
}

/** Non-throwing variant for UI surfaces that just need the current state. */
export async function getUpworkGuardStatus(orgUid?: string | null) {
  const settings = await getPlatformSettings();
  const usedToday = orgUid ? await getUpworkUsageToday(orgUid) : 0;

  return {
    settings,
    usedToday,
    remainingToday: Math.max(0, settings.maxToolCallsPerDay - usedToday),
    blocked: !settings.upworkPollingEnabled || usedToday >= settings.maxToolCallsPerDay,
  };
}
