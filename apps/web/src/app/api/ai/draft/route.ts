import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  jobs,
  aiCredentials,
  upworkProfileSnapshots,
  proposalDrafts,
  eq,
  and,
  desc,
  gte,
  sql,
} from '@job-radar/db';
import { resolveModel, buildProposalPrompt, systemPrompt, streamText } from '@job-radar/core/ai';
import { decrypt } from '@job-radar/core/crypto';
import { requireSession, isRedirectError } from '../../../../lib/require-session';
import { logger } from '@job-radar/core/logger';

const DAILY_FREE_PROPOSAL_LIMIT = 3;

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const { jobId, credentialId, tone, customInstructions } = await req.json();

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    // 1. Load Job
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) {
      return NextResponse.json({ error: 'Job not found in database' }, { status: 404 });
    }

    // 2. Load User BYOK AI Credential
    let cred: typeof aiCredentials.$inferSelect | undefined;
    if (credentialId) {
      const [c] = await db
        .select()
        .from(aiCredentials)
        .where(and(eq(aiCredentials.id, credentialId), eq(aiCredentials.userId, userId)));
      cred = c;
    } else {
      const [c] = await db
        .select()
        .from(aiCredentials)
        .where(and(eq(aiCredentials.userId, userId), eq(aiCredentials.isDefault, true)));
      cred = c;
    }

    let model: any;
    let providerName: string = 'aws_bedrock';
    let modelName: string = 'amazon.nova-lite-v1:0';
    let isUsingFreeQuota = false;

    if (cred) {
      // User has configured their own BYOK key (Unlimited)
      const secret = decrypt(cred.secretEnc);
      providerName = cred.provider;
      modelName = cred.defaultModel || 'default';
      model = await resolveModel(
        {
          id: cred.id,
          userId,
          provider: cred.provider as any,
          label: cred.label,
          secret,
          config: (cred.config as Record<string, string>) || {},
          defaultModel: cred.defaultModel,
        },
        cred.defaultModel || undefined,
      );
    } else {
      // Free Platform Tier (accessible to everyone, limited to 3 proposals/day)
      isUsingFreeQuota = true;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [dailyDraftsCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(proposalDrafts)
        .where(and(eq(proposalDrafts.userId, userId), gte(proposalDrafts.createdAt, startOfToday)));

      const countToday = Number(dailyDraftsCount?.count || 0);

      if (countToday >= DAILY_FREE_PROPOSAL_LIMIT) {
        return NextResponse.json(
          {
            error: `You've reached your free daily limit (${DAILY_FREE_PROPOSAL_LIMIT}/${DAILY_FREE_PROPOSAL_LIMIT} proposals used today). Add your own AI key (AWS Bedrock, Claude, OpenAI, or Gemini) in Settings → AI Models for unlimited proposals!`,
          },
          { status: 429 },
        );
      }

      // Default to AWS Bedrock using instance IAM role or server credentials
      providerName = 'aws_bedrock';
      modelName = process.env.AWS_BEDROCK_MODEL || 'meta.llama3-8b-instruct-v1:0';
      model = await resolveModel(
        {
          id: 'server-bedrock-default',
          userId,
          provider: 'aws_bedrock',
          label: 'AWS Bedrock Default Model',
          secret: process.env.AWS_SECRET_ACCESS_KEY || '',
          config: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
            region: process.env.AWS_BEDROCK_REGION || 'ap-south-1',
          },
          defaultModel: modelName,
        },
        modelName,
      );
    }

    // 3. Load latest freelancer snapshot
    const [snapshot] = await db
      .select()
      .from(upworkProfileSnapshots)
      .where(eq(upworkProfileSnapshots.userId, userId))
      .orderBy(desc(upworkProfileSnapshots.fetchedAt))
      .limit(1);

    const userPrompt = buildProposalPrompt({
      job: {
        title: job.title,
        description: job.description || '',
        skills: (job.skills as string[]) || [],
        budget: {
          type: job.jobType === 'hourly' ? 'hourly' : 'fixed',
          min: job.hourlyMin ? Number(job.hourlyMin) : job.budgetAmount ? Number(job.budgetAmount) : undefined,
          max: job.hourlyMax ? Number(job.hourlyMax) : job.budgetAmount ? Number(job.budgetAmount) : undefined,
          currency: job.currency || 'USD',
        },
        client: {
          rating: job.clientRating ? Number(job.clientRating) : null,
          totalSpent: job.clientTotalSpent ? Number(job.clientTotalSpent) : null,
          country: job.clientCountry,
          paymentVerified: job.clientPaymentVerified,
        },
        proposalsCount: job.proposalsCount,
      },
      freelancer: {
        title: snapshot?.title || 'Senior Software Engineer',
        overview: snapshot?.overview || 'Experienced full-stack engineer building scalable systems.',
        skills: (snapshot?.skills as string[]) || (job.skills as string[]) || [],
        hourlyRate: snapshot?.hourlyRate ? Number(snapshot.hourlyRate) : 45,
        jobSuccessScore: snapshot?.jobSuccessScore ? Number(snapshot.jobSuccessScore) : 100,
      },
      preferences: {
        tone: (tone as any) || 'professional',
        language: 'English',
      },
    });

    const result = streamText({
      model,
      system: systemPrompt,
      prompt: `${userPrompt}${customInstructions ? `\n\nCustom user instructions: ${customInstructions}` : ''}`,
      onFinish: async (event: any) => {
        try {
          await db.insert(proposalDrafts).values({
            userId,
            jobId: job.id,
            credentialId: cred ? cred.id : null,
            provider: providerName as any,
            model: modelName,
            coverLetter: event.text,
            status: 'ready',
            promptTokens: event.usage?.promptTokens || null,
            completionTokens: event.usage?.completionTokens || null,
          });
        } catch (saveErr) {
          logger.error({ err: saveErr }, 'Failed to save proposal draft on finish.');
        }
      },
    });

    return result.toDataStreamResponse();
  } catch (err: any) {
    // requireSession() redirects by throwing - let it through untouched.
    if (isRedirectError(err)) throw err;

    logger.error({ err }, 'Error in proposal streaming draft route.');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
