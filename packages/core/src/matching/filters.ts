import type { NormalizedJob } from '../upwork/normalize';

export type SearchProfileModel = {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  keywords: string[];
  negativeKeywords: string[];
  requiredSkills: string[];
  categories: string[];
  jobType?: 'hourly' | 'fixed' | null;
  minHourlyRate?: number | string | null;
  minFixedBudget?: number | string | null;
  minClientRating?: number | string | null;
  minClientSpent?: number | string | null;
  requirePaymentVerified: boolean;
  includeCountries: string[];
  excludeCountries: string[];
  maxProposals?: number | null;
  experienceLevels: string[];
  minScore: number;
  maxAlertsPerDay: number;
  /**
   * Minimum title+description+skills score required before quality signals are
   * counted. Defaults to DEFAULT_MIN_RELEVANCE when unset.
   */
  minRelevance?: number | null;
};

export type RejectionReason =
  | 'negative_keyword'
  | 'job_type'
  | 'below_rate'
  | 'below_budget'
  | 'excluded_country'
  | 'not_included_country'
  | 'payment_unverified'
  | 'too_crowded'
  | 'daily_cap'
  | 'below_threshold'
  | 'missing_keyword'
  | 'weak_relevance';

function containsTerm(text: string, term: string): boolean {
  const escaped = term.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Boolean(escaped) && new RegExp(`(?:^|\\b)${escaped}(?:$|\\b)`, 'i').test(text);
}

export function applyHardFilters(
  job: NormalizedJob,
  profile: SearchProfileModel,
  alertsSentToday = 0,
): RejectionReason | null {
  const textToCheck = `${job.title} ${job.description || ''}`.toLowerCase();

  // 1. Negative keywords
  for (const neg of profile.negativeKeywords || []) {
    const trimmed = neg.trim().toLowerCase();
    if (trimmed && containsTerm(textToCheck, trimmed)) {
      return 'negative_keyword';
    }
  }

  // 2. Job type
  if (profile.jobType && job.jobType !== 'unknown' && profile.jobType !== job.jobType) {
    return 'job_type';
  }

  // 3. Hourly rate (compare against hourlyMax or hourlyMin)
  if (profile.minHourlyRate != null && job.jobType === 'hourly') {
    const minRequired = Number(profile.minHourlyRate);
    const effectiveRate = job.hourlyMax ?? job.hourlyMin;
    if (effectiveRate != null && effectiveRate < minRequired) {
      return 'below_rate';
    }
  }

  // 4. Fixed budget
  if (profile.minFixedBudget != null && job.jobType === 'fixed') {
    const minBudget = Number(profile.minFixedBudget);
    if (job.budgetAmount != null && job.budgetAmount < minBudget) {
      return 'below_budget';
    }
  }

  // 5. Exclude countries (only if country is known)
  if (job.client.country && profile.excludeCountries?.length) {
    const jobCountry = job.client.country.trim().toLowerCase();
    if (profile.excludeCountries.some((c) => c.trim().toLowerCase() === jobCountry)) {
      return 'excluded_country';
    }
  }

  // 6. Include countries (only if country is known and include list is non-empty)
  if (job.client.country && profile.includeCountries?.length) {
    const jobCountry = job.client.country.trim().toLowerCase();
    if (!profile.includeCountries.some((c) => c.trim().toLowerCase() === jobCountry)) {
      return 'not_included_country';
    }
  }

  // 7. Require payment verified (reject ONLY if explicitly false; null/unknown never rejects - §10.4)
  if (profile.requirePaymentVerified && job.client.paymentVerified === false) {
    return 'payment_unverified';
  }

  // Client thresholds reject only known values; unavailable MCP fields remain unknown.
  if (profile.minClientRating != null && job.client.rating != null && job.client.rating < Number(profile.minClientRating)) {
    return 'below_threshold';
  }
  if (profile.minClientSpent != null && job.client.totalSpent != null && job.client.totalSpent < Number(profile.minClientSpent)) {
    return 'below_threshold';
  }

  // 8. Max proposals (if known)
  if (profile.maxProposals != null && job.proposalsCount != null && job.proposalsCount > profile.maxProposals) {
    return 'too_crowded';
  }

  // 9. Daily cap
  if (profile.maxAlertsPerDay && alertsSentToday >= profile.maxAlertsPerDay) {
    return 'daily_cap';
  }

  return null;
}
