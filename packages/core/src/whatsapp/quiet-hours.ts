function toMinutes(hhMm: string): number {
  const [h, m] = hhMm.split(':').map((s) => parseInt(s, 10));
  return (h || 0) * 60 + (m || 0);
}

/**
 * Calculates whether a given timestamp falls within the user's quiet hours in their local timezone.
 * Uses native Intl.DateTimeFormat for zero-dependency, ultra-fast timezone conversions.
 * Supports midnight wrapping (e.g., 23:00 - 08:00) and same-day intervals (e.g., 13:00 - 15:00).
 */
export function isInQuietHours(now: Date, tz: string, start: string, end: string): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'UTC',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const hourPart = parts.find((p) => p.type === 'hour')?.value;
    const minutePart = parts.find((p) => p.type === 'minute')?.value;

    const hour = hourPart ? parseInt(hourPart, 10) % 24 : now.getUTCHours();
    const minute = minutePart ? parseInt(minutePart, 10) : now.getUTCMinutes();

    const mins = hour * 60 + minute;
    const s = toMinutes(start);
    const e = toMinutes(end);

    return s <= e
      ? mins >= s && mins < e // Same day, e.g. 09:00 - 17:00
      : mins >= s || mins < e; // Wraps midnight, e.g. 23:00 - 08:00
  } catch {
    // If timezone is invalid, fallback to UTC
    const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
    const s = toMinutes(start);
    const e = toMinutes(end);
    return s <= e ? mins >= s && mins < e : mins >= s || mins < e;
  }
}
