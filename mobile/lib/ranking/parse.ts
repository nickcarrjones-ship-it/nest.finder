/**
 * Parsing the model's JSON response. Kept separate from the network call so
 * it can be tested against real and malformed sample text without a live
 * request — the web app's classifier has a known "parse fail" class of bug
 * (project_session_2026_07_03: "stuck AI spinner fixed — parse fail +
 * max_tokens"), so this assumes the response WILL sometimes be imperfect
 * rather than trusting it blindly.
 */

export interface RankedArea {
  neighbourhood: string;
  score: number;
  reason: string;
  confidence: 'high' | 'low';
}

export interface ParseResult {
  ranked: RankedArea[];
  /** True if the JSON was recovered from a wrapped/truncated response rather than parsed cleanly. */
  recovered: boolean;
}

function extractJsonObject(raw: string): string | null {
  // Models occasionally wrap JSON in prose or a code fence despite
  // instructions not to — take the outermost {...} rather than assuming
  // the whole string is clean JSON.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

export function parseRankingResponse(raw: string, allowed?: Set<string>): ParseResult {
  const direct = tryParse(raw);
  if (direct) return { ranked: validate(direct, allowed), recovered: false };

  const extracted = extractJsonObject(raw);
  if (extracted) {
    const recovered = tryParse(extracted);
    if (recovered) return { ranked: validate(recovered, allowed), recovered: true };
  }

  // Nothing usable — an empty ranking is a safe failure. The caller should
  // fall back to the unranked reachable-area list, not show an error state
  // for something as recoverable as one bad AI response.
  return { ranked: [], recovered: false };
}

/**
 * Only areas we actually asked about may come back.
 *
 * Nothing checked this before, so any string the model produced went
 * straight into the shortlist and onto the map as a pin. Two ways that
 * bites: a model can invent a plausible-sounding London neighbourhood, and
 * the prompt lists the household's PREFERENCES as "- " bullets directly
 * above the "- " list of areas — a simulated model reading it picked up
 * "prefers a buzzy high street" as a place (found 2026-08-28).
 *
 * Matching is forgiving about case and punctuation but never about
 * identity: an area that was not in the batch is dropped, because the
 * alternative is showing someone a pin for somewhere that does not exist.
 */
function validate(list: RankedArea[], allowed: Set<string> | undefined): RankedArea[] {
  if (!allowed || allowed.size === 0) return list;
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const byKey = new Map([...allowed].map((n) => [key(n), n]));
  const out: RankedArea[] = [];
  for (const item of list) {
    const real = byKey.get(key(item.neighbourhood));
    // Restore OUR spelling, so downstream lookups by name always hit.
    if (real) out.push({ ...item, neighbourhood: real });
  }
  return out;
}

function tryParse(text: string): RankedArea[] | null {
  try {
    const data = JSON.parse(text);
    const list = data?.ranked;
    if (!Array.isArray(list)) return null;
    const clean: RankedArea[] = [];
    for (const item of list) {
      if (typeof item?.neighbourhood !== 'string') continue;
      if (typeof item?.reason !== 'string') continue;
      const score = Number(item.score);
      if (!Number.isFinite(score)) continue;
      clean.push({
        neighbourhood: item.neighbourhood,
        score: Math.max(1, Math.min(10, score)),
        reason: item.reason,
        confidence: item.confidence === 'low' ? 'low' : 'high',
      });
    }
    return clean;
  } catch {
    return null;
  }
}
