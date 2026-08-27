/**
 * Extracts and parses all JSON content blocks from an MCP tool result.
 * Never assumes block [0] is the JSON payload.
 */
export function extractJsonBlocks(result: { content?: unknown[] }): unknown[] {
  const out: unknown[] = [];
  for (const block of result?.content ?? []) {
    const text = (block as { text?: string })?.text;
    if (typeof text !== 'string') continue;
    try {
      out.push(JSON.parse(text));
    } catch {
      // plain text block or summary, ignore
    }
  }
  return out;
}
