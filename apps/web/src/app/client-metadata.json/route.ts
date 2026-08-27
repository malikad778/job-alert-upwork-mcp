import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // Use current request origin or configured site URL
  const origin =
    process.env.BETTER_AUTH_URL ||
    (req.headers.get('x-forwarded-proto')
      ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
      : req.nextUrl.origin);

  const metadata = {
    client_id: `${origin}/client-metadata.json`,
    client_name: 'Upwork MCP',
    client_uri: origin,
    redirect_uris: [`${origin}/api/upwork/callback`],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };

  return NextResponse.json(metadata, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
