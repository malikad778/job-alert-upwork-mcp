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
import { getSession, isRedirectError } from '../../../../lib/require-session';
import { logger } from '@job-radar/core/logger';

const DAILY_FREE_PROPOSAL_LIMIT = 3;

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const userId = session?.user?.id || null;

    const body = await req.json().catch(() => ({}));
    const {
      jobId,
      job: inlineJob,
      credentialId,
      tone,
      customInstructions,
      apiKey: bodyApiKey,
      provider: bodyProvider,
      modelName: bodyModelName,
      config: bodyConfig,
      freelancer: inlineFreelancer,
    } = body;

    // Check for Authorization: Bearer <key> if not passed in body
    const authHeader = req.headers.get('authorization') || '';
    const bearerKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
    const directApiKey = bodyApiKey || bearerKey;

    if (!userId && !directApiKey) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid user session or direct AI API key required.' },
        { status: 401 },
      );
    }

    if (!jobId && !inlineJob) {
      return NextResponse.json({ error: 'jobId or job object is required' }, { status: 400 });
    }

    // 1. Resolve Job details
    let jobData: any = inlineJob;
    if (!jobData && jobId) {
      const [dbJob] = await db.select().from(jobs).where(eq(jobs.id, jobId));
      if (!dbJob) {
        return NextResponse.json({ error: 'Job not found in database' }, { status: 404 });
      }
      jobData = {
        id: dbJob.id,
        title: dbJob.title,
        description: dbJob.description || '',
        skills: (dbJob.skills as string[]) || [],
        jobType: dbJob.jobType,
        hourlyMin: dbJob.hourlyMin,
        hourlyMax: dbJob.hourlyMax,
        budgetAmount: dbJob.budgetAmount,
        currency: dbJob.currency || 'USD',
        clientRating: dbJob.clientRating,
        clientTotalSpent: dbJob.clientTotalSpent,
        clientCountry: dbJob.clientCountry,
        clientPaymentVerified: dbJob.clientPaymentVerified,
        proposalsCount: dbJob.proposalsCount,
      };
    }

    // 2. Resolve AI Model & Credentials
    let model: any;
    let providerName: string = bodyProvider || 'openai';
    let modelName: string = bodyModelName || 'gpt-4o';
    let credIdToLog: string | null = null;

    if (directApiKey) {
      // Direct BYOK key passed in request (external API caller or custom run)
      providerName = bodyProvider || 'openai';
      if (!bodyModelName) {
        if (providerName === 'anthropic') modelName = 'claude-3-5-sonnet-20241022';
        else if (providerName === 'google') modelName = 'gemini-1.5-pro-latest';
        else if (providerName === 'groq') modelName = 'llama-3.3-70b-versatile';
        else modelName = 'gpt-4o';
      } else {
        modelName = bodyModelName;
      }

      model = await resolveModel(
        {
          id: 'direct-api-call',
          userId: userId || 'anonymous',
          provider: providerName as any,
          label: 'Direct API Key',
          secret: directApiKey,
          config: bodyConfig || {},
          defaultModel: modelName,
        },
        modelName,
      );
    } else if (userId) {
      // Load saved BYOK Credential for authenticated user
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

      if (cred) {
        credIdToLog = cred.id;
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
        // Free Platform Tier (limited to 3 proposals/day)
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
    }

    // 3. Resolve Freelancer Profile
    let freelancerProfile: any = inlineFreelancer;
    if (!freelancerProfile && userId) {
      const [snapshot] = await db
        .select()
        .from(upworkProfileSnapshots)
        .where(eq(upworkProfileSnapshots.userId, userId))
        .orderBy(desc(upworkProfileSnapshots.fetchedAt))
        .limit(1);

      if (snapshot) {
        freelancerProfile = {
          title: snapshot.title || 'Senior Software Engineer',
          overview: snapshot.overview || 'Experienced full-stack engineer building scalable systems.',
          skills: (snapshot.skills as string[]) || (jobData.skills as string[]) || [],
          hourlyRate: snapshot.hourlyRate ? Number(snapshot.hourlyRate) : 45,
          jobSuccessScore: snapshot.jobSuccessScore ? Number(snapshot.jobSuccessScore) : 100,
        };
      }
    }

    if (!freelancerProfile) {
      freelancerProfile = {
        title: 'Senior Software Engineer & Freelance Specialist',
        overview: 'Specialist engineer delivering reliable and production-ready systems.',
        skills: (jobData.skills as string[]) || ['TypeScript', 'React', 'Node.js', 'Python'],
        hourlyRate: 50,
        jobSuccessScore: 100,
      };
    }

    const userPrompt = buildProposalPrompt({
      job: {
        title: jobData.title,
        description: jobData.description || '',
        skills: (jobData.skills as string[]) || [],
        budget: {
          type: jobData.jobType === 'hourly' ? 'hourly' : 'fixed',
          min: jobData.hourlyMin ? Number(jobData.hourlyMin) : jobData.budgetAmount ? Number(jobData.budgetAmount) : undefined,
          max: jobData.hourlyMax ? Number(jobData.hourlyMax) : jobData.budgetAmount ? Number(jobData.budgetAmount) : undefined,
          currency: jobData.currency || 'USD',
        },
        client: {
          rating: jobData.clientRating ? Number(jobData.clientRating) : null,
          totalSpent: jobData.clientTotalSpent ? Number(jobData.clientTotalSpent) : null,
          country: jobData.clientCountry,
          paymentVerified: jobData.clientPaymentVerified,
        },
        proposalsCount: jobData.proposalsCount,
      },
      freelancer: {
        title: freelancerProfile.title || 'Senior Software Engineer',
        overview: freelancerProfile.overview || 'Experienced full-stack engineer building scalable systems.',
        skills: (freelancerProfile.skills as string[]) || (jobData.skills as string[]) || [],
        hourlyRate: freelancerProfile.hourlyRate ? Number(freelancerProfile.hourlyRate) : 45,
        jobSuccessScore: freelancerProfile.jobSuccessScore ? Number(freelancerProfile.jobSuccessScore) : 100,
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
        if (userId && jobData?.id) {
          try {
            await db.insert(proposalDrafts).values({
              userId,
              jobId: jobData.id,
              credentialId: credIdToLog,
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
        }
      },
    });

    return result.toDataStreamResponse();
  } catch (err: any) {
    if (isRedirectError(err)) throw err;

    logger.error({ err }, 'Error in proposal streaming draft route.');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
