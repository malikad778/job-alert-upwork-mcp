'use server';

import { auth } from '../../lib/auth';
import { headers } from 'next/headers';
// eq/sql come from @job-radar/db, which re-exports them. apps/web does not
// depend on drizzle-orm directly.
import { db, users, jobs, proposalDrafts, eq, sql } from '@job-radar/db';
import { revalidatePath } from 'next/cache';

/** Roles this application recognises. Anything else is rejected. */
const ALLOWED_ROLES = ['user', 'admin'] as const;
type Role = (typeof ALLOWED_ROLES)[number];

/**
 * Authorises the caller as an admin.
 *
 * The role is re-read from the database rather than taken from the session.
 * Sessions are cookie-cached for 5 minutes, so a session-derived role lets a
 * just-demoted admin keep privileges until that cache expires.
 */
async function checkAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const [current] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!current) {
    throw new Error('Unauthorized');
  }

  if (current.role !== 'admin') {
    throw new Error('Forbidden: Admins only');
  }

  return current;
}

export async function getAdminStatsAction() {
  try {
    await checkAdmin();

    const [usersCountRes, jobsCountRes, proposalsCountRes] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(users),
      db.select({ count: sql<number>`count(*)` }).from(jobs),
      db.select({ count: sql<number>`count(*)` }).from(proposalDrafts),
    ]);

    return {
      success: true,
      data: {
        totalUsers: Number(usersCountRes[0].count),
        totalJobs: Number(jobsCountRes[0].count),
        totalProposals: Number(proposalsCountRes[0].count),
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getUsersListAction() {
  try {
    await checkAdmin();

    const allUsers = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
    }).from(users).orderBy(users.createdAt);

    return { success: true, data: allUsers };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateUserRoleAction(userId: string, newRole: string) {
  try {
    const adminUser = await checkAdmin();

    // Reject anything outside the known role set, so a crafted call cannot
    // write an arbitrary string into the column that gates authorisation.
    if (!ALLOWED_ROLES.includes(newRole as Role)) {
      return { success: false, error: `Invalid role. Expected one of: ${ALLOWED_ROLES.join(', ')}.` };
    }

    // Prevent self-demotion
    if (adminUser.id === userId && newRole !== 'admin') {
      return { success: false, error: 'You cannot demote yourself.' };
    }

    // Never let the last admin be demoted - that would lock everyone out.
    if (newRole !== 'admin') {
      const [{ count: adminCount }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.role, 'admin'));

      if (Number(adminCount) <= 1) {
        return { success: false, error: 'Cannot demote the last remaining admin.' };
      }
    }

    await db.update(users).set({ role: newRole, updatedAt: new Date() }).where(eq(users.id, userId));
    revalidatePath('/admin');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteUserAction(userId: string) {
  try {
    const adminUser = await checkAdmin();
    
    // Prevent self-deletion
    if (adminUser.id === userId) {
      return { success: false, error: 'You cannot delete yourself.' };
    }

    await db.delete(users).where(eq(users.id, userId));
    revalidatePath('/admin');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
