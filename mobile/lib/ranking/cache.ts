import type { Lifestyle, AreaCards, Profile } from '../types';
import type { AnchorEvidence } from './anchor';
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
  /**
   * Cached WITH the ranking, so a cache hit can still explain itself.
   *
   * Without these, a returning user got the same ten areas and no reason
   * for any of them — computeShortlist's cache branch used to return
   * `anchor: null` unconditionally, throwing away even the one string it
   * had (2026-08-31). Optional because entries cached before this existed
   * are still valid rankings.
   */
  evidence?: Record<string, AnchorEvidence>;
  anchors?: string[];
}

/**
 * Bumped whenever the ENGINE changes in a way the inputs don't show.
 *
 * The fingerprint hashes what the user chose, which is exactly right until
 * the code that turns those choices into a shortlist changes underneath a
 * stored ranking. On 2026-09-01 resolveAreaName started consulting the
 * map's own place labels, so "Wandsworth" stopped anchoring on a station in
 * Lambeth — but every cached ranking was still the Lambeth one, and nothing
 * in the profile had changed to say so.
 *
 * 2 — place-label anchoring (2026-09-01)
 * 1 — original
 */
export const RANKING_LOGIC_VERSION = 2;

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
    v: RANKING_LOGIC_VERSION,
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
