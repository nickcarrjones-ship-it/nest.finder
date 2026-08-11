import type { Area, JourneyTimes, Profile, ReachableArea } from './types';
import { resolveCommute, resolveWalk } from './commuteSettings';

/**
 * The core Maloca calculation, ported from computeZones() in js/map-core.js.
 * Deliberately kept free of any map/rendering concern — this file decides
 * WHICH areas work for everyone; drawing them is a separate step.
 *
 * For each area, a member's door-to-desk time is:
 *   journeyTimes[area][member.workId] + walkMinutes(member) + member.offWalk
 * where walkMinutes assumes a ~5km/h walking pace (round(km * 12)), matching
 * the web app exactly. An area is reachable only if EVERY member's time is
 * within their own limit — that overlap is the entire point of the app.
 */
export function computeReachableAreas(
  areas: Area[],
  journeyTimes: JourneyTimes,
  profile: Profile,
): ReachableArea[] {
  const { maxMins } = resolveCommute(profile);
  const { walkKms } = resolveWalk(profile);
  const walkMinsByMember = walkKms.map((km) => Math.round(km * 12));

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
      const total = baseTime + walkMinsByMember[i] + (member.offWalk ?? 0);
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
