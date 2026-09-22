import { db, upworkConnections, users, searchProfiles, eq } from '@job-radar/db';
import { encryptTokens } from '@job-radar/core/upwork';

const accessToken = process.env.UPWORK_ACCESS_TOKEN || '';
const refreshToken = process.env.UPWORK_REFRESH_TOKEN || '';
const orgUid = process.env.UPWORK_ORG_UID || '';
const accountName = process.env.UPWORK_ACCOUNT_NAME || 'Default Account';

async function main() {
  console.log('Connecting Upwork MCP with org_uid for registered users in DB...');
  const allUsers = await db.select().from(users);

  const { accessTokenEnc, refreshTokenEnc } = encryptTokens({
    accessToken,
    refreshToken,
  });

  const expiresAt = new Date(Date.now() + 86400 * 1000 * 30); // 30 days

  for (const u of allUsers) {
    console.log(`Linking Upwork connection for user: ${u.email} (${u.id})`);

    const [existing] = await db
      .select()
      .from(upworkConnections)
      .where(eq(upworkConnections.userId, u.id));

    if (existing) {
      await db
        .update(upworkConnections)
        .set({
          accessTokenEnc,
          refreshTokenEnc,
          orgUid,
          accountName,
          accountRole: 'TALENT',
          expiresAt,
          isActive: true,
          consecutiveFailures: 0,
          lastRefreshedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(upworkConnections.id, existing.id));
    } else {
      await db.insert(upworkConnections).values({
        userId: u.id,
        accessTokenEnc,
        refreshTokenEnc,
        orgUid,
        accountName,
        accountRole: 'TALENT',
        expiresAt,
        isActive: true,
      });
    }

    // Ensure user has at least 2 active search profiles so polling brings in jobs
    const existingProfiles = await db
      .select()
      .from(searchProfiles)
      .where(eq(searchProfiles.userId, u.id));

    if (existingProfiles.length === 0) {
      console.log(`Creating default search profiles for user: ${u.email}`);
      await db.insert(searchProfiles).values([
        {
          userId: u.id,
          name: 'Full Stack & Web Development',
          query: 'React OR Next.js OR Node OR TypeScript OR Python',
          keywords: ['React', 'Next.js', 'Node.js', 'TypeScript', 'Python', 'Tailwind'],
          minScore: 50,
          isActive: true,
          hourlyMin: 25,
          fixedMin: 100,
        },
        {
          userId: u.id,
          name: 'AI & Automation Specialist',
          query: 'AI OR LLM OR Automation OR LangChain OR Python OR Bot',
          keywords: ['AI', 'LLM', 'OpenAI', 'LangChain', 'Automation', 'Python', 'Bot'],
          minScore: 50,
          isActive: true,
          hourlyMin: 35,
          fixedMin: 200,
        },
      ]);
    }
  }

  console.log('✅ Successfully linked Upwork MCP + created search profiles for all users!');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
