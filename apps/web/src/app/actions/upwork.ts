'use server';

import { db, upworkConnections, upworkProfileSnapshots, getUpworkGuardStatus, eq, and, desc } from '@job-radar/db';
import { requireSession } from '../../lib/require-session';
import { syncUpworkProfile } from '@job-radar/jobs';
import { revalidatePath } from 'next/cache';
import { encrypt } from '@job-radar/core/crypto';

/**
 * Get current Upwork connection status and snapshot info
 */
export async function getUpworkStatusAction() {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const [conn] = await db
      .select()
      .from(upworkConnections)
      .where(eq(upworkConnections.userId, userId));

    const [snapshot] = await db
      .select()
      .from(upworkProfileSnapshots)
      .where(eq(upworkProfileSnapshots.userId, userId))
      .orderBy(desc(upworkProfileSnapshots.fetchedAt))
      .limit(1);

    return {
      success: true,
      connection: conn
        ? {
            id: conn.id,
            clientId: conn.clientId,
            accountName: conn.accountName,
            accountRole: conn.accountRole,
            orgUid: conn.orgUid,
            expiresAt: conn.expiresAt,
            isActive: conn.isActive,
            consecutiveFailures: conn.consecutiveFailures,
            lastRefreshedAt: conn.lastRefreshedAt,
            lastErrorAt: conn.lastErrorAt,
            lastErrorMessage: conn.lastErrorMessage,
          }
        : null,
      snapshot: snapshot
        ? {
            id: snapshot.id,
            title: snapshot.title,
            hourlyRate: snapshot.hourlyRate,
            connectsBalance: snapshot.connectsBalance,
            jobSuccessScore: snapshot.jobSuccessScore,
            skills: snapshot.skills,
            fetchedAt: snapshot.fetchedAt,
          }
        : null,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Disconnect Upwork account
 */
export async function disconnectUpworkAction() {
  try {
    const session = await requireSession();
    await db
      .delete(upworkConnections)
      .where(eq(upworkConnections.userId, session.user.id));

    revalidatePath('/settings/upwork');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Trigger manual profile sync from Upwork MCP
 */
export async function syncUpworkProfileAction() {
  try {
    const session = await requireSession();
    const result = await syncUpworkProfile(session.user.id);
    revalidatePath('/settings/upwork');
    return result;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Save Upwork Client ID and Secret
 */
export async function saveUpworkConfigAction(clientId: string, clientSecret?: string) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const [existing] = await db
      .select()
      .from(upworkConnections)
      .where(eq(upworkConnections.userId, userId));

    const clientSecretEnc = clientSecret ? encrypt(clientSecret) : existing?.clientSecretEnc || null;

    if (existing) {
      await db
        .update(upworkConnections)
        .set({
          clientId,
          clientSecretEnc,
          updatedAt: new Date(),
        })
        .where(eq(upworkConnections.id, existing.id));
    } else {
      await db.insert(upworkConnections).values({
        userId,
        accessTokenEnc: 'PENDING_AUTH',
        clientId,
        clientSecretEnc,
        expiresAt: new Date(),
        isActive: false,
      });
    }

    revalidatePath('/settings/upwork');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Connect with direct Access Token and Refresh Token (e.g. from local MCP CLI or manual auth)
 */
export async function connectWithDirectTokensAction(params: {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    // Verifying a token calls Upwork, so it goes through the same gate as
    // everything else.
    const guard = await getUpworkGuardStatus();
    if (guard.blocked) {
      return {
        success: false,
        error:
          guard.settings.upworkDisabledReason ||
          'Upwork access is disabled by an administrator. Enable it under Admin → Upwork Integration first.',
      };
    }

    // Verify token by calling Upwork MCP resolveOrgUid
    const { UpworkMcpClient, encryptTokens } = await import('@job-radar/core/upwork');
    const mcpClient = new UpworkMcpClient({ accessToken: params.accessToken.trim() });
    const resolved = await mcpClient.resolveOrgUid();

    const { accessTokenEnc, refreshTokenEnc } = encryptTokens({
      accessToken: params.accessToken.trim(),
      refreshToken: params.refreshToken?.trim() || null,
    });

    const clientSecretEnc = params.clientSecret ? encrypt(params.clientSecret.trim()) : null;

    const [existing] = await db
      .select()
      .from(upworkConnections)
      .where(eq(upworkConnections.userId, userId));

    const expiresAt = new Date(Date.now() + 86400 * 1000); // 24h

    if (existing) {
      await db
        .update(upworkConnections)
        .set({
          accessTokenEnc,
          refreshTokenEnc,
          clientId: params.clientId?.trim() || existing.clientId || null,
          clientSecretEnc,
          orgUid: resolved.orgUid,
          accountName: resolved.accountName,
          accountRole: resolved.role,
          expiresAt,
          isActive: true,
          consecutiveFailures: 0,
          lastRefreshedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(upworkConnections.id, existing.id));
    } else {
      await db.insert(upworkConnections).values({
        userId,
        accessTokenEnc,
        refreshTokenEnc,
        clientId: params.clientId?.trim() || null,
        clientSecretEnc,
        orgUid: resolved.orgUid,
        accountName: resolved.accountName,
        accountRole: resolved.role,
        expiresAt,
        isActive: true,
      });
    }

    revalidatePath('/settings/upwork');
    return { success: true, accountName: resolved.accountName, orgUid: resolved.orgUid };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to verify token with Upwork MCP server' };
  }
}


