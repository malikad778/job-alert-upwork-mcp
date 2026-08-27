import type { NormalizedJob } from '../upwork/normalize.ts';
import type { MatchResult } from '../matching/score.ts';
import { resolveClientName } from '../upwork/client-name-extractor.ts';

/**
 * Truncates text at a clean word boundary with an ellipsis.
 */
export function truncateWords(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  const sub = text.slice(0, maxLength - 1);
  const lastSpace = sub.lastIndexOf(' ');
  return (lastSpace > 0 ? sub.slice(0, lastSpace) : sub).trim() + '…';
}

/**
 * Strips zero-width characters, control chars, and unescapes HTML/XML tags from job text.
 */
export function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<\/?untrusted_participant_content>/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\u200B-\u200D\uFEFF\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
}

/**
 * Calculates human-readable relative time (e.g. "12m ago", "1h 20m ago", "Just now")
 */
export function formatTimeAgo(date?: Date | string | null): string {
  if (!date) return 'Recently';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0 || isNaN(diffMs)) return 'Just now';
  const mins = Math.floor(diffMs / (60 * 1000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Formats budget/rate string cleanly
 */
export function formatBudget(job: NormalizedJob): string {
  if (job.jobType === 'hourly') {
    if (job.hourlyMin && job.hourlyMax) {
      return `$${job.hourlyMin}–$${job.hourlyMax}/hr`;
    }
    if (job.hourlyMax) return `$${job.hourlyMax}/hr`;
    if (job.hourlyMin) return `From $${job.hourlyMin}/hr`;
    return 'Hourly (Not specified)';
  }
  if (job.jobType === 'fixed') {
    if (job.budgetAmount) {
      return `$${job.budgetAmount.toLocaleString('en-US')} fixed`;
    }
    return 'Fixed Price (Budget not specified)';
  }
  return 'Not specified';
}

export type TemplateStyle = 'executive' | 'compact' | 'classic';

/**
 * Formats an executive, clean WhatsApp alert message without emoji spam.
 * Displays match score, exact posted relative time, rate, client stats, and clean apply link.
 */
export function formatJobAlertMessage(
  job: NormalizedJob,
  match: MatchResult,
  profileName: string,
  style: TemplateStyle = 'executive',
): string {
  const title = sanitizeText(job.title);
  const budget = formatBudget(job);
  const timeAgo = formatTimeAgo(job.postedAt);
  const description = truncateWords(sanitizeText(job.description || 'No description provided.'), 280);
  const skillsStr = job.skills.slice(0, 5).join(', ');
  const proposals = job.proposalsCount != null ? ` • ${job.proposalsCount} proposals` : '';

  // Clean client info assembly
  const clientLines: string[] = [];
  const clientNameResolved = resolveClientName({
    description: job.description,
  });

  if (clientNameResolved.name) {
    clientLines.push(`Client Name: ${clientNameResolved.name}`);
  }

  if (job.client.rating != null || job.client.totalSpent != null) {
    const ratingStr = job.client.rating != null ? `${job.client.rating}/5.0` : '';
    const reviewsStr = job.client.reviewsCount ? ` (${job.client.reviewsCount} reviews)` : '';
    const spentStr = job.client.totalSpent != null ? `$${job.client.totalSpent.toLocaleString('en-US')}+ spent` : '';
    const stats = [ratingStr ? `Rating: ${ratingStr}${reviewsStr}` : '', spentStr].filter(Boolean).join(' • ');
    if (stats) clientLines.push(stats);
  }

  const locationParts = [job.client.city, job.client.country].filter(Boolean);
  if (locationParts.length > 0) {
    clientLines.push(`Location: ${locationParts.join(', ')}`);
  }

  if (job.client.paymentVerified === true) {
    clientLines.push('Payment: Verified');
  }

  const clientSection = clientLines.length > 0
    ? `\n*Client Details:*\n${clientLines.map((l) => `• ${l}`).join('\n')}\n`
    : '';

  if (style === 'compact') {
    const msg = [
      `*UPWORK MATCH: ${match.score}/100* (${profileName})`,
      `*${title}*`,
      `Rate: ${budget} • Posted: ${timeAgo}${proposals}`,
      skillsStr ? `Skills: ${skillsStr}` : '',
      clientLines.length > 0 ? `Client: ${clientLines.join(' | ')}` : '',
      `Link: ${job.url}`,
    ].filter(Boolean).join('\n');
    return msg.slice(0, 4000);
  }

  // Default Executive Sleek Style
  const directApplyUrl = `https://www.upwork.com/ab/proposals/job/${job.id}/apply/`;

  const message = [
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `*UPWORK JOB RADAR* • *${match.score}/100 Match*`,
    `Profile: ${profileName}`,
    `━━━━━━━━━━━━━━━━━━━━━━\n`,
    `*${title}*\n`,
    `• *Budget:* ${budget}`,
    `• *Posted:* ${timeAgo}${proposals}`,
    skillsStr ? `• *Skills:* ${skillsStr}\n` : '\n',
    `*Summary:*`,
    `${description}\n`,
    clientSection,
    `*Open in Upwork App:*`,
    `${directApplyUrl}`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join('\n');

  return message.slice(0, 4000);
}
