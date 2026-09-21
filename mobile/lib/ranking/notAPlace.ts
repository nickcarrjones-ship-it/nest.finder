import type { AreaCandidate } from './prompt';

/**
 * Station names that are not somewhere anyone says they live.
 *
 * WHY THIS EXISTS. Areas are built by grouping stations into wards
 * (lib/ranking/candidates.ts). Where several stations share a ward the
 * ward name is used — Clapham North, High Street and Common really are
 * all just Clapham. Where a station is ALONE in its ward, the station
 * name is used instead, deliberately: the ward names come from ONS and
 * are administrative, so alone in a group Clapham Junction became
 * "Falconbrook" and Brixton "Brixton Windrush" (Nick, 2026-08-26).
 *
 * 289 of 570 stations are alone in their ward, so that path carries most
 * of the map and is usually right — Angel, Brixton, Bermondsey and
 * Blackheath all come through it. The failure is narrow: a handful of
 * those stations are named after a road rather than a place, so the app
 * suggested "Haydons Road", which is a road between Wimbledon and Tooting
 * (Nick, 2026-09-21).
 *
 * WHY A LIST AND NOT A RULE. There is no rule that separates them. Of the
 * 25 singleton stations named after a road or street, most are exactly
 * how Londoners name the area: Holloway Road, Old Street, Turnpike Lane,
 * Goldhawk Road, Gloucester Road, Shoreditch High Street. "Ends in Road"
 * would delete those too. Which is which is local knowledge, so it is
 * Nick's list, made on 2026-09-21, and adding to it is a one-line change.
 *
 * WHAT IT DOES NOT DO. It only stops these being SUGGESTED. Somebody who
 * names one as an area they love still gets it — that comes in through
 * areaCards, not through the candidate pool — and ruling one out still
 * works, because rule-outs match station names directly.
 */
const NOT_A_PLACE: ReadonlySet<string> = new Set([
  'Blackhorse Road',
  'Devons Road',
  'Essex Road',
  'Haydons Road',
  'Headstone Lane',
  'Leyton Midland Road',
  'Rayners Lane',
  'Rectory Road',
  'Turkey Street',
]);

/**
 * Matched on the candidate's NAME, not on its stations.
 *
 * The station is a perfectly good station and its commute times are real;
 * what is wrong is only using its name for a neighbourhood. So if one of
 * these ever ends up grouped with another station — the ward gains a stop,
 * or a nearby one is reclassified — the group takes the ward name, this
 * stops matching, and the area comes back by itself. That is the right
 * behaviour: the objection was to the name, and the name would be gone.
 */
export function isNotAPlace(candidate: AreaCandidate): boolean {
  return NOT_A_PLACE.has(candidate.neighbourhood);
}

/** Exported so a test can assert the membership, and so the list can be
 *  printed when somebody asks why an area never appears. */
export function notAPlaceNames(): string[] {
  return [...NOT_A_PLACE].sort();
}

/**
 * Drops them from the candidate list.
 *
 * Never returns nothing, for the same reason applyCommercialCoreFilter
 * never does: this is the app's own judgement rather than somebody's
 * stated wish, and an empty map would read as broken.
 */
export function applyNotAPlaceFilter(candidates: AreaCandidate[]): AreaCandidate[] {
  const kept = candidates.filter((c) => !isNotAPlace(c));
  return kept.length > 0 ? kept : candidates;
}
