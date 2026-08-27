import { describe, it, expect } from 'vitest';
import {
  extractClientNameFromReview,
  extractClientNameFromDescription,
  resolveClientName,
} from '../src/upwork/client-name-extractor';

describe('Client Name Extractor (§10.4 & Review Analysis)', () => {
  it('extracts client name from review given TO the client by freelancer', () => {
    const review1 = 'Working with David was a pleasure! He was always communicative and clear with requirements.';
    const res1 = extractClientNameFromReview(review1);
    expect(res1?.name).toBe('David');
    expect(res1?.source).toBe('freelancer_to_client_review');

    const review2 = 'Sarah is a wonderful client. Very prompt with feedback and payment.';
    const res2 = extractClientNameFromReview(review2);
    expect(res2?.name).toBe('Sarah');

    const review3 = 'Thank you Michael! Highly recommend working with him.';
    const res3 = extractClientNameFromReview(review3);
    expect(res3?.name).toBe('Michael');
  });

  it('rejects technical keywords and common nouns from being treated as names', () => {
    const techReview = 'Working with Laravel was very easy on this project.';
    const res = extractClientNameFromReview(techReview);
    expect(res).toBeNull();

    const devReview = 'Working with Developer was great.';
    const res2 = extractClientNameFromReview(devReview);
    expect(res2).toBeNull();
  });

  it('extracts client name from description intros', () => {
    const desc = 'Hello! My name is Alex and I am looking for a full stack engineer to build our MVP.';
    const res = extractClientNameFromDescription(desc);
    expect(res?.name).toBe('Alex');
    expect(res?.source).toBe('description_intro');
  });

  it('extracts client name from description sign-offs', () => {
    const desc = 'We are looking for a Next.js expert to help optimize our application performance.\n\nBest regards,\nJessica';
    const res = extractClientNameFromDescription(desc);
    expect(res?.name).toBe('Jessica');
    expect(res?.source).toBe('description_signature');
  });

  it('resolveClientName prioritizes review given to client over signatures', () => {
    const res = resolveClientName({
      description: 'Need a developer.\nThanks,\nAdmin',
      reviewsToClient: ['Working with Robert was awesome! Clear instructions and fast payment.'],
    });
    expect(res.name).toBe('Robert');
    expect(res.source).toBe('freelancer_to_client_review');
  });
});
