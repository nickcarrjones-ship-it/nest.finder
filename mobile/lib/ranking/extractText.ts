/**
 * Pulls the text out of an Anthropic response.
 *
 * Deliberately NOT content[0].text, which is what both clients used to do
 * and which failed on device with "AI proxy returned no text content"
 * (Nick, 2026-08-26). content is a LIST of blocks and a text block is not
 * guaranteed to be first or to be the only one — a non-text block ahead of
 * it silently produced undefined. Joining every text block is correct for
 * any shape the API returns.
 *
 * Returns null when there genuinely is no text, and callers report
 * stop_reason alongside it: "max_tokens" means the reply was cut off, which
 * is a completely different fix from an empty response.
 *
 * Lives apart from the clients so it can be tested: they import Firebase,
 * which cannot load outside React Native.
 */
export function extractText(data: unknown): string | null {
  const blocks = (data as { content?: unknown })?.content;
  if (!Array.isArray(blocks)) return null;
  const text = blocks
    .filter((b): b is { type: string; text: string } =>
      Boolean(b) && typeof b === 'object' && (b as { type?: unknown }).type === 'text' &&
      typeof (b as { text?: unknown }).text === 'string')
    .map((b) => b.text)
    .join('');
  return text.trim() ? text : null;
}
