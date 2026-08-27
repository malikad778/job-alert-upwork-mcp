import 'dotenv/config';
import { db, users } from '@job-radar/db';
import { eq } from 'drizzle-orm';

async function main() {
  const email = 'adnan@jobradar.io';
  console.log(`Setting role of ${email} to admin...`);

  try {
    const res = await db.update(users).set({ role: 'admin' }).where(eq(users.email, email)).returning();
    if (res.length > 0) {
      console.log(`Successfully updated ${email} to admin.`);
    } else {
      console.log(`User ${email} not found. Please login at least once to create the account, then run this script again.`);
    }
  } catch (err) {
    console.error('Failed to update admin role:', err);
  }
  process.exit(0);
}

main();
