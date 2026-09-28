/**
 * Questions the Agent could not answer from our data, kept so Nick can see
 * what people actually ask for (Nick, 2026-09-28) and decide what data to
 * add next. PURE, so it runs under plain Node tests; the write lives in
 * unansweredSync.ts.
 *
 * Only questions our data could NOT answer are kept — never the whole
 * conversation — and only after anything that looks like it identifies a
 * person or a home is stripped out. The rest of the privacy story (no uid,
 * 90-day expiry, owner-only read) is in database.rules.json and
 * functions/index.js.
 */

export const MAX_QUESTION_LENGTH = 300;
export const RETENTION_DAYS = 90;

/**
 * Remove what could identify someone. Deliberately greedy — a stripped
 * street name costs Nick a little context, a kept one is somebody's address.
 */
export function scrubQuestion(raw: string): string {
  let t = raw;
  // Emails, then phone numbers (UK mobiles, landlines, +44 forms).
  t = t.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]');
  t = t.replace(/(\+44\s?|0)(\d[\s-]?){9,10}\d/g, '[phone]');
  // Full or partial UK postcodes: "SW4 7AB", "sw4", "SE15".
  t = t.replace(/\b[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?\b/gi, '[postcode]');
  // A house number and the street it belongs to: "12 Elm Road", "Flat 3".
  t = t.replace(
    /\b(flat|apartment|apt|unit|no\.?)\s*\d+[a-z]?\b/gi,
    '[address]',
  );
  t = t.replace(
    /\b\d+[a-z]?\s+(?:[A-Z][a-z]+\s+){0,3}(road|rd|street|st|avenue|ave|lane|ln|grove|close|gardens|gdns|place|pl|crescent|terrace|way|drive|court|square|mews|hill|walk|row|rise)\b/gi,
    '[address]',
  );
  // Any other long number (bank details, reference numbers).
  t = t.replace(/\b\d{5,}\b/g, '[number]');
  return t.replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION_LENGTH);
}

export interface UnansweredRow {
  q: string;
  /** Which kind of answer it went to: an area, a comparison, or general. */
  kind: 'area' | 'compare' | 'general';
  /** The areas it was about, if any — useful context, not personal. */
  areas?: string[];
}

export function unansweredRow(
  question: string,
  kind: UnansweredRow['kind'],
  areas: string[] = [],
): UnansweredRow | null {
  const q = scrubQuestion(question);
  if (q.length < 3) return null;
  const row: UnansweredRow = { q, kind };
  if (areas.length) row.areas = areas.slice(0, 2).map((a) => a.slice(0, 80));
  return row;
}
