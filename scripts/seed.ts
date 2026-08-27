import { db, users, searchProfiles, jobs, matches } from '../packages/db/src/index.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function seed() {
  console.log('🌱 Starting database seed (§21 Phase 1)...');

  // 1. Create demo user
  const [user] = await db
    .insert(users)
    .values({
      email: 'adnan@example.com',
      name: 'Adnan Dev',
      emailVerified: true,
      timezone: 'Asia/Karachi',
      locale: 'en',
    })
    .onConflictDoNothing()
    .returning();

  const userId = user?.id;
  console.log(`👤 User created or retrieved: ${userId || 'adnan@example.com'}`);

  if (userId) {
    // 2. Create search profiles
    const [profile1] = await db
      .insert(searchProfiles)
      .values({
        userId,
        name: 'Laravel Backend & APIs',
        isActive: true,
        keywords: ['laravel', 'php', 'api', 'mysql'],
        negativeKeywords: ['wordpress', 'elementor'],
        requiredSkills: ['Laravel', 'PHP'],
        jobType: 'hourly',
        minHourlyRate: '25.00',
        minScore: 50,
        notifyEnabled: true,
      })
      .returning();

    const [profile2] = await db
      .insert(searchProfiles)
      .values({
        userId,
        name: 'React & TypeScript Frontend',
        isActive: true,
        keywords: ['react', 'typescript', 'next.js', 'tailwind'],
        negativeKeywords: ['angular', 'vue'],
        requiredSkills: ['React', 'TypeScript'],
        jobType: 'hourly',
        minHourlyRate: '30.00',
        minScore: 60,
        notifyEnabled: true,
      })
      .returning();

    console.log(`📋 Created profiles: ${profile1?.name}, ${profile2?.name}`);

    // 3. Create sample jobs
    const sampleJobs = [
      {
        id: '~0219851001',
        title: 'Senior Laravel Developer for SaaS REST API Backend',
        description: 'We are looking for an experienced Laravel 11 engineer to design multi-tenant database architectures.',
        jobType: 'hourly' as const,
        hourlyMin: '35.00',
        hourlyMax: '60.00',
        currency: 'USD',
        skills: ['Laravel', 'PHP', 'PostgreSQL', 'REST API'],
        clientRating: '4.95',
        clientReviewsCount: 32,
        clientTotalSpent: '58400.00',
        clientCountry: 'United States',
        clientPaymentVerified: true,
        postedAt: new Date(Date.now() - 15 * 60 * 1000),
      },
      {
        id: '~0219851002',
        title: 'Next.js 15 & React Dashboard Developer with Tailwind CSS',
        description: 'Need a talented React front-end engineer to build beautiful analytics dashboards.',
        jobType: 'hourly' as const,
        hourlyMin: '40.00',
        hourlyMax: '70.00',
        currency: 'USD',
        skills: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
        clientRating: '4.88',
        clientReviewsCount: 19,
        clientTotalSpent: '24500.00',
        clientCountry: 'Germany',
        clientPaymentVerified: true,
        postedAt: new Date(Date.now() - 35 * 60 * 1000),
      },
    ];

    for (const j of sampleJobs) {
      await db.insert(jobs).values(j).onConflictDoNothing();
      if (profile1) {
        await db
          .insert(matches)
          .values({
            userId,
            jobId: j.id,
            profileId: profile1.id,
            score: 88,
            scoreBreakdown: { titleKeywords: 30, descKeywords: 15, skills: 20, budget: 10, clientQuality: 10, clientSpend: 3 },
            matchedKeywords: ['laravel', 'api'],
          })
          .onConflictDoNothing();
      }
    }

    console.log(`✅ Seed completed with ${sampleJobs.length} sample jobs and match associations.`);
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
