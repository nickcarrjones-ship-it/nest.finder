import type { Area, JourneyTimes, Profile, ReachableArea } from './types';
import { resolveCommute } from './commuteSettings';

/**
 * The core Maloca calculation, ported from computeZones() in js/map-core.js.
 * Deliberately kept free of any map/rendering concern — this file decides
 * WHICH areas work for everyone; drawing them is a separate step.
 *
 * For each area, a member's door-to-desk time is:
 *   journeyTimes[area][member.workId] + member.offWalk
 * An area is reachable only if EVERY member's time is within their own
 * limit — that overlap is the entire point of the app.
 *
 * The home-end walk used to be added here too, as a flat
 * round(walkHomeKm * 12) minutes, ported from the web app. It was removed
 * on 2026-08-31: the walking catchment DERIVES that walk per area from
 * whatever time is left over (lib/walkBudget.ts), so charging a flat 12
 * minutes here answered the same question a second time and disagreed.
 * An area 40 minutes out on a 45-minute limit has a 5-minute walking
 * budget by the catchment, and was called unreachable by this.
 */
export function computeReachableAreas(
  areas: Area[],
  journeyTimes: JourneyTimes,
  profile: Profile,
): ReachableArea[] {
  const { maxMins } = resolveCommute(profile);

  const results: ReachableArea[] = [];

  for (const area of areas) {
    const jt = journeyTimes[area.name];
    if (!jt) continue;

    const memberTimes: number[] = [];
    let allInRange = true;

    for (let i = 0; i < profile.members.length; i++) {
      const member = profile.members[i];
      const baseTime = jt[member.workId];
      if (baseTime === undefined) {
        allInRange = false;
        break;
      }
      const total = baseTime + (member.offWalk ?? 0);
      memberTimes[i] = total;
      if (total > maxMins[i]) {
        allInRange = false;
        break;
      }
    }

    if (!allInRange) continue;
    results.push({ area, memberTimes });
  }

  return results;
}
