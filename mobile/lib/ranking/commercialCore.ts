import homeData from '../../assets/data/area-homes.json';
import foodData from '../../assets/data/area-food.json';
import type { AreaCandidate } from './prompt';

/**
 * Places nobody lives, removed before anything ranks them.
 *
 * "No one really lives in St Pauls" (Nick, 2026-08-31). He is right, and
 * the similarity engine could not tell: it measures what a place is LIKE,
 * and the City genuinely is like a lively neighbourhood — thousands of
 * places to eat and drink, busy all week. It is simply not somewhere you
 * can buy a flat and have a life.
 *
 * This is a filter, not a weighting, because that is the actual shape of
 * the problem. No amount of loving Shoreditch should ever surface Bank.
 *
 * THE SIGNAL: residential buildings per food venue. An office district has
 * thousands of places to eat serving almost no homes. The median London
 * area has 12.8 homes per venue; Mansion House has 0.36, St Paul's 0.38,
 * Bank 0.39 — twenty to thirty times below normal, which is a different
 * kind of place rather than a slightly different one.
 *
 * Deliberately drawn from OSM buildings rather than the resident-per-venue
 * ratio already in the feature set. That one is Census-based, and around
 * the City its 1.61km radius pulls in enough of Islington and Southwark to
 * blur the answer: Knightsbridge scores 39 residents per venue, close to
 * Shoreditch's 54, yet people plainly do live in Knightsbridge — and its
 * 5.23 homes per venue says so. Counting the buildings answers the
 * question being asked.
 */

/**
 * Below this, it is an office district. Set at 0.7 rather than the 1.0 the
 * data would support, because "never suggested" has to be unarguable.
 *
 * 1.0 would additionally take the Barbican (0.78), Farringdon (0.95),
 * Waterloo (0.75), Southwark (0.88) and Russell Square (0.91) — and people
 * genuinely do live in all five. Their ratios are low because the radius
 * around each station is dominated by offices, not because the area is
 * uninhabited. Better to leave a handful of weak suggestions in than to
 * silently delete somewhere a person could actually live.
 *
 * London Bridge sits below this line at 0.68 and is spared by name — see
 * ALWAYS_HABITABLE.
 */
const MAX_HOMES_PER_VENUE = 0.7;

/**
 * A real business district has a LOT of places to eat. Without this, the
 * rule catches Caterham (42 homes, 55 venues), Hillingdon (38/47) and
 * Chadwell Heath — outer suburbs where OSM building coverage is thin, not
 * commercial cores. Their ratio looks identical; their scale does not.
 */
const MIN_VENUES = 500;

/**
 * Local knowledge overriding the ratio. Nick's call, 2026-08-31.
 *
 * London Bridge measures 0.68 and would be excluded, but people do live
 * around it — the station sits among Borough Market and the offices, and
 * the number reflects the station's surroundings rather than the area
 * anyone would move to.
 *
 * An explicit exception rather than nudging the threshold to 0.66. A
 * threshold picked to spare one place is the same decision wearing a
 * disguise, and it would silently stop working the day the OSM building
 * count shifts London Bridge to 0.64. Naming it means the override
 * survives the data changing, and says who made it and why.
 */
const ALWAYS_HABITABLE = new Set<string>(['London Bridge']);

const homes = (homeData as { areas: Record<string, { homes: number }> }).areas ?? {};
const food = (foodData as { areas: Record<string, { venues: number }> }).areas ?? {};

/** Worked out once — the datasets are static, and this runs on every rank. */
const COMMERCIAL_CORE: ReadonlySet<string> = (() => {
  const out = new Set<string>();
  for (const [name, h] of Object.entries(homes)) {
    const venues = food[name]?.venues ?? 0;
    if (venues < MIN_VENUES) continue;
    if (ALWAYS_HABITABLE.has(name)) continue;
    if (h.homes / venues < MAX_HOMES_PER_VENUE) out.add(name);
  }
  return out;
})();

/** Exported so a test can assert the membership, and so the list can be
 *  printed when someone asks why an area never appears. */
export function commercialCoreNames(): string[] {
  return [...COMMERCIAL_CORE].sort();
}

export function isCommercialCore(candidate: AreaCandidate): boolean {
  return (
    COMMERCIAL_CORE.has(candidate.neighbourhood) ||
    candidate.stations.some((s) => COMMERCIAL_CORE.has(s))
  );
}

/**
 * Drops office districts from the candidate list.
 *
 * Never returns nothing, unlike applyRuleOuts. A rule-out is somebody's
 * stated wish and an empty result honours it; this is the app's own
 * judgement, and an empty map because we decided nowhere they can reach is
 * habitable would read as broken — and would be wrong, since somebody
 * plainly lives near every station in London.
 */
export function applyCommercialCoreFilter(candidates: AreaCandidate[]): AreaCandidate[] {
  const kept = candidates.filter((c) => !isCommercialCore(c));
  return kept.length > 0 ? kept : candidates;
}
