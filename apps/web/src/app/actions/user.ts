'use server';

import { auth } from '../../lib/auth';
import { headers } from 'next/headers';
import { db, users, eq } from '@job-radar/db';
import { revalidatePath } from 'next/cache';

export async function updateProfileAction(data: { name?: string; timezone?: string; locale?: string }) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

    const updates: Partial<typeof users.$inferInsert> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.timezone !== undefined) updates.timezone = data.timezone;
    if (data.locale !== undefined) updates.locale = data.locale;

    if (Object.keys(updates).length > 0) {
      await db.update(users).set({
        ...updates,
        updatedAt: new Date(),
      }).where(eq(users.id, session.user.id));
    }

    revalidatePath('/settings/profile');
    return { success: true };
  } catch (err: any) {
    console.error('Failed to update profile:', err);
    return { success: false, error: err.message };
  }
}
