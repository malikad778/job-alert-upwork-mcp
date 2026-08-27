import { describe, expect, it } from 'vitest';
import { classifyWhatsAppCommand, parseWhatsAppCommand } from '../src/whatsapp/commands';

describe('WhatsApp automation commands', () => {
  it.each(['stop', 'pause', 'mute', 'off', 'halt', 'pausen', 'pause now'])('classifies %s as stop', (input) => {
    expect(classifyWhatsAppCommand(input)).toBe('stop');
  });

  it.each(['start', 'resume', 'more', 'on', 'continue', 'start alerts'])('classifies %s as start', (input) => {
    expect(classifyWhatsAppCommand(input)).toBe('start');
  });

  it('does not treat unrelated text as an automation command', () => {
    expect(classifyWhatsAppCommand('proposal for this job')).toBeNull();
  });

  it.each(['status', 'state', 'info', 'stats'])('classifies %s as status', (input) => {
    expect(classifyWhatsAppCommand(input)).toBe('status');
  });

  it.each(['help', 'commands', 'menu', '?'])('classifies %s as help', (input) => {
    expect(classifyWhatsAppCommand(input)).toBe('help');
  });

  it.each([
    ['rate 3', 3],
    ['limit 12', 12],
    ['max 1', 1],
    ['5 per hour', 5],
    ['2/hr', 2],
  ])('parses %s as a rate change', (input, expected) => {
    expect(parseWhatsAppCommand(input as string)).toEqual({ command: 'rate', value: expected });
  });

  it('does not read a control word buried mid-sentence as a command', () => {
    // Commands are anchored to the start so job instructions stay job instructions.
    expect(classifyWhatsAppCommand('we need to stop the data pipeline')).toBeNull();
    expect(classifyWhatsAppCommand('bid $50/hr and start next week')).toBeNull();
  });
});