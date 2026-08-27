import { describe, it, expect } from 'vitest';
import { formatJobAlertMessage, formatBudget, truncateWords, formatTimeAgo } from '../src/whatsapp/templates';
import { isInQuietHours } from '../src/whatsapp/quiet-hours';
import type { NormalizedJob } from '../src/upwork/normalize';
import type { MatchResult } from '../src/matching/score';

describe('WhatsApp Templates & Executive Alert Formatter (§14)', () => {
  const dummyJob: NormalizedJob = {
    id: 'job-123',
    title: 'Senior Laravel Developer for SaaS REST API',
    description: 'We need a highly skilled developer to architect multi-tenant APIs with PostgreSQL.',
    url: 'https://www.upwork.com/jobs/job-123',
    jobType: 'hourly',
    skills: ['Laravel', 'PHP', 'PostgreSQL'],
    budgetAmount: null,
    hourlyMin: 35,
    hourlyMax: 60,
    currency: 'USD',
    postedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 mins ago
    proposalsCount: 3,
    client: {
      rating: 4.95,
      reviewsCount: 32,
      totalSpent: 45000,
      country: 'United States',
      city: 'Austin',
      paymentVerified: true,
    },
    unmappedFields: [],
    rawPayload: {},
    normalizerVersion: 1,
  };

  const dummyMatch: MatchResult = {
    matched: true,
    score: 92,
    breakdown: {
      titleKeywords: 30,
      descKeywords: 15,
      skills: 20,
      budget: 15,
      clientQuality: 10,
      clientSpend: 2,
      freshness: 0,
      competition: 0,
    },
    matchedKeywords: ['laravel', 'api'],
    rejectedReason: null,
  };

  it('formats clean executive WhatsApp message with posted relative time and client location', () => {
    const msg = formatJobAlertMessage(dummyJob, dummyMatch, 'Laravel Backend');
    expect(msg).toContain('UPWORK JOB RADAR');
    expect(msg).toContain('92/100 Match');
    expect(msg).toContain('Senior Laravel Developer for SaaS REST API');
    expect(msg).toContain('$35–$60/hr');
    expect(msg).toContain('15m ago');
    expect(msg).toContain('Austin, United States');
    expect(msg).toContain('Rating: 4.95/5.0 (32 reviews)');
    // Alerts link straight to the apply screen so the mobile app deep link opens
    // the proposal form rather than the job listing.
    expect(msg).toContain('https://www.upwork.com/ab/proposals/job/job-123/apply/');
  });

  it('calculates human-readable relative time correctly', () => {
    expect(formatTimeAgo(new Date(Date.now() - 5 * 60 * 1000))).toBe('5m ago');
    expect(formatTimeAgo(new Date(Date.now() - 75 * 60 * 1000))).toBe('1h 15m ago');
    expect(formatTimeAgo(new Date(Date.now() - 30 * 1000))).toBe('Just now');
  });

  it('omits client section entirely when no client data is present', () => {
    const noClientJob: NormalizedJob = {
      ...dummyJob,
      client: {
        rating: null,
        reviewsCount: null,
        totalSpent: null,
        country: null,
        city: null,
        paymentVerified: null,
      },
    };
    const msg = formatJobAlertMessage(noClientJob, dummyMatch, 'Laravel Backend');
    expect(msg).not.toContain('*Client Details:*');
  });

  it('calculates quiet hours across midnight (23:00 - 08:00)', () => {
    const night = new Date('2026-08-25T18:30:00Z'); // 23:30 in Asia/Karachi (UTC+5)
    expect(isInQuietHours(night, 'Asia/Karachi', '23:00', '08:00')).toBe(true);

    const day = new Date('2026-08-25T08:00:00Z'); // 13:00 in Asia/Karachi (UTC+5)
    expect(isInQuietHours(day, 'Asia/Karachi', '23:00', '08:00')).toBe(false);
  });
});
