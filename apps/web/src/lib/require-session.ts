import { auth } from './auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function getSession() {
  const reqHeaders = await headers();
  return auth.api.getSession({ headers: reqHeaders });
}

export async function requireSession() {
  const session = await getSession();
  if (!session || !session.user) {
    redirect('/login');
  }
  return session;
}

/**
 * True when an error is Next's internal redirect signal.
 *
 * next/navigation's redirect() works by throwing. Any `catch` around
 * requireSession() will therefore swallow the redirect and turn a normal
 * "send this user to /login" into a failure - which is how the Upwork
 * authorize route ended up redirecting to /settings/upwork?error=NEXT_REDIRECT.
 * Route handlers must re-throw these so the framework can act on them.
 */
export function isRedirectError(err: unknown): boolean {
  const digest = (err as { digest?: unknown })?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}
