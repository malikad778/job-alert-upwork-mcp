export const NORMALIZER_VERSION = 1;

export class UnparseableJobError extends Error {
  public raw: unknown;

  constructor(raw: unknown) {
    super('Could not resolve a valid job identifier from raw payload');
    this.name = 'UnparseableJobError';
    this.raw = raw;
  }
}

export type NormalizedJob = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  jobType: 'hourly' | 'fixed' | 'unknown';
  category?: string | null;
  subcategory?: string | null;
  skills: string[];
  budgetAmount: number | null;
  hourlyMin: number | null;
  hourlyMax: number | null;
  currency: string;
  postedAt: Date | null;
  proposalsCount: number | null;
  experienceLevel?: string | null;
  duration?: string | null;
  workload?: string | null;
  interviewing?: number | null;
  invitesSent?: number | null;

  client: {
    rating: number | null;
    reviewsCount: number | null;
    totalSpent: number | null;
    totalHires?: number | null;
    activeHires?: number | null;
    hireRate?: number | null;
    country: string | null;
    city?: string | null;
    timezone?: string | null;
    paymentVerified: boolean | null;
    memberSince?: Date | null;
    avgHourlyPaid?: number | null;
  };

  unmappedFields: string[];
  rawPayload: Record<string, unknown>;
  normalizerVersion: number;
};

/** Get a deeply nested value by dot path */
function getPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let curr: unknown = obj;
  for (const part of parts) {
    if (curr == null || typeof curr !== 'object') return undefined;
    curr = (curr as Record<string, unknown>)[part];
  }
  return curr;
}

/** Try multiple candidate paths; return the first defined and non-null value. */
function pick<T>(obj: Record<string, unknown>, paths: string[]): T | undefined {
  for (const path of paths) {
    const val = getPath(obj, path);
    if (val !== undefined && val !== null && val !== '') {
      return val as T;
    }
  }
  return undefined;
}

/** Flatten all object key paths */
function flattenPaths(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const paths: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    paths.push(fullKey);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      paths.push(...flattenPaths(v, fullKey));
    }
  }
  return paths;
}

/**
 * Handles "$1,200.00", 1200, "1200", {amount: 1200}, "€1.200,00", "1.2k", etc.
 * Returns null (never 0) for missing/unknown.
 */
export function parseMoney(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }
  if (typeof val === 'object') {
    const amount = (val as { amount?: unknown; value?: unknown }).amount ?? (val as { value?: unknown }).value;
    return parseMoney(amount);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || trimmed === 'N/A' || trimmed === 'TBD' || trimmed.toLowerCase() === 'not specified') {
      return null;
    }

    // Check "1.2k" or "10k"
    const kMatch = trimmed.match(/^[$€£]?\s*([0-9.]+)\s*k$/i);
    if (kMatch?.[1]) {
      const num = parseFloat(kMatch[1]);
      return isNaN(num) ? null : num * 1000;
    }

    // Strip currency symbols and letters except digits, comma, dot
    const cleaned = trimmed.replace(/[^0-9.,]/g, '');
    if (!cleaned) return null;

    // Handle European format "1.200,00" vs standard "1,200.00"
    if (cleaned.includes('.') && cleaned.includes(',')) {
      if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
        // European "1.200,50" -> 1200.50
        const normalized = cleaned.replace(/\./g, '').replace(',', '.');
        const num = parseFloat(normalized);
        return isNaN(num) ? null : num;
      }
    }

    // Remove commas as thousands separators
    const standard = cleaned.replace(/,/g, '');
    const num = parseFloat(standard);
    return isNaN(num) ? null : num;
  }
  return null;
}

export function normalizeJobType(val: unknown): 'hourly' | 'fixed' | 'unknown' {
  if (!val) return 'unknown';
  const str = String(val).toLowerCase();
  if (str.includes('hourly') || str === '1') return 'hourly';
  if (str.includes('fixed') || str === '2') return 'fixed';
  return 'unknown';
}

export function normalizeSkills(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          return String((item as { name?: string; skill?: string; title?: string }).name ||
            (item as { skill?: string }).skill ||
            (item as { title?: string }).title || '').trim();
        }
        return '';
      })
      .filter((s) => s.length > 0);
  }
  if (typeof val === 'string') {
    return val.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function parseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    // Unix timestamp in seconds vs milliseconds
    const ms = val < 10000000000 ? val * 1000 : val;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function cleanSecurityTags(text: string | null | undefined): string | null {
  if (!text) return null;
  return text
    .replace(/<untrusted_participant_content>/gi, '')
    .replace(/<\/untrusted_participant_content>/gi, '')
    .trim();
}

export function normalizeJob(raw: Record<string, unknown>): NormalizedJob {
  const id = pick<string>(raw, ['id', 'job_id', 'ciphertext', 'uid', 'jobId']);
  if (!id) {
    throw new UnparseableJobError(raw);
  }

  const allRawPaths = new Set(flattenPaths(raw));
  const mapped = new Set<string>();

  const track = <T>(v: T, ...paths: string[]): T => {
    for (const p of paths) {
      if (allRawPaths.has(p)) mapped.add(p);
    }
    return v;
  };

  const rawTitle = String(pick<string>(raw, ['title', 'name', 'jobTitle']) ?? 'Untitled');
  const title = cleanSecurityTags(rawTitle) || 'Untitled';
  const rawDescription = pick<string>(raw, ['description', 'description_snippet', 'snippet', 'details', 'body', 'content.description']) ?? null;
  const description = cleanSecurityTags(rawDescription);

  const rawUrl = pick<string>(raw, ['url', 'link']);
  const url = rawUrl && !rawUrl.endsWith(`/${id}`)
    ? rawUrl
    : `https://www.upwork.com/nx/search/jobs/?q=${encodeURIComponent(title)}`;

  const jobType = normalizeJobType(pick(raw, ['type', 'job_type', 'engagement_type', 'jobType']));
  const budgetAmount = parseMoney(pick(raw, ['budget', 'budget.amount', 'amount', 'budgetAmount']));
  const hourlyMin = parseMoney(pick(raw, ['hourly_rate.min', 'hourlyBudgetMin', 'rate_min', 'hourlyMin', 'hourly_min']));
  const hourlyMax = parseMoney(pick(raw, ['hourly_rate.max', 'hourlyBudgetMax', 'rate_max', 'hourlyMax', 'hourly_max']));

  const result: NormalizedJob = {
    id: String(id),
    title,
    description,
    url,
    jobType,
    category: pick<string>(raw, ['category', 'category2', 'occupations.category.prefLabel']) ?? null,
    subcategory: pick<string>(raw, ['subcategory', 'occupations.subcategories.0.prefLabel']) ?? null,
    skills: normalizeSkills(pick(raw, ['skills', 'tags', 'required_skills', 'attrs'])),
    experienceLevel: pick<string>(raw, ['experience_level', 'experienceLevel', 'tier', 'contractTerms.experienceLevel']) ?? null,
    duration: pick<string>(raw, ['duration', 'durationLabel']) ?? null,
    workload: pick<string>(raw, ['workload', 'engagement']) ?? null,

    budgetAmount,
    hourlyMin,
    hourlyMax,
    currency: pick<string>(raw, ['currency', 'budget.currency', 'contractTerms.fixedPriceContractTerms.amount.currency']) ?? 'USD',

    postedAt: parseDate(pick(raw, ['published_date', 'created_date', 'created_on', 'posted_on', 'publishedAt', 'date_created', 'postedDate'])),
    proposalsCount: pick<number>(raw, ['proposal_count', 'proposals_count', 'applicants', 'totalApplicants', 'proposals']) ?? null,
    interviewing: pick<number>(raw, ['interviewing', 'candidates.interviewing']) ?? null,
    invitesSent: pick<number>(raw, ['invites_sent', 'candidates.invitesSent']) ?? null,

    client: {
      rating: pick<number>(raw, ['client.rating', 'client.feedback', 'buyer.rating', 'clientRating', 'client_record.feedback_score']) ?? null,
      reviewsCount: pick<number>(raw, ['client.total_reviews', 'client.reviews_count', 'buyer.reviews', 'clientReviewsCount', 'client_record.feedback_count']) ?? null,
      totalSpent: parseMoney(pick(raw, ['client.total_spent', 'buyer.stats.total_charges', 'clientTotalSpent', 'client_record.spend_total'])),
      totalHires: pick<number>(raw, ['client.total_hires', 'buyer.stats.total_hires', 'clientTotalHires', 'client_record.contracts_total']) ?? null,
      activeHires: pick<number>(raw, ['client.active_hires', 'buyer.stats.active_hires', 'clientActiveHires', 'client_record.contracts_active']) ?? null,
      hireRate: pick<number>(raw, ['client.hire_rate', 'buyer.stats.hire_rate', 'clientHireRate']) ?? null,
      country: pick<string>(raw, ['client.country', 'buyer.location.country', 'clientCountry', 'client.location.country', 'data.marketplaceJobPosting.clientCompanyPublic.country.name']) ?? null,
      city: pick<string>(raw, ['client.city', 'buyer.location.city', 'clientCity', 'data.marketplaceJobPosting.clientCompanyPublic.city']) ?? null,
      timezone: pick<string>(raw, ['client.timezone', 'buyer.location.timezone', 'data.marketplaceJobPosting.clientCompanyPublic.timezone']) ?? null,
      paymentVerified:
        pick<string>(raw, ['client.verification_status', 'buyer.payment_verification_status']) === 'VERIFIED' ||
        pick<boolean>(raw, ['client.payment_verified', 'clientPaymentVerified']) === true,
      memberSince: parseDate(pick(raw, ['client.member_since', 'buyer.stats.since', 'clientMemberSince'])),
      avgHourlyPaid: parseMoney(pick(raw, ['client.avg_hourly_paid', 'buyer.stats.avg_hourly_rate'])),
    },

    unmappedFields: [...allRawPaths].filter((p) => !mapped.has(p)),
    rawPayload: raw,
    normalizerVersion: NORMALIZER_VERSION,
  };

  return result;
}
