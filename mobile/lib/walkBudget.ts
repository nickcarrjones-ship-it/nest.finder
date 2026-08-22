import type { Area, JourneyTimes, Profile } from './types';
import { resolveCommute } from './commuteSettings';

/**
 * The walk-budget model: instead of asking someone how far they'll live from
 * a station they haven't chosen yet, work out how much walking each station
 * can afford them out of the time they have left.
 *
 *   budget = their limit - their journey from that station - their work walk
 *
 * A fast station leaves plenty of walking time, so its catchment is generous.
 * A slow one leaves almost none, so you'd have to live on top of it.
 *
 * Replaces the old approach of adding one flat walk figure to every area,
 * which had the backwards effect of REMOVING options as you said you'd walk
 * further (304 areas at a 5-minute walk, 89 at 20).
 *
 * Not yet wired into the map — that needs the isochrone data, which needs
 * Valhalla. This is the calculation those shapes will be selected by.
 */

/** Nobody walks half an hour to a station; beyond this they'd take a bus. */
export const MAX_WALK_BUDGET_MINS = 15;

/**
 * Below this the only "home" that qualifies is the station entrance itself.
 * Dropping them removes ~12% of areas at a 50-minute limit — all of them
 * cases where the catchment would render as a dot barely wider than the
 * marker, which reads as a bug rather than as information.
 */
export const MIN_WALK_BUDGET_MINS = 3;

export interface AreaBudget {
  area: Area;
  /** Minutes of walking this area affords, capped and already filtered. */
  budget: number;
  /** Which member is the binding constraint — useful for explaining the number. */
  limitedBy: number;
  /** Door-to-station journey per member, same order as profile.members. */
  journeys: number[];
}

/**
 * Everyone walks the same distance from home to a station, so the binding
 * constraint is whichever person has least time left over.
 *
 * Note this still assumes the household uses the SAME station. Where two
 * people would sensibly use different nearby stations (Clapham North for the
 * Northern line, Clapham High Street for the Overground) the honest model is
 * to build each person's region separately and intersect them — see
 * computeSharedRegionAsync in mergeRegions.ts. This function is the per-station
 * building block both approaches need.
 */
export function computeAreaBudgets(
  areas: Area[],
  journeyTimes: JourneyTimes,
  profile: Profile,
): AreaBudget[] {
  const { maxMins } = resolveCommute(profile);
  const members = profile.members ?? [];
  const out: AreaBudget[] = [];

  for (const area of areas) {
    const times = journeyTimes[area.name];
    if (!times) continue;

    let budget = Infinity;
    let limitedBy = 0;
    const journeys: number[] = [];
    let usable = true;

    for (let i = 0; i < members.length; i++) {
      const journey = times[members[i].workId];
      if (journey === undefined) { usable = false; break; }
      journeys.push(journey);
      const theirs = maxMins[i] - journey - (members[i].offWalk ?? 0);
      if (theirs < budget) { budget = theirs; limitedBy = i; }
    }

    if (!usable || budget < MIN_WALK_BUDGET_MINS) continue;
    out.push({
      area,
      budget: Math.min(budget, MAX_WALK_BUDGET_MINS),
      limitedBy,
      journeys,
    });
  }

  return out;
}

/**
 * Budgets for ONE member, ignoring everyone else. Used to build that person's
 * own region before intersecting it with their partner's — the model that
 * lets a couple walk to different stations.
 */
export function computeMemberBudgets(
  areas: Area[],
  journeyTimes: JourneyTimes,
  profile: Profile,
  memberIndex: number,
): AreaBudget[] {
  const { maxMins } = resolveCommute(profile);
  const member = profile.members?.[memberIndex];
  if (!member) return [];
  const out: AreaBudget[] = [];

  for (const area of areas) {
    const journey = journeyTimes[area.name]?.[member.workId];
    if (journey === undefined) continue;
    const budget = maxMins[memberIndex] - journey - (member.offWalk ?? 0);
    if (budget < MIN_WALK_BUDGET_MINS) continue;
    out.push({
      area,
      budget: Math.min(budget, MAX_WALK_BUDGET_MINS),
      limitedBy: memberIndex,
      journeys: [journey],
    });
  }

  return out;
}

/**
 * The set of distinct budget values is tiny and fixed, which is what makes
 * precomputing isochrones viable: whatever someone's limit and work walk,
 * the answer is always one of these.
 */
export function possibleBudgets(): number[] {
  const out: number[] = [];
  for (let b = MIN_WALK_BUDGET_MINS; b <= MAX_WALK_BUDGET_MINS; b++) out.push(b);
  return out;
}
