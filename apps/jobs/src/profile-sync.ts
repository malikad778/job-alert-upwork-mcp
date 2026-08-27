import { db, upworkProfileSnapshots, upworkConnections, eq } from '@job-radar/db';
import { UpworkMcpClient, decryptTokens } from '@job-radar/core/upwork';
import { logger } from '@job-radar/core/logger';

export async function syncUpworkProfile(
  userId: string,
  upworkClient?: UpworkMcpClient,
  orgUidParam?: string,
): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
  try {
    let client = upworkClient;
    let orgUid = orgUidParam;

    if (!client || !orgUid) {
      const [connection] = await db
        .select()
        .from(upworkConnections)
        .where(eq(upworkConnections.userId, userId));

      if (!connection || !connection.isActive) {
        throw new Error('No active Upwork connection found for profile sync.');
      }

      const { accessToken } = decryptTokens(connection);
      orgUid = connection.orgUid || undefined;

      if (!orgUid) {
        throw new Error('Upwork org_uid is not resolved.');
      }

      client = new UpworkMcpClient({ accessToken, orgUid });
    }

    logger.info({ userId, orgUid }, 'Starting Upwork profile snapshot sync (§12.2)...');

    // 1. Fetch main profile
    const profileBlocks = await client.callTool('upwork__get_profile', {
      action: 'get',
      org_uid: orgUid,
    });

    let profileData: any = {};
    for (const b of profileBlocks) {
      const p = (b as any)?.profile || (b as any)?.freelancer || b;
      if (p && typeof p === 'object') {
        profileData = { ...profileData, ...p };
      }
    }

    // 2. Fetch connects balance if available
    let connectsBalance: number | undefined;
    try {
      const connectsBlocks = await client.callTool('upwork__get_profile', {
        action: 'connects_balance',
        org_uid: orgUid,
      });
      for (const b of connectsBlocks) {
        const balance = (b as any)?.balance || (b as any)?.connects;
        if (typeof balance === 'number') connectsBalance = balance;
      }
    } catch {
      // Connects balance optional
    }

    // 3. Save snapshot to database
    const [snapshot] = await db
      .insert(upworkProfileSnapshots)
      .values({
        userId,
        title: profileData.title || profileData.occupation || null,
        overview: profileData.overview || profileData.description || null,
        hourlyRate: profileData.hourlyRate ? String(profileData.hourlyRate) : null,
        currency: profileData.currency || 'USD',
        skills: Array.isArray(profileData.skills) ? profileData.skills : [],
        totalEarnings: profileData.totalEarnings ? String(profileData.totalEarnings) : null,
        jobSuccessScore: profileData.jobSuccessScore ? String(profileData.jobSuccessScore) : null,
        totalHours: profileData.totalHours || null,
        connectsBalance: connectsBalance ?? profileData.connectsBalance ?? null,
        languages: profileData.languages || null,
        portfolio: profileData.portfolio || null,
        workHistory: profileData.workHistory || null,
        rawPayload: profileData,
        fetchedAt: new Date(),
      })
      .returning();

    logger.info({ userId, snapshotId: snapshot?.id }, 'Successfully synced Upwork profile snapshot.');
    return { success: true, snapshotId: snapshot?.id };
  } catch (err: any) {
    logger.error({ err, userId }, 'Failed to sync Upwork profile snapshot.');
    return { success: false, error: err.message };
  }
}
