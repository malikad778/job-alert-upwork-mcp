export type WhatsAppCommand = 'stop' | 'start' | 'next' | 'status' | 'help' | 'rate' | null;

export type ParsedWhatsAppCommand = {
  command: WhatsAppCommand;
  /** For 'rate': the requested alerts-per-hour, e.g. "rate 2". */
  value?: number;
};

/**
 * Parses an inbound WhatsApp message into a control command.
 *
 * Anchored to the start of the message so a job instruction that merely
 * mentions a word ("stop-gap tooling needed") is not read as a control command.
 */
export function parseWhatsAppCommand(input: string): ParsedWhatsAppCommand {
  const text = input.trim().toLowerCase();

  // "rate 3" / "limit 3" / "3 per hour" - adjust hourly cap inline.
  const rateMatch = text.match(/^(?:rate|limit|max)\s+(\d{1,3})$/) ?? text.match(/^(\d{1,3})\s*(?:\/|per)\s*(?:h|hr|hour)$/);
  if (rateMatch) return { command: 'rate', value: Number(rateMatch[1]) };

  if (/^(stop|pause|mute|off|halt|pausen)(\s|$)/.test(text)) return { command: 'stop' };
  if (/^(more|start|all|resume|auto|on|continue|go)(\s|$)/.test(text)) return { command: 'start' };
  if (/^(1|next|job|lead)$/.test(text)) return { command: 'next' };
  if (/^(status|state|info|stats)(\s|$)/.test(text)) return { command: 'status' };
  if (/^(help|commands|menu|\?)(\s|$)/.test(text)) return { command: 'help' };

  return { command: null };
}

/** Back-compat wrapper for callers that only need the command kind. */
export function classifyWhatsAppCommand(input: string): WhatsAppCommand {
  return parseWhatsAppCommand(input).command;
}

export const WHATSAPP_HELP_TEXT = [
  '🤖 *Upwork MCP - Commands*',
  '',
  '*stop* - pause automatic alerts (queue is kept)',
  '*start* - resume automatic alerts',
  '*1* - send me the next queued job now',
  '*status* - show pause state, pacing and queue size',
  '*rate 3* - allow at most 3 alerts per hour',
  '*help* - show this message',
  '',
  'Reply to any job alert with *proposal* (or instructions like *bid $50/hr*) to get a tailored cover letter.',
].join('\n');
