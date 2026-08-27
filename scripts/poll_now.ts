import { runJobPoll } from '@job-radar/jobs';
import { db, users } from '@job-radar/db';

async function run() {
  const allUsers = await db.select().from(users);
  for (const u of allUsers) {
    console.log(`\n========================================`);
    console.log(`Polling Upwork for user: ${u.email}`);
    console.log(`========================================`);
    try {
      const res = await runJobPoll({ userId: u.id, triggerType: 'manual' });
      console.log(`✅ Poll result for ${u.email}:`, res);
    } catch (err: any) {
      console.error(`❌ Poll error for ${u.email}:`, err.message);
    }
  }
  process.exit(0);
}

run().catch(console.error);
