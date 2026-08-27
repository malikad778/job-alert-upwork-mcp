import 'dotenv/config';
// Root scripts are run with tsx from the workspace root, which cannot resolve
// the '@job-radar/db' alias. Existing scripts import by relative path instead.
import { db, users, eq } from '../packages/db/src/index.js';

async function main() {
  // Accept the target on the command line so the script is not tied to one
  // hardcoded account: pnpm tsx scripts/set-admin.ts someone@example.com
  const email = process.argv[2] ?? 'adnan@jobradar.io';
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
