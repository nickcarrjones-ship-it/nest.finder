import type { Profile } from './types';

/**
 * Ported from js/commute-settings.js (resolveCommute/resolveWalk). The web
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
export const COMMUTE_OPTIONS_MINS = [20, 30, 40, 45, 50, 60];
export const WALK_DEFAULT_KM = 1.5;
export const WALK_OPTIONS_KM = [
  { km: 0.5, label: '5 min walk (0.5km)' },
  { km: 1, label: '10 min walk (1km)' },
  { km: 1.5, label: '15 min walk (1.5km)' },
  { km: 2, label: '20 min walk (2km)' },
  { km: 3, label: '30 min walk (3km)' },
];

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

export function resolveWalk(profile: Profile | null): { sharedWalkLimit: boolean; walkKms: number[] } {
  const defKm = WALK_DEFAULT_KM;
  if (!profile || !Array.isArray(profile.members)) {
    return { sharedWalkLimit: true, walkKms: [defKm, defKm] };
  }
  let shared = profile.sharedWalkLimit !== false;
  if (profile.sharedWalkLimit === undefined && profile.sharedCommuteLimit !== undefined) {
    shared = profile.sharedCommuteLimit !== false;
  }
  const w = profile.walkHomeKm ?? defKm;
  const walkKms = profile.members.map((m) => m.walkHomeKm ?? w);
  return { sharedWalkLimit: shared, walkKms };
}
