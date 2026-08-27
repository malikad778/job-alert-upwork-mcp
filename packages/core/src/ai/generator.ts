import { generateObject } from 'ai';
import { resolveModel } from './resolve.ts';
import {
  buildProposalPrompt,
  systemPrompt,
  proposalSchema,
  type ProposalContext,
} from './prompts/proposal.ts';
import type { NormalizedJob } from '../upwork/normalize.ts';

export type GenerateProposalOptions = {
  job: NormalizedJob;
  freelancer: {
    title: string;
    overview: string;
    skills: string[];
    hourlyRate?: number;
    jobSuccessScore?: number;
    portfolioHighlights?: string[];
  };
  preferences?: {
    tone?: 'concise' | 'detailed' | 'conversational' | 'professional';
    language?: string;
    customInstructions?: string;
  };
  aiProviderConfig?: {
    provider: 'anthropic' | 'openai' | 'google' | 'google_vertex' | 'openrouter' | 'ollama' | 'aws_bedrock' | 'custom';
    apiKey?: string;
    modelName?: string;
    config?: Record<string, string>;
  };
};

export type GeneratedProposal = {
  coverLetter: string;
  suggestedBid: {
    amount: number;
    type: 'hourly' | 'fixed';
    currency: string;
    rationale: string;
  };
  screeningAnswers?: { question: string; answer: string }[];
  highlightSkills: string[];
  providerUsed: string;
  modelUsed: string;
};

/**
 * Generates an on-demand grounded proposal for a specific job post (§13).
 */
export async function generateProposalOnDemand(options: GenerateProposalOptions): Promise<GeneratedProposal> {
  const provider = options.aiProviderConfig?.provider || 'aws_bedrock';
  const modelName = options.aiProviderConfig?.modelName || (provider === 'aws_bedrock' ? (process.env.AWS_BEDROCK_MODEL || 'meta.llama3-8b-instruct-v1:0') : 'gemini-2.5-flash');
  const apiKey = (options.aiProviderConfig?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '').trim();

  if (!apiKey && provider !== 'ollama' && provider !== 'aws_bedrock') {
    throw new Error(
      `No API key configured for AI provider '${provider}'. Please add your API key in Settings > AI (BYOK) to generate proposals on-demand.`
    );
  }

  const model = await resolveModel(
    {
      id: 'on-demand',
      userId: 'on-demand',
      provider,
      label: 'On Demand Generator',
      secret: apiKey,
      config: options.aiProviderConfig?.config || {},
      defaultModel: modelName,
    },
    modelName,
  );

  const promptInput: ProposalContext = {
    job: {
      title: options.job.title,
      description: options.job.description || '',
      skills: options.job.skills,
      budget: {
        type: options.job.jobType === 'hourly' ? 'hourly' : 'fixed',
        min: options.job.hourlyMin ?? options.job.budgetAmount ?? undefined,
        max: options.job.hourlyMax ?? options.job.budgetAmount ?? undefined,
        currency: options.job.currency || 'USD',
      },
      screeningQuestions: [],
      client: {
        rating: options.job.client.rating ?? undefined,
        totalSpent: options.job.client.totalSpent ?? undefined,
        country: options.job.client.country ?? undefined,
        paymentVerified: options.job.client.paymentVerified ?? undefined,
      },
      proposalsCount: options.job.proposalsCount ?? undefined,
    },
    freelancer: {
      title: options.freelancer.title,
      overview: options.freelancer.overview,
      skills: options.freelancer.skills,
      hourlyRate: options.freelancer.hourlyRate,
      jobSuccessScore: options.freelancer.jobSuccessScore,
    },
    preferences: {
      tone: (options.preferences?.tone as any) || 'professional',
      language: options.preferences?.language || 'English',
    },
  };

  const userPrompt = buildProposalPrompt(promptInput);

  const fullPrompt = `${userPrompt}${
    options.preferences?.customInstructions ? `\n\nCustom Freelancer Instructions: ${options.preferences.customInstructions}` : ''
  }\n\nWrite a tailored, highly persuasive Upwork cover letter that addresses the client's exact problem and highlights relevant expertise.`;

  const { generateText } = await import('ai');
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: fullPrompt,
    temperature: 0.4,
  });

  const rawCoverLetter = result.text.trim();
  const bidAmount = options.job.budgetAmount || options.job.hourlyMax || options.freelancer.hourlyRate || 45;
  const bidType = options.job.jobType === 'hourly' ? 'hourly' : 'fixed';

  return {
    coverLetter: rawCoverLetter,
    suggestedBid: {
      amount: Number(bidAmount),
      type: bidType as any,
      currency: options.job.currency || 'USD',
      rationale: `Competitive ${bidType} bid tailored to the client's scope and budget.`,
    },
    highlightSkills: options.job.skills?.slice(0, 5) || [],
    providerUsed: provider,
    modelUsed: modelName || 'default',
  };
}
