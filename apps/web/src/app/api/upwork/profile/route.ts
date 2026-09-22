import { NextRequest, NextResponse } from 'next/server';
import { db, upworkConnections, eq } from '@job-radar/db';
import { UpworkMcpClient, decryptTokens } from '@job-radar/core/upwork';
import { getSession } from '../../../../lib/require-session';
import { logger } from '@job-radar/core/logger';

async function resolveToken(req: NextRequest, bodyToken?: string): Promise<{ accessToken: string; orgUid?: string }> {
  if (bodyToken && bodyToken.trim()) {
    return { accessToken: bodyToken.trim() };
  }

  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.substring(7).trim();
    if (bearer) return { accessToken: bearer };
  }

  const customToken = req.headers.get('x-upwork-token');
  if (customToken && customToken.trim()) {
    return { accessToken: customToken.trim() };
  }

  const session = await getSession();
  if (session?.user?.id) {
    const [conn] = await db
      .select()
      .from(upworkConnections)
      .where(eq(upworkConnections.userId, session.user.id));

    if (conn && conn.isActive) {
      const { accessToken } = decryptTokens({
        accessTokenEnc: conn.accessTokenEnc,
        refreshTokenEnc: conn.refreshTokenEnc,
      });
      return { accessToken, orgUid: conn.orgUid || undefined };
    }
  }

  throw new Error(
    'No Upwork credentials provided. Pass an access token via Authorization: Bearer <token>, x-upwork-token header, or log in to use your connected account.'
  );
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const paramOrgUid = searchParams.get('orgUid') || undefined;
    const paramToken = searchParams.get('token') || searchParams.get('accessToken') || undefined;

    const { accessToken, orgUid: resolvedOrgUid } = await resolveToken(req, paramToken);
    const client = new UpworkMcpClient({ accessToken });

    let orgUid = paramOrgUid || resolvedOrgUid;
    let accountName: string | null = null;
    let role: string | null = null;

    if (!orgUid) {
      const res = await client.resolveOrgUid();
      orgUid = res.orgUid || '';
      accountName = res.accountName;
      role = res.role;
    }

    const profileBlocks = await client.callTool('upwork__get_profile', {
      action: 'get',
      org_uid: orgUid || '',
    });

    let connectsBalance: number | null = null;
    try {
      const connectsBlocks = await client.callTool('upwork__get_profile', {
        action: 'connects_balance',
        org_uid: orgUid || '',
      });
      for (const b of connectsBlocks) {
        const bal = (b as any)?.balance || (b as any)?.connects;
        if (typeof bal === 'number') connectsBalance = bal;
      }
    } catch {}

    return NextResponse.json({
      success: true,
      orgUid,
      accountName,
      role,
      connectsBalance,
      profile: profileBlocks,
    });
  } catch (err: any) {
    logger.error({ err }, 'Error in /api/upwork/profile GET');
    const status = err.message?.includes('No Upwork credentials') ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const paramOrgUid = body.orgUid || undefined;
    const paramToken = body.accessToken || body.token || undefined;

    const { accessToken, orgUid: resolvedOrgUid } = await resolveToken(req, paramToken);
    const client = new UpworkMcpClient({ accessToken });

    let orgUid = paramOrgUid || resolvedOrgUid;
    let accountName: string | null = null;
    let role: string | null = null;

    if (!orgUid) {
      const res = await client.resolveOrgUid();
      orgUid = res.orgUid || '';
      accountName = res.accountName;
      role = res.role;
    }

    const profileBlocks = await client.callTool('upwork__get_profile', {
      action: 'get',
      org_uid: orgUid || '',
    });

    let connectsBalance: number | null = null;
    try {
      const connectsBlocks = await client.callTool('upwork__get_profile', {
        action: 'connects_balance',
        org_uid: orgUid || '',
      });
      for (const b of connectsBlocks) {
        const bal = (b as any)?.balance || (b as any)?.connects;
        if (typeof bal === 'number') connectsBalance = bal;
      }
    } catch {}

    return NextResponse.json({
      success: true,
      orgUid,
      accountName,
      role,
      connectsBalance,
      profile: profileBlocks,
    });
  } catch (err: any) {
    logger.error({ err }, 'Error in /api/upwork/profile POST');
    const status = err.message?.includes('No Upwork credentials') ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
