import { describe, it, expect } from 'vitest';
import { parseMoney, normalizeJob, normalizeSkills } from '../src/upwork/normalize';

describe('Normalizer and Money Parser (Appendix C)', () => {
  it('parses various money representations correctly', () => {
    expect(parseMoney('$1,200.00')).toBe(1200);
    expect(parseMoney(1200)).toBe(1200);
    expect(parseMoney('1200')).toBe(1200);
    expect(parseMoney('$25/hr')).toBe(25);
    expect(parseMoney({ amount: 1200, currency: 'USD' })).toBe(1200);
    expect(parseMoney('€1.200,00')).toBe(1200);
    expect(parseMoney('1.2k')).toBe(1200);
    expect(parseMoney('$50k')).toBe(50000);
  });

  it('returns null (never 0) for unknown, TBD, or unparseable money', () => {
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('N/A')).toBeNull();
    expect(parseMoney('TBD')).toBeNull();
    expect(parseMoney('Not specified')).toBeNull();
  });

  it('normalizes skill arrays with object or string formats', () => {
    expect(normalizeSkills(['PHP', 'Laravel', 'TypeScript'])).toEqual(['PHP', 'Laravel', 'TypeScript']);
    expect(normalizeSkills([{ name: 'React' }, { skill: 'Node.js' }])).toEqual(['React', 'Node.js']);
    expect(normalizeSkills('WordPress, MySQL, AWS')).toEqual(['WordPress', 'MySQL', 'AWS']);
  });

  it('normalizes typical Upwork MCP search results', () => {
    const raw = {
      ciphertext: '~021985123456789',
      title: 'Senior Laravel Developer for SaaS',
      snippet: 'We need an expert to build backend REST APIs.',
      type: 'Hourly',
      hourly_rate: { min: 35, max: 60 },
      skills: ['Laravel', 'PHP', 'PostgreSQL'],
      created_on: '2026-08-25T08:00:00Z',
      client: {
        rating: 4.9,
        total_spent: '$47,200',
        country: 'United States',
        payment_verified: true,
      },
    };

    const job = normalizeJob(raw);
    expect(job.id).toBe('~021985123456789');
    expect(job.title).toBe('Senior Laravel Developer for SaaS');
    expect(job.jobType).toBe('hourly');
    expect(job.hourlyMin).toBe(35);
    expect(job.hourlyMax).toBe(60);
    expect(job.skills).toEqual(['Laravel', 'PHP', 'PostgreSQL']);
    expect(job.client.rating).toBe(4.9);
    expect(job.client.totalSpent).toBe(47200);
    expect(job.client.country).toBe('United States');
    expect(job.client.paymentVerified).toBe(true);
  });
});
