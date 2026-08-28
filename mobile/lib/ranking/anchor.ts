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
 * The area someone loves that we can actually measure, or null.
 *
 * Takes the FIRST loved area that resolves — the Agent is told to ask for
 * where they are looking as its opening question, so the earliest entry is
 * the one they volunteered rather than one drawn out later.
 */
export function findAnchor(areaCards: AreaCards | undefined, known?: string[]): string | null {
  for (const [name, verdict] of Object.entries(areaCards ?? {})) {
    if (verdict !== 'love') continue;
    const resolved = resolveAreaName(name, known);
    if (resolved) return resolved;
  }
  return null;
}

export interface AnchorShortlist {
  anchor: string;
  candidates: AreaCandidate[];
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
  const anchor = findAnchor(areaCards);
  if (!anchor) return null;

  const byName = new Map(candidates.map((c) => [c.stations[0], c]));
  // Some candidates key on a neighbourhood name rather than their station.
  for (const c of candidates) if (!byName.has(c.neighbourhood)) byName.set(c.neighbourhood, c);

  const hated = Object.entries(areaCards ?? {})
    .filter(([, v]) => v === 'hate')
    .map(([n]) => resolveAreaName(n))
    .filter((n): n is string => n !== null);

  const matches = findSimilar(anchor, {
    limit,
    weights: anchorReason ? weightsFromPreference(anchorReason) : {},
    exclude: [...hated, anchor],
    candidates: [...byName.keys()],
    coords: coordsFrom(candidates),
  });

  const picked: AreaCandidate[] = [];
  for (const m of matches) {
    const candidate = byName.get(m.name);
    if (candidate && !picked.includes(candidate)) picked.push(candidate);
  }

  // If similarity somehow matched nothing usable, say so rather than
  // returning an empty shortlist the caller would render as "no areas".
  if (picked.length === 0) return null;
  return { anchor, candidates: picked };
}

function coordsFrom(candidates: AreaCandidate[]): Record<string, Coords> {
  const out: Record<string, Coords> = {};
  for (const c of candidates) {
    out[c.stations[0]] = { lat: c.lat, lng: c.lng };
    out[c.neighbourhood] = { lat: c.lat, lng: c.lng };
  }
  return out;
}
