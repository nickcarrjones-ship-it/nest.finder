import type { Place } from '../placesClient';
import type { StopPlan } from '../itinerary';
import { mapsLink } from '../itinerary';
import { distanceKm } from '../ranking/placeLabels';

/**
 * "Plan me a chill Sunday in Queens Park."
 *
 * A different question from "what is Queens Park like?", and it used to be
 * answered as though it were the same one — from a brief full of medians
 * and Ofsted ratings, which cannot tell anybody where to get lunch (Nick,
 * 2026-09-14).
 *
 * PURE, so the wording and the matching are testable without a network:
 * the places themselves come from placesClient, and the reasons from
 * itinerary.ts, which builds them out of the same preference tags that
 * chose the area in the first place.
 */

/**
 * Does this ask for something to DO, rather than something to know?
 *
 * Deliberately narrow. A false positive sends someone who asked a factual
 * question a list of cafés, which is worse than the plain answer they
 * wanted — so this looks for an explicit ask (plan, itinerary, what to do,
 * where to eat) rather than inferring from a day of the week alone.
 * "Is Balham busy on a Sunday?" is a question about the area, not a
 * request for a day out.
 */
const OUTING_PATTERNS: RegExp[] = [
  /\b(plan|itinerary|day out|afternoon out|things to do|what (?:can|should|could) (?:we|i|you) do)\b/i,
  /\bwhere (?:can|should|could) (?:we|i) (?:eat|drink|go|get (?:lunch|coffee|brunch|a drink|a pint))\b/i,
  /\b(?:show|take) (?:me|us) (?:a|an|around)\b.*\b(day|morning|afternoon|weekend)\b/i,
  /\bwhat(?:'s| is| are) there to do\b/i,
];

export function asksForAnOuting(said: string): boolean {
  return OUTING_PATTERNS.some((re) => re.test(said));
}

export interface PlannedStop {
  plan: StopPlan;
  place: Place;
}

/**
 * Ten minutes on foot.
 *
 * 800m at a real walking pace, not the 1.4m/s an engineer would assume —
 * London pavements have crossings, junctions and other people on them.
 * Enforced HERE rather than by the search: a radius is a bias in Places,
 * not a fence, so a search "near Queens Park" will happily return the best
 * answer a mile away.
 */
export const WALK_RADIUS_M = 800;

/**
 * Enough reviews for a rating to mean something.
 *
 * A 5.0 from three people is a claim about three people. Sorting on
 * rating alone puts that above a 4.5 from two thousand, which is how
 * "best places" turns into "places nobody has been to".
 */
const CREDIBLE_REVIEWS = 20;

/**
 * The best place within walking distance — best meaning well-reviewed by
 * enough people to believe, not merely highest-scoring.
 *
 * Anything outside the walk is dropped outright rather than ranked lower:
 * the household was promised a ten minute walk, and a brilliant café forty
 * minutes away is a different suggestion, not a better one.
 */
export function pickBest(
  places: Place[],
  from: { lat: number; lng: number },
  exclude: ReadonlySet<string> = new Set(),
): Place | null {
  const walkable = places.filter((p) => {
    if (exclude.has(p.id)) return false;
    // No coordinates means no way to honour the promise, so it is out.
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return false;
    return distanceKm(from, { lat: p.lat, lng: p.lng }) * 1000 <= WALK_RADIUS_M;
  });
  if (walkable.length === 0) return null;

  const score = (p: Place) => p.rating ?? 0;
  const trusted = walkable.filter((p) => (p.ratingCount ?? 0) >= CREDIBLE_REVIEWS);
  const pool = trusted.length > 0 ? trusted : walkable;

  return [...pool].sort((a, b) => {
    if (score(b) !== score(a)) return score(b) - score(a);
    // Same rating: the one more people have been to.
    return (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
  })[0];
}

/** "4.6 (1,204 reviews)" — or nothing at all when Google holds no rating,
 *  rather than a bare number nobody can weigh. */
export function describeRating(place: Place): string | null {
  if (typeof place.rating !== 'number') return null;
  const stars = place.rating.toFixed(1);
  if (!place.ratingCount) return `${stars}★`;
  return `${stars}★ (${place.ratingCount.toLocaleString('en-GB')} reviews)`;
}

/**
 * The itinerary as somebody reads it.
 *
 * Each stop names a real venue and says, in our own words, which of their
 * own answers put it on the list — "you said the cafés matter". That
 * second half is the whole point: a list of three pubs is a search result,
 * while a list that explains itself is advice.
 *
 * Nothing Google returned is characterised or rated here. The name and the
 * address are repeated as given and nothing is stored (see placesClient).
 */
export function composeOuting(area: string, stops: PlannedStop[]): string {
  if (stops.length === 0) {
    return `I couldn't find enough open places around ${area} to plan a day out. Worth a wander anyway — that's usually how you learn the most about somewhere.`;
  }

  const lines = stops.map(({ plan, place }) => {
    const rating = describeRating(place);
    const parts = [`• ${place.name}`];
    if (rating) parts.push(`  ${rating}`);
    if (place.address) parts.push(`  ${place.address}`);
    parts.push(`  ${plan.reason}`);
    parts.push(`  ${mapsLink(place.id, place.name)}`);
    return parts.join('\n');
  });

  return [
    `Here's a day in ${area}, built from what you told me you like:`,
    '',
    ...lines,
    '',
    'All within a ten minute walk of the area. Go on the day you would actually be living there — a Sunday tells you far more than a Tuesday viewing.',
  ].join('\n');
}
