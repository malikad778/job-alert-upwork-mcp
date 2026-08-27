import { db, upworkConnections, eq, getPlatformSettings } from '@job-radar/db';
import { runJobPoll } from './poll.ts';
import { logger } from '@job-radar/core/logger';
import { dispatchQueuedAlerts, releaseExpiredAlertLeases } from './alert-dispatcher.ts';

let pollInProgress = false;
/** Interval currently scheduled, so we only re-arm the timer when it changes. */
let scheduledIntervalMinutes: number | null = null;
let timer: NodeJS.Timeout | null = null;

async function pollAllUsers() {
  if (pollInProgress) {
    logger.warn('Skipping poll cycle because the previous cycle is still running.');
    return;
  }
  pollInProgress = true;

  try {
    const settings = await getPlatformSettings();

    if (!settings.upworkPollingEnabled) {
      logger.info(
        { reason: settings.upworkDisabledReason ?? 'disabled by administrator' },
        'Upwork polling is disabled; skipping cycle.',
      );
      // Alerts already queued are still delivered - that traffic goes to
      // WhatsApp, not Upwork.
      await releaseExpiredAlertLeases();
      await dispatchQueuedAlerts(`worker-${process.pid}`, 25);
      return;
    }

    const activeConnections = await db
      .select({
        userId: upworkConnections.userId,
        orgUid: upworkConnections.orgUid,
        accountName: upworkConnections.accountName,
      })
      .from(upworkConnections)
      .where(eq(upworkConnections.isActive, true));

    /*
     * One poll per Upwork identity, not per application account.
     *
     * Several accounts can share a single Upwork token/org_uid. Polling them
     * all concurrently made Upwork see one identity issuing parallel automated
     * requests, which is what triggered the abuse restriction. Connections
     * without a resolved org_uid keep their own slot so first-time setup still
     * works.
     */
    const byIdentity = new Map<string, (typeof activeConnections)[number]>();
    for (const conn of activeConnections) {
      const key = conn.orgUid ?? `user:${conn.userId}`;
      if (!byIdentity.has(key)) byIdentity.set(key, conn);
    }

    const skipped = activeConnections.length - byIdentity.size;
    logger.info(
      { identities: byIdentity.size, connections: activeConnections.length, skipped },
      'Starting poll cycle.',
    );

    // Sequential, not Promise.all: concurrent cycles produced request bursts.
    for (const conn of byIdentity.values()) {
      try {
        const result = await runJobPoll({ userId: conn.userId, triggerType: 'scheduled' });
        logger.info({ userId: conn.userId, orgUid: conn.orgUid, result }, 'Completed user poll cycle.');
      } catch (userErr) {
        logger.error({ err: userErr, userId: conn.userId }, 'Error polling jobs for user.');
      }
    }

    await releaseExpiredAlertLeases();
    await dispatchQueuedAlerts(`worker-${process.pid}`, 25);
  } catch (err) {
    logger.error({ err }, 'Error in global poller worker loop.');
  } finally {
    pollInProgress = false;
  }
}

/**
 * Re-arms the timer whenever the configured interval changes, so an admin can
 * slow polling down from the UI without restarting the process.
 */
async function reschedule() {
  const settings = await getPlatformSettings();
  const minutes = Math.max(1, settings.pollIntervalMinutes);

  if (minutes === scheduledIntervalMinutes) return;

  if (timer) clearInterval(timer);
  scheduledIntervalMinutes = minutes;
  timer = setInterval(() => void tick(), minutes * 60 * 1000);

  logger.info({ intervalMinutes: minutes }, 'Poll interval scheduled.');
}

async function tick() {
  await pollAllUsers();
  await reschedule();
}

async function startWorker() {
  const settings = await getPlatformSettings();
  logger.info(
    {
      pollingEnabled: settings.upworkPollingEnabled,
      intervalMinutes: settings.pollIntervalMinutes,
      maxPagesPerProfile: settings.maxPagesPerProfile,
      maxToolCallsPerDay: settings.maxToolCallsPerDay,
    },
    'Upwork MCP background worker started.',
  );

  await tick();
}

startWorker().catch((err) => {
  logger.error({ err }, 'Fatal error in worker daemon.');
  process.exit(1);
});
