/**
 * Turning "I love Clapham" into a shortlist.
 *
 * This is the switch between the two ways the app can rank areas, and the
 * difference matters (Nick, 2026-08-28):
 *
 *  - ANCHOR-LED, for the majority who already have somewhere in mind. The
 *    similarity engine — arithmetic over measured data, free and instant —
 *    picks the areas most like the one they love. The model then explains
 *    only those. It decides nothing.
 *  - MODEL-LED, the fallback, for someone new to London with nowhere in
 *    mind. There is nothing to be similar TO, so every reachable area goes
 *    to the model with its measurements and the model does the ranking.
 *
 * The fallback is deliberately the expensive path, used by the few. Faking
 * an anchor from someone's stated preferences was considered and rejected:
 * it would mean inventing an ideal area that exists nowhere and calling it
 * evidence, which is the habit this whole rebuild exists to break.
 */

import { allAreaNames, featuresFor } from '../similarity/features';
import { findSimilar, weightsFromPreference, type Coords } from '../similarity/similar';
import type { AreaCards } from '../types';
import type { AreaCandidate } from './prompt';

/**
 * How many areas the model is asked to explain when we have an anchor.
 *
 * Enough to give a real choice, few enough that the prompt stays small —
 * the whole cost saving is in not paying a model to read evidence about
 * areas it would have ranked near the bottom anyway.
 */
export const ANCHOR_SHORTLIST = 15;

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/ & /g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Matches what someone SAYS to an area we hold data for.
 *
 * The Agent hears "Clapham"; the datasets are keyed by station, so the
 * nearest thing we hold is "Clapham Common". Without this the anchor would
 * silently fail to resolve and every user would drop to the expensive path
 * without anyone noticing.
 *
 * Deliberately conservative — an exact name, then a name that begins with
 * what they said, then one that contains it.
 *
 * Where several match, the most PROMINENT wins, measured by how much is
 * around it. "Clapham" matches Common, South and High Street, and picking
 * the shortest name gave Clapham South — an arbitrary answer that happens
 * to be the quietest of the three. Someone saying "Clapham" means the busy
 * bit, and venue count is a fair, data-driven stand-in for that.
 *
 * This is still a guess at an ambiguous word. The conversation should
 * confirm it back — "Clapham, the Common end or nearer the Junction?" —
 * which catches a misheard name at the same time.
 */
export function resolveAreaName(spoken: string, known: string[] = allAreaNames()): string | null {
  const want = normalise(spoken);
  if (!want) return null;

  const exact = known.find((n) => normalise(n) === want);
  if (exact) return exact;

  const mostProminent = (matches: string[]) =>
    matches.length
      ? matches.reduce((a, b) => (prominence(b) > prominence(a) ? b : a))
      : null;

  const startsWith = mostProminent(known.filter((n) => normalise(n).startsWith(`${want} `)));
  if (startsWith) return startsWith;

  // Only match a whole word, so "Kew" never lands on "Kewstoke"-alikes.
  const contains = mostProminent(
    known.filter((n) => new RegExp(`(^| )${escapeRegExp(want)}( |$)`).test(normalise(n))),
  );
  return contains;
}

/**
 * How much of a centre an area is. Venue count where we have it, falling
 * back to a stable shortest-name preference so this never depends on data
 * being present.
 */
function prominence(name: string): number {
  const venues = featuresFor(name).venues;
  return venues ?? 1 / name.length;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * EVERY area they love that we can measure, in the order they named them.
 *
 * People name more than one, and "both" is a real answer to "the Common or
 * the Junction?" (Nick, 2026-08-28). Taking only the first would silently
 * discard the rest.
 */
export function findAnchors(areaCards: AreaCards | undefined, known?: string[]): string[] {
  const out: string[] = [];
  for (const [name, verdict] of Object.entries(areaCards ?? {})) {
    if (verdict !== 'love') continue;
    const resolved = resolveAreaName(name, known);
    if (resolved && !out.includes(resolved)) out.push(resolved);
  }
  return out;
}

/** The primary anchor — the first they named. */
export function findAnchor(areaCards: AreaCards | undefined, known?: string[]): string | null {
  return findAnchors(areaCards, known)[0] ?? null;
}

export interface AnchorShortlist {
  /** The first area they named — what the UI calls the shortlist. */
  anchor: string;
  /** Every area they named that we can measure. */
  anchors: string[];
  candidates: AreaCandidate[];
  /** Which of their anchors each suggestion actually resembles. */
  matchedAnchor: Record<string, string>;
}

/**
 * Narrows the reachable areas to those most like the anchor.
 *
 * Areas they said they HATE are excluded outright — a stated rejection
 * outranks any measurement. Everything else stays eligible, including the
 * anchor's own neighbours: a good match down the road is still a good
 * match, and `findSimilar` already stops one cluster taking every slot.
 */
export function shortlistByAnchor(
  candidates: AreaCandidate[],
  areaCards: AreaCards | undefined,
  anchorReason: string | undefined,
  limit: number = ANCHOR_SHORTLIST,
): AnchorShortlist | null {
  const anchors = findAnchors(areaCards);
  const anchor = anchors[0];
  if (!anchor) return null;

  const byName = new Map(candidates.map((c) => [c.stations[0], c]));
  // Some candidates key on a neighbourhood name rather than their station.
  for (const c of candidates) if (!byName.has(c.neighbourhood)) byName.set(c.neighbourhood, c);

  const hated = Object.entries(areaCards ?? {})
    .filter(([, v]) => v === 'hate')
    .map(([n]) => resolveAreaName(n))
    .filter((n): n is string => n !== null);

  /**
   * With several anchors, each candidate is scored against ALL of them and
   * keeps its BEST match — never an average.
   *
   * Averaging is the tempting choice and it is wrong. The midpoint of
   * Clapham and Hampstead is a place that resembles neither, so someone who
   * likes both would be sent somewhere they like less than either. Taking
   * the best match returns places like one OR the other, which is what "I
   * like both" actually means — and it lets us say WHICH one each
   * suggestion resembles, rather than presenting a blend nobody asked for.
   *
   * It also makes "the Common or the Junction?" answerable with "either":
   * both become anchors, and anywhere resembling either one qualifies.
   */
  const weights = anchorReason ? weightsFromPreference(anchorReason) : {};
  const eligible = [...byName.keys()];
  const coords = coordsFrom(candidates);

  const best = new Map<string, { score: number; anchor: string }>();
  for (const from of anchors) {
    // Ask for more than we need per anchor, since the merge below re-sorts
    // across all of them and a per-anchor cut would bias toward the first.
    const matches = findSimilar(from, {
      limit: limit * anchors.length + limit,
      weights,
      exclude: [...hated, ...anchors],
      candidates: eligible,
      coords,
    });
    for (const m of matches) {
      const held = best.get(m.name);
      if (!held || m.score > held.score) best.set(m.name, { score: m.score, anchor: from });
    }
  }

  const merged = [...best.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit);

  const picked: AreaCandidate[] = [];
  const matchedAnchor: Record<string, string> = {};
  for (const [name, { anchor: from }] of merged) {
    const candidate = byName.get(name);
    if (candidate && !picked.includes(candidate)) {
      picked.push(candidate);
      matchedAnchor[candidate.neighbourhood] = from;
    }
  }

  // If similarity somehow matched nothing usable, say so rather than
  // returning an empty shortlist the caller would render as "no areas".
  if (picked.length === 0) return null;
  return { anchor, anchors, candidates: picked, matchedAnchor };
}

function coordsFrom(candidates: AreaCandidate[]): Record<string, Coords> {
  const out: Record<string, Coords> = {};
  for (const c of candidates) {
    out[c.stations[0]] = { lat: c.lat, lng: c.lng };
    out[c.neighbourhood] = { lat: c.lat, lng: c.lng };
  }
  return out;
}
