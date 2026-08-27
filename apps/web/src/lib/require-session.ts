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
