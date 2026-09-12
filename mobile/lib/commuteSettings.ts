import type { JourneyTimes, Member, Profile } from './types';

/**
 * Ported from js/commute-settings.js (resolveCommute). The web
 * version also has fillCommuteSelect/fillWalkSelect helpers that populate
 * <select> dropdowns — those are DOM-specific and don't port; native pickers
 * read these same resolved values directly instead.
 */

// Mirrors js/config.js APP_CONFIG, with one deliberate divergence: 50 is
// offered here but not on the (frozen) web app. 50 is the native default
// because the area list grew from 262 to 570 with the zone 1-6 expansion —
// below ~50 mins the two datasets look near-identical, but at 60 the map
// jumps from 235 to 348 circles for a Canary Wharf + Holborn pair.
export const COMMUTE_DEFAULT_MINS = 30;
export const COMMUTE_OPTIONS_MINS = [20, 25, 30, 35, 40, 45, 50, 55, 60];

export function resolveCommute(profile: Profile | null): { sharedCommuteLimit: boolean; maxMins: number[] } {
  const def = COMMUTE_DEFAULT_MINS;
  if (!profile || !Array.isArray(profile.members)) {
    return { sharedCommuteLimit: true, maxMins: [def, def] };
  }
  const shared = profile.sharedCommuteLimit !== false;
  const maxM = profile.maxCommuteMins ?? def;
  const maxMins = profile.members.map((m) => m.maxCommuteMins ?? maxM);
  return { sharedCommuteLimit: shared, maxMins };
}

/**
 * The commute limit someone would actually need for every area they said
 * they love to be reachable — the slowest member's time to the
 * slowest-to-reach loved area, plus that member's own walk buffer. Undefined
 * when a loved area's journey time isn't known, so a genuinely unmeasured
 * area never drags the limit up on a guess.
 */
export function commuteMinsNeededFor(
  lovedAreas: string[],
  members: Member[],
  journeyTimes: JourneyTimes,
): number | undefined {
  let needed: number | undefined;
  for (const area of lovedAreas) {
    const times = members.map((m) => journeyTimes[area]?.[m.workId]);
    if (!times.every((t) => typeof t === 'number')) continue;
    const mins = Math.max(...(times as number[])) + Math.max(0, ...members.map((m) => m.offWalk ?? 0));
    if (needed === undefined || mins > needed) needed = mins;
  }
  return needed;
}

/** The nearest offered commute option that still covers `mins`. */
export function roundUpToCommuteOption(mins: number): number {
  return COMMUTE_OPTIONS_MINS.find((m) => m >= mins) ?? COMMUTE_OPTIONS_MINS[COMMUTE_OPTIONS_MINS.length - 1];
}
