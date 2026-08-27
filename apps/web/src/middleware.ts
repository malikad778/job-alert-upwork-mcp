import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 0. Catch and clean any nested host/IP path segments (e.g. /13.234.31.69/.../login)
  const hostMatch = pathname.match(/^(?:\/+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})+(\/.*)?$/);
  if (hostMatch) {
    const cleanPath = hostMatch[1] || '/login';
    const cleanUrl = new URL(cleanPath, request.url);
    return NextResponse.redirect(cleanUrl, 301);
  }

  // 1. Completely bypass static assets, API routes, internal Next.js files, and media
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 2. Allow public routes - landing page + auth pages
  if (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password'
  ) {
    return NextResponse.next();
  }

  // 3. Check for Better Auth session token across all standard variations
  const cookies = request.cookies.getAll();
  const sessionToken = cookies.find(
    (c) =>
      c.name.toLowerCase().includes('session_token') ||
      c.name.toLowerCase().includes('session-token')
  );

  if (!sessionToken?.value) {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'upwork-mcp.site';
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const origin = process.env.BETTER_AUTH_URL || `${proto}://${host}`;
    const loginUrl = new URL('/login', origin);
    if (pathname !== '/' && pathname !== '/login') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
