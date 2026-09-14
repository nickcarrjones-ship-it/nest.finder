import type { Place } from '../placesClient';
import type { StopPlan } from '../itinerary';

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
    const where = place.address ? ` — ${place.address}` : '';
    return `• ${place.name}${where}\n  ${plan.reason}`;
  });

  return [
    `Here's a day in ${area}, built from what you told me you like:`,
    '',
    ...lines,
    '',
    'All within a short walk of each other. Go on the day you would actually be living there — a Sunday tells you far more than a Tuesday viewing.',
  ].join('\n');
}
