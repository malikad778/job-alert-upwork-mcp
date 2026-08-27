import type { NormalizedJob } from '../upwork/normalize.ts';
import { applyHardFilters, type SearchProfileModel, type RejectionReason } from './filters.ts';

function hasKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Boolean(escaped) && new RegExp(`(?:^|\\b)${escaped}(?:$|\\b)`, 'i').test(text);
}

export type ScoreBreakdown = {
  titleKeywords: number;
  descKeywords: number;
  skills: number;
  budget: number;
  clientQuality: number;
  clientSpend: number;
  freshness: number;
  competition: number;
};

export type MatchResult = {
  matched: boolean;
  score: number;
  breakdown: ScoreBreakdown;
  matchedKeywords: string[];
  rejectedReason: RejectionReason | null;
};

export function scoreTitleKeywords(job: NormalizedJob, profile: SearchProfileModel): { points: number; matched: string[] } {
  const titleLower = job.title.toLowerCase();
  const matched = (profile.keywords || []).filter((k) => {
    const term = k.trim().toLowerCase();
    return term && hasKeyword(titleLower, term);
  });

  if (matched.length === 0) return { points: 0, matched: [] };
  // Full 20 base + 5 per extra keyword up to 30
  const points = Math.min(30, 20 + (matched.length - 1) * 5);
  return { points, matched };
}

export function scoreDescriptionKeywords(job: NormalizedJob, profile: SearchProfileModel): { points: number; matched: string[] } {
  const descLower = (job.description || '').toLowerCase();
  const matched = (profile.keywords || []).filter((k) => {
    const term = k.trim().toLowerCase();
    return term && hasKeyword(descLower, term);
  });

  if (matched.length === 0) return { points: 0, matched: [] };
  const points = Math.min(15, 10 + (matched.length - 1) * 5);
  return { points, matched };
}

/**
 * Skill overlap, 0-20.
 *
 * A profile with no requiredSkills used to receive a flat 20 points. Combined
 * with the neutral scores for unknown client data that produced a ~37 point
 * floor for every job, so anything mentioning a keyword once cleared the
 * default threshold of 50. Absent requiredSkills we now fall back to overlap
 * between the profile's own keywords and the job's skill tags, which is real
 * evidence of relevance rather than a free pass.
 */
export function scoreSkillOverlap(job: NormalizedJob, profile: SearchProfileModel): number {
  const jobSkillsLower = new Set(job.skills.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const required = (profile.requiredSkills || []).map((r) => r.trim().toLowerCase()).filter(Boolean);

  if (required.length > 0) {
    const hits = required.filter((r) => jobSkillsLower.has(r));
    return Math.round(20 * (hits.length / required.length));
  }

  // Upwork does not always return skill tags. Unknown scores a small neutral
  // value so a missing field neither rewards nor punishes the job.
  if (jobSkillsLower.size === 0) return 4;

  const keywords = (profile.keywords || []).map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (keywords.length === 0) return 4;

  const hits = keywords.filter((k) => jobSkillsLower.has(k));
  if (hits.length === 0) return 0;

  // Saturates at three overlapping skill tags.
  return Math.min(20, 8 + (hits.length - 1) * 6);
}

export function scoreBudget(job: NormalizedJob, profile: SearchProfileModel): number {
  if (job.jobType === 'hourly') {
    if (profile.minHourlyRate == null || job.hourlyMax == null) return 5;
    const min = Number(profile.minHourlyRate);
    if (min <= 0) return 10;
    const ratio = job.hourlyMax / min;
    if (ratio >= 2.0) return 15;
    if (ratio >= 1.5) return 10;
    if (ratio >= 1.0) return 5;
    return 0;
  }

  if (job.jobType === 'fixed') {
    if (profile.minFixedBudget == null || job.budgetAmount == null) return 5;
    const min = Number(profile.minFixedBudget);
    if (min <= 0) return 10;
    const ratio = job.budgetAmount / min;
    if (ratio >= 2.0) return 15;
    if (ratio >= 1.5) return 10;
    if (ratio >= 1.0) return 5;
    return 0;
  }

  return 5; // unknown budget => neutral 5
}

export function scoreClientQuality(job: NormalizedJob): number {
  const rating = job.client.rating;
  // Unknown stays neutral but low - it is absence of evidence, not quality.
  if (rating == null) return 3;
  if (rating >= 4.8) return 10;
  if (rating >= 4.5) return 7;
  if (rating >= 4.0) return 4;
  return 0;
}

export function scoreClientSpend(job: NormalizedJob): number {
  const spend = job.client.totalSpent;
  if (spend == null) return 1;
  if (spend >= 10000) return 5;
  if (spend >= 1000) return 3;
  return 1;
}

export function scoreFreshness(job: NormalizedJob, now: Date): number {
  if (!job.postedAt) return 3;
  const ageMs = Math.max(0, now.getTime() - job.postedAt.getTime());
  const ageMins = ageMs / (1000 * 60);
  if (ageMins <= 15) return 5;
  if (ageMins <= 60) return 3;
  if (ageMins <= 360) return 1;
  return 0;
}

export function scoreCompetition(job: NormalizedJob): number {
  const count = job.proposalsCount;
  if (count == null) return 1;
  if (count < 5) return 5;
  if (count < 15) return 2;
  return 0;
}

/**
 * Minimum relevance (title + description + skills) a job must earn before the
 * quality signals are even considered. Prevents an unrelated job from being
 * carried over the threshold by a good client rating and a fresh timestamp.
 */
export const DEFAULT_MIN_RELEVANCE = 25;

export function scoreJob(
  job: NormalizedJob,
  profile: SearchProfileModel,
  now = new Date(),
  alertsSentToday = 0,
): MatchResult {
  const rejection = applyHardFilters(job, profile, alertsSentToday);
  if (rejection) {
    return {
      matched: false,
      score: 0,
      breakdown: {
        titleKeywords: 0,
        descKeywords: 0,
        skills: 0,
        budget: 0,
        clientQuality: 0,
        clientSpend: 0,
        freshness: 0,
        competition: 0,
      },
      matchedKeywords: [],
      rejectedReason: rejection,
    };
  }

  const titleScore = scoreTitleKeywords(job, profile);
  const descScore = scoreDescriptionKeywords(job, profile);
  const matchedKeywords = [...new Set([...titleScore.matched, ...descScore.matched])];

  if (profile.keywords.length > 0 && matchedKeywords.length === 0) {
    return {
      matched: false,
      score: 0,
      breakdown: {
        titleKeywords: 0,
        descKeywords: 0,
        skills: 0,
        budget: 0,
        clientQuality: 0,
        clientSpend: 0,
        freshness: 0,
        competition: 0,
      },
      matchedKeywords: [],
      rejectedReason: 'missing_keyword',
    };
  }

  const breakdown: ScoreBreakdown = {
    titleKeywords: titleScore.points,
    descKeywords: descScore.points,
    skills: scoreSkillOverlap(job, profile),
    budget: scoreBudget(job, profile),
    clientQuality: scoreClientQuality(job),
    clientSpend: scoreClientSpend(job),
    freshness: scoreFreshness(job, now),
    competition: scoreCompetition(job),
  };

  // Relevance gate: quality signals (fresh posting, good client, low
  // competition) must never be able to carry an off-topic job over the line.
  const relevance = breakdown.titleKeywords + breakdown.descKeywords + breakdown.skills;
  const minRelevance = profile.minRelevance ?? DEFAULT_MIN_RELEVANCE;

  if (relevance < minRelevance) {
    return {
      matched: false,
      score: relevance,
      breakdown,
      matchedKeywords,
      rejectedReason: 'weak_relevance',
    };
  }

  const totalScore = Math.min(
    100,
    Math.max(
      0,
      breakdown.titleKeywords +
        breakdown.descKeywords +
        breakdown.skills +
        breakdown.budget +
        breakdown.clientQuality +
        breakdown.clientSpend +
        breakdown.freshness +
        breakdown.competition,
    ),
  );

  const matched = totalScore >= (profile.minScore ?? 50);

  return {
    matched,
    score: totalScore,
    breakdown,
    matchedKeywords,
    rejectedReason: matched ? null : 'below_threshold',
  };
}
