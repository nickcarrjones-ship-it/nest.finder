import type { Lifestyle } from '../types';
import type { AreaCandidate } from './prompt';
import riverSide from '../../assets/data/river-side.json';

/**
 * "South of the river" has to be arithmetic, not persuasion.
 *
 * This answer used to be collected, stored, and then only ever handed to the
 * model as a sentence in the prompt — "wants to be south of the river" — which
 * it treated as a hint and frequently ignored. On the run that surfaced this
 * (Nick, 2026-09-07) seven of ten suggested areas were on the wrong side, with
 * the river drawn right there on the map contradicting them.
 *
 * The Thames is the one preference in this app that is not a matter of degree.
 * Somewhere is north or it is south; there is no "quite southern". So it
 * belongs with the Zone 1 filter, which changes WHICH areas are ranked, rather
 * than with the lifestyle fields that only colour how they are described.
 *
 * Which side each area is on is precomputed — see scripts/build-river-side.mjs
 * for why that needs the real river geometry and not a latitude cutoff.
 */

const SIDE = riverSide as Record<string, 'north' | 'south'>;

/** Which bank an area sits on, or undefined if we have no answer for it. */
export function riverSideOf(area: string): 'north' | 'south' | undefined {
  return SIDE[area];
}

/**
 * A neighbourhood is on the wrong side only if EVERY station that formed it is.
 *
 * Neighbourhoods can straddle the river — a group whose stations sit on both
 * banks genuinely offers somewhere to live on the side they asked for, and
 * dropping it would be a worse answer than keeping it. This mirrors how the
 * Zone 1 filter treats a straddling neighbourhood, in the opposite direction
 * and for the same reason: be strict about what people ruled out, generous
 * about what they might still want.
 */
export function isOnSide(candidate: AreaCandidate, want: 'north' | 'south'): boolean {
  const sides = candidate.stations
    .map((s) => SIDE[s])
    .filter((s): s is 'north' | 'south' => s !== undefined);
  // Nothing known about any of its stations: keep it rather than guess. Being
  // absent from the data is not evidence of being on the wrong side.
  if (sides.length === 0) return true;
  return sides.some((s) => s === want);
}

/** Drops the far bank when, and only when, they asked for one. */
export function applyRiverFilter(
  candidates: AreaCandidate[],
  lifestyle: Lifestyle | undefined,
): AreaCandidate[] {
  const want = lifestyle?.riverSide;
  // 'either', and an unanswered question, filter nothing. Silently removing
  // half of London because a question was never reached would be far worse
  // than showing a few places someone doesn't want.
  if (want !== 'north' && want !== 'south') return candidates;

  const kept = candidates.filter((c) => isOnSide(c, want));
  // Never hand back an empty list: if someone's commute only reaches the far
  // bank, honouring this would leave them with no picks at all, which reads
  // as a broken app rather than a respected preference. Same escape hatch,
  // and same reasoning, as applyZone1Filter.
  return kept.length > 0 ? kept : candidates;
}
