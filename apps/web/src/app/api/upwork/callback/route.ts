import { NextRequest, NextResponse } from 'next/server';
import { db, upworkConnections, eq } from '@job-radar/db';
import { exchangeUpworkCode, encryptTokens, UpworkMcpClient } from '@job-radar/core/upwork';
import { requireSession, isRedirectError } from '../../../../lib/require-session';
import { logger } from '@job-radar/core/logger';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      logger.error({ error }, 'Upwork OAuth returned error.');
      return NextResponse.redirect(
        new URL(`/settings/upwork?error=${encodeURIComponent(error)}`, req.nextUrl.origin),
      );
    }

    const savedState = req.cookies.get('upwork_oauth_state')?.value;
    const codeVerifier = req.cookies.get('upwork_oauth_verifier')?.value;

    if (!state || state !== savedState || !code || !codeVerifier) {
      logger.warn('Upwork OAuth state or verifier mismatch.');
      return NextResponse.redirect(
        new URL('/settings/upwork?error=oauth_state_invalid', req.nextUrl.origin),
      );
    }

    const origin =
      process.env.BETTER_AUTH_URL ||
      (req.headers.get('x-forwarded-proto')
        ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
        : req.nextUrl.origin);

    const clientId =
      process.env.UPWORK_CLIENT_ID ||
      `${origin}/client-metadata.json`;

    const clientSecret = process.env.UPWORK_CLIENT_SECRET || null;
    const redirectUri =
      process.env.UPWORK_OAUTH_REDIRECT_URI ||
      `${origin}/api/upwork/callback`;

    // 1. Exchange authorization code for tokens
    const tokens = await exchangeUpworkCode({
      code,
      codeVerifier,
      clientId,
      clientSecret,
      redirectUri,
    });

    const { accessTokenEnc, refreshTokenEnc } = encryptTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });

    // 2. Resolve org_uid using the new access token
    let orgUid: string | null = null;
    let accountName: string | null = null;
    let accountRole: string | null = null;

    try {
      const upworkTemp = new UpworkMcpClient({ accessToken: tokens.accessToken });
      const resolved = await upworkTemp.resolveOrgUid();
      orgUid = resolved.orgUid;
      accountName = resolved.accountName;
      accountRole = resolved.role;
    } catch (e) {
      logger.warn({ err: e }, 'Could not resolve org_uid immediately during OAuth callback.');
    }

    // 3. Upsert connection in database
    const [existing] = await db
      .select()
      .from(upworkConnections)
      .where(eq(upworkConnections.userId, userId));

    if (existing) {
      await db
        .update(upworkConnections)
        .set({
          accessTokenEnc,
          refreshTokenEnc,
          clientId,
          expiresAt: tokens.expiresAt,
          orgUid,
          accountName,
          accountRole,
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
        clientId,
        expiresAt: tokens.expiresAt,
        orgUid,
        accountName,
        accountRole,
        isActive: true,
      });
    }

    const response = NextResponse.redirect(
      new URL('/settings/upwork?connected=true', req.nextUrl.origin),
    );

    // Clean up cookies
    response.cookies.delete('upwork_oauth_state');
    response.cookies.delete('upwork_oauth_verifier');

    return response;
  } catch (err: any) {
    // requireSession() redirects by throwing - do not report it as an OAuth failure.
    if (isRedirectError(err)) throw err;

    logger.error({ err }, 'Error handling Upwork OAuth callback.');
    return NextResponse.redirect(
      new URL(
        `/settings/upwork?error=${encodeURIComponent(err.message || 'OAuth failed')}`,
        req.nextUrl.origin,
      ),
    );
  }
}
