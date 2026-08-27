/**
 * Common English first names or capitalized name tokens regex
 */
const COMMON_NON_NAMES = new Set([
  'upwork',
  'freelancer',
  'client',
  'developer',
  'team',
  'company',
  'agency',
  'project',
  'work',
  'sir',
  'madam',
  'hello',
  'thanks',
  'regards',
  'cheers',
  'laravel',
  'react',
  'python',
  'wordpress',
  'google',
  'aws',
  'api',
  'expert',
  'boss',
  'owner',
]);

export type ExtractedClientName = {
  name: string | null;
  source: 'freelancer_to_client_review' | 'description_signature' | 'description_intro' | null;
  confidence: 'high' | 'medium' | 'low';
  contextSnippet?: string;
};

/**
 * Validates if a matched string token is a plausible personal name
 */
function isValidName(token?: string): boolean {
  if (!token) return false;
  const cleaned = token.replace(/[^a-zA-Z]/g, '').trim();
  if (cleaned.length < 2 || cleaned.length > 20) return false;
  if (COMMON_NON_NAMES.has(cleaned.toLowerCase())) return false;
  // Must start with uppercase letter
  return /^[A-Z][a-z]+$/.test(cleaned);
}

/**
 * Extracts client name from the review GIVEN TO THE CLIENT (written by the freelancer).
 *
 * CRITICAL SAFETY RULE:
 * Only inspect feedback written BY the freelancer TO the client.
 * Never inspect feedback written by the client to the freelancer (which contains the freelancer's name).
 */
export function extractClientNameFromReview(reviewToClientText: string): ExtractedClientName | null {
  if (!reviewToClientText || typeof reviewToClientText !== 'string') return null;

  const patterns = [
    // "Working with Alex was great" / "Working with Alex has been a pleasure"
    /(?:working with|worked with)\s+([A-Z][a-z]+)/i,
    // "Alex was a great client" / "Alex is a wonderful client"
    /([A-Z][a-z]+)\s+(?:is|was)\s+(?:a\s+)?(?:great|wonderful|fantastic|amazing|excellent|awesome|very good|superb|helpful|responsive|nice)\s+client/i,
    // "Alex is very communicative" / "Alex provided clear instructions"
    /([A-Z][a-z]+)\s+(?:is|was)\s+(?:very|always|extremely)?\s*(?:communicative|clear|cooperative|professional|prompt|helpful|easy to work with)/i,
    // "Alex provided clear specifications" / "Alex gave clear requirements"
    /([A-Z][a-z]+)\s+(?:provided|gave|shared|had)\s+(?:clear|detailed|good)/i,
    // "Thanks Alex!" / "Thank you Alex!"
    /(?:thanks|thank you|thanks a lot),?\s+([A-Z][a-z]+)[!.]/i,
    // "Highly recommend Alex"
    /(?:highly recommend|would recommend)\s+([A-Z][a-z]+)/i,
    // "Alex is an awesome person"
    /([A-Z][a-z]+)\s+is\s+an?\s+(?:awesome|great|pleasure)/i,
  ];

  for (const regex of patterns) {
    const match = reviewToClientText.match(regex);
    if (match && match[1] && isValidName(match[1])) {
      const name = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      return {
        name,
        source: 'freelancer_to_client_review',
        confidence: 'high',
        contextSnippet: match[0],
      };
    }
  }

  return null;
}

/**
 * Extracts client name from job description introductions or sign-offs
 */
export function extractClientNameFromDescription(description: string): ExtractedClientName | null {
  if (!description || typeof description !== 'string') return null;

  // 1. Introductions: "Hi, my name is Alex" / "I'm Alex from Acme"
  const introPatterns = [
    /(?:my name is|i'm|i am)\s+([A-Z][a-z]+)(?:\s+(?:from|at|with|and))?/i,
    /(?:this is)\s+([A-Z][a-z]+)\s+from\s+[A-Z][a-z]+/i,
  ];

  for (const regex of introPatterns) {
    const match = description.match(regex);
    if (match && match[1] && isValidName(match[1])) {
      const name = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      return {
        name,
        source: 'description_intro',
        confidence: 'high',
        contextSnippet: match[0],
      };
    }
  }

  // 2. Signatures at the end of job description: "Best regards, Alex" / "Thanks, Alex" / "- Alex"
  const signaturePatterns = [
    /(?:best regards|warm regards|kind regards|regards|cheers|best|sincerely|thanks|thank you)[,\s]+([A-Z][a-z]+)\s*$/im,
    /(?:-\s*([A-Z][a-z]+))\s*$/m,
  ];

  for (const regex of signaturePatterns) {
    const match = description.match(regex);
    if (match && match[1] && isValidName(match[1])) {
      const name = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      return {
        name,
        source: 'description_signature',
        confidence: 'medium',
        contextSnippet: match[0],
      };
    }
  }

  return null;
}

/**
 * Unified resolver for finding client name across reviews and description
 */
export function resolveClientName(params: {
  description?: string | null;
  reviewsToClient?: string[];
}): ExtractedClientName {
  // 1. Check reviews given to client first (highest real-world accuracy on Upwork)
  if (params.reviewsToClient && params.reviewsToClient.length > 0) {
    for (const review of params.reviewsToClient) {
      const extracted = extractClientNameFromReview(review);
      if (extracted && extracted.name) {
        return extracted;
      }
    }
  }

  // 2. Check job description intros and signatures
  if (params.description) {
    const extracted = extractClientNameFromDescription(params.description);
    if (extracted && extracted.name) {
      return extracted;
    }
  }

  return {
    name: null,
    source: null,
    confidence: 'low',
  };
}
