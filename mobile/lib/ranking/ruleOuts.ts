import type { AreaCards } from '../types';
import type { AreaCandidate } from './prompt';

/**
 * Areas someone has ruled out are REMOVED, in code, before anything ranks
 * them.
 *
 * This existed only as a line in the ranking prompt — "a hated area should
 * not appear even if the numbers look good" — which is a request, not a
 * guarantee, and nothing enforced it. Worse, the walk-budget placeholder
 * that shows before the model has ranked anything never saw the prompt at
 * all, so a ruled-out area could be the FIRST thing suggested. Nick ruled
 * out Canary Wharf and was shown Canary Wharf, Poplar, Blackwall,
 * Westferry, Langdon Park and Cubitt Town (2026-08-30).
 *
 * A rule-out is the one preference where getting it wrong is unforgivable:
 * every other answer shifts an ordering, this one is someone saying "not
 * there". So it is enforced by removing rows, not by asking nicely.
 */

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/ & /g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deliberately broader than exact equality: ruling out "Clapham" has to
 * take Clapham Common and Clapham Junction with it, or the rule-out means
 * nothing to anyone who names an area rather than a station.
 *
 * Matched on WHOLE WORDS, so "Pop" cannot quietly remove Poplar — the
 * phrase has to sit at a word boundary on both sides.
 *
 * It DOES over-match a shared first word: ruling out "Victoria" also
 * removes Victoria Park, which is a different place in Hackney. That is a
 * known cost, accepted deliberately. No string rule can separate "Clapham
 * Common is part of Clapham" from "Victoria Park is not part of Victoria"
 * — the difference is geography, not text — and the failure that prompted
 * this was UNDER-removal. Hiding somewhere they might have liked is worse
 * than showing them the place they explicitly rejected only by a margin;
 * showing the rejected place destroys trust in the whole list.
 */
function mentions(name: string, ruledOut: string): boolean {
  const haystack = normalise(name);
  const needle = normalise(ruledOut);
  if (!needle) return false;
  if (haystack === needle) return true;
  return new RegExp(`(^| )${escapeRegExp(needle)}( |$)`).test(haystack);
}

/** Every area name the household has said they want to avoid. */
export function ruledOutNames(areaCards: AreaCards | undefined): string[] {
  return Object.entries(areaCards ?? {})
    .filter(([, verdict]) => verdict === 'hate')
    .map(([name]) => name);
}

/**
 * True if this candidate is one they ruled out — by its own name, or by any
 * of the stations it is built from.
 *
 * Stations matter as much as the name: a neighbourhood can be called
 * something administrative nobody says while containing exactly the station
 * they named. Canary Wharf is one of those.
 */
export function isRuledOut(candidate: AreaCandidate, ruledOut: string[]): boolean {
  return ruledOut.some(
    (name) =>
      mentions(candidate.neighbourhood, name) ||
      candidate.stations.some((station) => mentions(station, name)),
  );
}

/**
 * Drops ruled-out neighbourhoods.
 *
 * NOTE the difference from applyZone1Filter, which hands back the unfiltered
 * list rather than return nothing. That safeguard is right for Zone 1 — an
 * empty map reads as a broken app, and Zone 1 is a preference about a
 * region. It is wrong here. If someone's commute only reaches places they
 * have explicitly ruled out, the honest answer is an empty list and a
 * reason, not a list made entirely of the areas they rejected.
 */
export function applyRuleOuts(
  candidates: AreaCandidate[],
  areaCards: AreaCards | undefined,
): AreaCandidate[] {
  const ruledOut = ruledOutNames(areaCards);
  if (ruledOut.length === 0) return candidates;
  return candidates.filter((c) => !isRuledOut(c, ruledOut));
}
