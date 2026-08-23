import { loadData } from './dataSource';
import { computeMemberBudgets, MIN_WALK_BUDGET_MINS, MAX_WALK_BUDGET_MINS } from './walkBudget';
import type { Area, JourneyTimes, Profile } from './types';
import type { Ring } from './mergeStrategies';

/**
 * Turning "50 minutes door to desk" into the shapes the map draws.
 *
 * Every catchment was pre-generated — 570 stations x 13 walk budgets, built
 * from real station entrances — so nothing is routed at runtime. All this
 * does is work out which of the pre-made shapes each station needs and
 * fetch the right files.
 *
 * Files are split one per budget precisely so a profile only downloads the
 * sizes it actually uses, which is typically five to eight of the thirteen.
 */

type Catchments = Record<string, GeoJSON.Polygon | GeoJSON.MultiPolygon>;

const cache = new Map<number, Catchments>();
const inFlight = new Map<number, Promise<Catchments>>();

async function loadBudget(budget: number): Promise<Catchments> {
  const hit = cache.get(budget);
  if (hit) return hit;
  // Two areas needing the same budget must not trigger two loads.
  const pending = inFlight.get(budget);
  if (pending) return pending;

  const p = loadData<Catchments>(`isochrones/budget-${budget}.json`)
    .then((d) => {
      cache.set(budget, d);
      inFlight.delete(budget);
      return d;
    })
    .catch((e) => {
      inFlight.delete(budget);
      throw e;
    });
  inFlight.set(budget, p);
  return p;
}

/** Only the rings; the merge code works in plain coordinate arrays. */
function ringsOf(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): Ring[] {
  if (geom.type === 'Polygon') return [geom.coordinates[0] as Ring];
  return geom.coordinates.map((poly) => poly[0] as Ring);
}

export interface MemberCatchments {
  memberIndex: number;
  rings: Ring[];
  /** Which budgets this member's areas actually needed — useful for debugging. */
  budgetsUsed: number[];
}

/**
 * The catchments for one person: every area they can reach, each at the size
 * their own leftover time affords.
 */
export async function catchmentsForMember(
  areas: Area[],
  journeyTimes: JourneyTimes,
  profile: Profile,
  memberIndex: number,
): Promise<MemberCatchments> {
  const budgets = computeMemberBudgets(areas, journeyTimes, profile, memberIndex);
  const needed = [...new Set(budgets.map((b) => b.budget))].sort((a, b) => a - b);

  const files = await Promise.all(needed.map(loadBudget));
  const byBudget = new Map<number, Catchments>();
  needed.forEach((b, i) => byBudget.set(b, files[i]));

  const rings: Ring[] = [];
  for (const { area, budget } of budgets) {
    const geom = byBudget.get(budget)?.[area.name];
    // A missing shape means the generator skipped that station-budget. Skip
    // it rather than substituting a circle, which would quietly reintroduce
    // the very thing this replaces.
    if (geom) rings.push(...ringsOf(geom));
  }

  return { memberIndex, rings, budgetsUsed: needed };
}

/** Catchments for everyone, ready to merge and intersect. */
export async function catchmentsForProfile(
  areas: Area[],
  journeyTimes: JourneyTimes,
  profile: Profile,
): Promise<MemberCatchments[]> {
  const members = profile.members ?? [];
  return Promise.all(
    members.map((_, i) => catchmentsForMember(areas, journeyTimes, profile, i)),
  );
}

/**
 * A key that changes exactly when the drawn region would change, so the
 * merged result can be cached against it.
 */
export function regionCacheKey(profile: Profile): string {
  const members = profile.members ?? [];
  return [
    profile.maxCommuteMins ?? '-',
    profile.sharedCommuteLimit === false ? 'split' : 'shared',
    ...members.map((m) => `${m.workId}:${m.offWalk ?? 0}:${m.maxCommuteMins ?? '-'}`),
  ].join('|');
}

export function budgetRange(): { min: number; max: number } {
  return { min: MIN_WALK_BUDGET_MINS, max: MAX_WALK_BUDGET_MINS };
}

/** Frees the loaded budget files — for tests, and for a low-memory warning. */
export function clearIsochroneCache(): void {
  cache.clear();
  inFlight.clear();
}
