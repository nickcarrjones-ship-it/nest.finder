import type { Lifestyle, AreaCards, Profile } from '../types';
import type { RankedArea } from './parse';

/**
 * A ranking is only as fresh as the inputs that produced it. Ported from
 * the web app's classificationFingerprint (js/map-filter.js) — the exact
 * same idea: hash the things that could change the answer, and skip the AI
 * call entirely when nothing has. Re-running on every screen visit would
 * spend real money for an identical answer.
 */

export interface RankingCacheEntry {
  fingerprint: string;
  ranked: RankedArea[];
  computedAt: string;
}

export function rankingFingerprint(
  profile: Profile,
  lifestyle: Lifestyle | undefined,
  areaCards: AreaCards | undefined,
  reachableAreaNames: string[],
): string {
  // Sorted so two runs over the same reachable set hash identically
  // regardless of the order areas happened to be computed in.
  const sortedAreas = [...reachableAreaNames].sort();
  return JSON.stringify({
    members: profile.members?.map((m) => ({
      workId: m.workId,
      offWalk: m.offWalk ?? 0,
      maxCommuteMins: m.maxCommuteMins ?? profile.maxCommuteMins ?? null,
    })),
    lifestyle: lifestyle ?? {},
    areaCards: areaCards ?? {},
    // Deliberately included: if the reachable set itself changed (a
    // different commute limit, a data update), the old ranking may
    // reference areas that no longer qualify, or miss ones that now do.
    areas: sortedAreas,
  });
}

export function isCacheValid(entry: RankingCacheEntry | null, fingerprint: string): boolean {
  return entry !== null && entry.fingerprint === fingerprint;
}
