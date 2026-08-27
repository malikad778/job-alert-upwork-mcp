import { describe, it, expect } from 'vitest';
import { scoreJob } from '../src/matching/score';
import type { NormalizedJob } from '../src/upwork/normalize';
import type { SearchProfileModel } from '../src/matching/filters';

describe('Deterministic Matcher and Scorer (§11.4)', () => {
  const baseProfile: SearchProfileModel = {
    id: 'prof-1',
    userId: 'user-1',
    name: 'Laravel Fullstack',
    isActive: true,
    keywords: ['laravel', 'php', 'api'],
    negativeKeywords: ['wordpress', 'elementor'],
    requiredSkills: ['Laravel', 'PHP'],
    categories: ['Web Development'],
    jobType: 'hourly',
    minHourlyRate: 25,
    minFixedBudget: null,
    minClientRating: 4.5,
    minClientSpent: 1000,
    requirePaymentVerified: true,
    includeCountries: [],
    excludeCountries: ['India'],
    maxProposals: 20,
    experienceLevels: [],
    minScore: 50,
    maxAlertsPerDay: 50,
  };

  const fullJob: NormalizedJob = {
    id: 'job-1',
    title: 'Senior Laravel API Developer Needed',
    description: 'Looking for an expert to design REST APIs using Laravel 11.',
    url: 'https://www.upwork.com/jobs/job-1',
    jobType: 'hourly',
    skills: ['Laravel', 'PHP', 'MySQL', 'API'],
    budgetAmount: null,
    hourlyMin: 30,
    hourlyMax: 50,
    currency: 'USD',
    postedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 mins ago
    proposalsCount: 4,
    client: {
      rating: 4.9,
      reviewsCount: 15,
      totalSpent: 15000,
      country: 'United States',
      paymentVerified: true,
    },
    unmappedFields: [],
    rawPayload: {},
    normalizerVersion: 1,
  };

  it('scores full match highly and matches profile', () => {
    const result = scoreJob(fullJob, baseProfile);
    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.matchedKeywords).toContain('laravel');
    expect(result.matchedKeywords).toContain('api');
    expect(result.breakdown.titleKeywords).toBeGreaterThan(0);
    expect(result.breakdown.skills).toBe(20);
    expect(result.rejectedReason).toBeNull();
  });

  it('CRITICAL TEST (G3 mitigation): unknown client data scores neutral (never 0) and does not suppress alerts', () => {
    const jobWithNoClientData: NormalizedJob = {
      ...fullJob,
      client: {
        rating: null,
        reviewsCount: null,
        totalSpent: null,
        country: null,
        paymentVerified: null, // unknown
      },
    };

    const result = scoreJob(jobWithNoClientData, baseProfile);
    expect(result.matched).toBe(true);
    // Unknown client data still scores neutral rather than zero, so it never
    // suppresses an otherwise relevant job. The neutral values are deliberately
    // small so that padding alone cannot carry an off-topic job over minScore.
    expect(result.breakdown.clientQuality).toBe(3);
    expect(result.breakdown.clientSpend).toBe(1);
    expect(result.score).toBeGreaterThanOrEqual(baseProfile.minScore);
  });

  it('rejects jobs containing negative keywords', () => {
    const wordpressJob: NormalizedJob = {
      ...fullJob,
      title: 'WordPress Developer with Laravel experience',
    };
    const result = scoreJob(wordpressJob, baseProfile);
    expect(result.matched).toBe(false);
    expect(result.rejectedReason).toBe('negative_keyword');
  });

  it('rejects jobs below hourly minimum rate', () => {
    const cheapJob: NormalizedJob = {
      ...fullJob,
      hourlyMin: 15,
      hourlyMax: 20, // below 25
    };
    const result = scoreJob(cheapJob, baseProfile);
    expect(result.matched).toBe(false);
    expect(result.rejectedReason).toBe('below_rate');
  });

  it('rejects jobs with no configured keyword match even when other signals are strong', () => {
    const result = scoreJob({ ...fullJob, title: 'Senior Ruby Developer', description: 'Build a Ruby service.' }, baseProfile);
    expect(result.matched).toBe(false);
    expect(result.rejectedReason).toBe('missing_keyword');
  });

  it('rejects known client values below configured thresholds', () => {
    const result = scoreJob({ ...fullJob, client: { ...fullJob.client, rating: 4.2, totalSpent: 500 } }, baseProfile);
    expect(result.matched).toBe(false);
    expect(result.rejectedReason).toBe('below_threshold');
  });

  describe('relevance gate', () => {
    // A profile with no requiredSkills used to receive a flat 20 skill points,
    // which combined with the neutral quality scores let barely-related jobs
    // clear minScore. These cases lock that regression out.
    const looseProfile: SearchProfileModel = {
      ...baseProfile,
      requiredSkills: [],
      jobType: null,
      minHourlyRate: null,
      minClientRating: null,
      minClientSpent: null,
      requirePaymentVerified: false,
      maxProposals: null,
    };

    it('rejects a job that only mentions a keyword in passing, despite a great client', () => {
      const tangentialJob: NormalizedJob = {
        ...fullJob,
        title: 'Shopify Store Redesign',
        description:
          'Our checkout talks to a legacy api, but you will not touch it. Focus is purely on Shopify theme work.',
        skills: ['Shopify', 'Liquid', 'CSS'],
      };

      const result = scoreJob(tangentialJob, looseProfile);
      expect(result.matched).toBe(false);
      expect(result.rejectedReason).toBe('weak_relevance');
    });

    it('still matches a genuinely relevant job under the same loose profile', () => {
      const result = scoreJob(fullJob, looseProfile);
      expect(result.matched).toBe(true);
      expect(result.rejectedReason).toBeNull();
    });

    it('does not award skill points when the job shares no skill tags', () => {
      const result = scoreJob(
        { ...fullJob, skills: ['Shopify', 'Liquid'] },
        looseProfile,
      );
      expect(result.breakdown.skills).toBe(0);
    });

    it('scores unknown skill tags as a small neutral value rather than a free 20', () => {
      const result = scoreJob({ ...fullJob, skills: [] }, looseProfile);
      expect(result.breakdown.skills).toBe(4);
    });

    it('honours a per-profile minRelevance override', () => {
      const strict = { ...looseProfile, minRelevance: 95 };
      const result = scoreJob(fullJob, strict);
      expect(result.matched).toBe(false);
      expect(result.rejectedReason).toBe('weak_relevance');
    });
  });
});
