import { NextRequest, NextResponse } from 'next/server';
import { db, upworkConnections, eq } from '@job-radar/db';
import { UpworkMcpClient, decryptTokens } from '@job-radar/core/upwork';
import { getSession } from '../../../../lib/require-session';
import { logger } from '@job-radar/core/logger';

async function resolveToken(req: NextRequest, bodyToken?: string): Promise<{ accessToken: string; orgUid?: string }> {
  // 1. Check direct token in body/query
  if (bodyToken && bodyToken.trim()) {
    return { accessToken: bodyToken.trim() };
  }

  // 2. Check Authorization or x-upwork-token header
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.substring(7).trim();
    if (bearer) return { accessToken: bearer };
  }

  const customToken = req.headers.get('x-upwork-token');
  if (customToken && customToken.trim()) {
    return { accessToken: customToken.trim() };
  }

  // 3. Fallback: Authenticated session in database
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
    const query = searchParams.get('query') || searchParams.get('q');
    const sort = searchParams.get('sort') || 'recency';
    const cursor = searchParams.get('cursor') || undefined;
    const paramOrgUid = searchParams.get('orgUid') || undefined;
    const paramToken = searchParams.get('token') || searchParams.get('accessToken') || undefined;

    if (!query) {
      return NextResponse.json({ error: "Missing required 'query' search parameter" }, { status: 400 });
    }

    const { accessToken, orgUid: resolvedOrgUid } = await resolveToken(req, paramToken);
    const client = new UpworkMcpClient({ accessToken });

    let orgUid = paramOrgUid || resolvedOrgUid;
    if (!orgUid) {
      const res = await client.resolveOrgUid();
      orgUid = res.orgUid || '';
    }

    const result = await client.findJobs({
      query,
      orgUid: orgUid || '',
      sort,
      cursor,
    });

    return NextResponse.json({
      success: true,
      query,
      count: result.jobs.length,
      nextCursor: result.nextCursor,
      hasNextPage: result.hasNextPage,
      jobs: result.jobs,
    });
  } catch (err: any) {
    logger.error({ err }, 'Error in /api/upwork/search GET');
    const status = err.message?.includes('No Upwork credentials') ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = body.query || body.q;
    const sort = body.sort || 'recency';
    const cursor = body.cursor || undefined;
    const paramOrgUid = body.orgUid || undefined;
    const paramToken = body.accessToken || body.token || undefined;

    if (!query) {
      return NextResponse.json({ error: "Missing required 'query' in request body" }, { status: 400 });
    }

    const { accessToken, orgUid: resolvedOrgUid } = await resolveToken(req, paramToken);
    const client = new UpworkMcpClient({ accessToken });

    let orgUid = paramOrgUid || resolvedOrgUid;
    if (!orgUid) {
      const res = await client.resolveOrgUid();
      orgUid = res.orgUid || '';
    }

    const result = await client.findJobs({
      query,
      orgUid: orgUid || '',
      sort,
      cursor,
    });

    return NextResponse.json({
      success: true,
      query,
      count: result.jobs.length,
      nextCursor: result.nextCursor,
      hasNextPage: result.hasNextPage,
      jobs: result.jobs,
    });
  } catch (err: any) {
    logger.error({ err }, 'Error in /api/upwork/search POST');
    const status = err.message?.includes('No Upwork credentials') ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
