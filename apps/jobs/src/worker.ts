import { db, upworkConnections, users, eq, and } from '@job-radar/db';
import { runJobPoll } from './poll.ts';
import { logger } from '@job-radar/core/logger';
import { dispatchQueuedAlerts, releaseExpiredAlertLeases } from './alert-dispatcher.ts';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes
let pollInProgress = false;

async function pollAllUsers() {
  if (pollInProgress) {
    logger.warn('Skipping poll cycle because the previous cycle is still running.');
    return;
  }
  pollInProgress = true;
  try {
    logger.info('Running 5-minute automated Upwork MCP poller loop...');

    // Load all active Upwork connections
    const activeConnections = await db
      .select({
        userId: upworkConnections.userId,
        accountName: upworkConnections.accountName,
      })
      .from(upworkConnections)
      .where(eq(upworkConnections.isActive, true));

    logger.info({ count: activeConnections.length }, 'Active accounts to poll.');

    await Promise.all(activeConnections.map(async (conn) => {
      try {
        logger.info({ userId: conn.userId, account: conn.accountName }, 'Polling jobs for user...');
        const result = await runJobPoll({ userId: conn.userId, triggerType: 'scheduled' });
        logger.info({ userId: conn.userId, result }, 'Completed user poll cycle.');
      } catch (userErr) {
        logger.error({ err: userErr, userId: conn.userId }, 'Error polling jobs for user.');
      }
    }));
    await releaseExpiredAlertLeases();
    await dispatchQueuedAlerts(`worker-${process.pid}`, 25);
  } catch (err) {
    logger.error({ err }, 'Error in global poller worker loop.');
  } finally {
    pollInProgress = false;
  }
}

async function startWorker() {
  logger.info('🚀 Upwork MCP 5-Minute Background Worker Daemon Started.');

  // Run immediate first cycle
  await pollAllUsers();

  // Schedule every 5 minutes
  setInterval(() => void pollAllUsers(), POLL_INTERVAL_MS);
}

startWorker().catch((err) => {
  logger.error({ err }, 'Fatal error in worker daemon.');
  process.exit(1);
});
