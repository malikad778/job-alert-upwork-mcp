import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { requireSession, isRedirectError } from '../../../../lib/require-session';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const origin =
      process.env.BETTER_AUTH_URL ||
      (req.headers.get('x-forwarded-proto')
        ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
        : req.nextUrl.origin);

    const clientId =
      process.env.UPWORK_CLIENT_ID ||
      `${origin}/client-metadata.json`;

    const redirectUri =
      process.env.UPWORK_OAUTH_REDIRECT_URI ||
      `${origin}/api/upwork/callback`;

    // Generate PKCE code verifier and challenge
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(16).toString('hex');

    const authUrl = new URL('https://www.upwork.com/ab/account-security/oauth2/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'all');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    const response = NextResponse.redirect(authUrl.toString());

    // Save PKCE state and verifier in signed/secure cookies
    response.cookies.set('upwork_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
    });

    response.cookies.set('upwork_oauth_verifier', verifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10,
    });

    return response;
  } catch (err: any) {
    // requireSession() redirects by throwing; let that reach the framework
    // instead of reporting it as an authorization failure.
    if (isRedirectError(err)) throw err;

    const origin =
      process.env.BETTER_AUTH_URL ||
      (req.headers.get('x-forwarded-proto')
        ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
        : req.nextUrl.origin);

    if (err?.message?.includes('Unauthorized') || err?.status === 401) {
      return NextResponse.redirect(new URL('/login', origin));
    }
    return NextResponse.redirect(
      new URL(`/settings/upwork?error=${encodeURIComponent(err.message || 'Authorization initialization failed')}`, origin),
    );
  }
}
