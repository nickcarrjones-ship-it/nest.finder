import { useEffect, useRef, useState } from 'react';
import { useMapDataStore } from '../store/mapDataStore';
import { useProfileStore } from '../store/profileStore';
import { catchmentsForProfile, regionCacheKey } from '../lib/isochrones';
import { cachedSharedRegion, type MergeProgress } from '../lib/mergeRegions';
import { invertRegion, outerRings, regionFeature } from '../lib/inversePolygon';
import type { Ring } from '../lib/mergeStrategies';

/**
 * The shape the map draws: everywhere every member could live and still make
 * their commute.
 *
 * Each person's catchments are merged into their own region, then those
 * regions are intersected — because a couple do not have to use the same
 * station. One might walk to Clapham North for the Northern line while the
 * other walks to Clapham High Street for the Overground; forcing both through
 * one station would wrongly discard homes that suit them both.
 *
 * Measured at ~900ms cold on a Nothing Phone 3 with ~380 catchments each, and
 * instant once cached. Work is chunked so the screen never freezes, and the
 * previous region stays on screen while a new one computes — a blank map
 * would read as breakage rather than as loading.
 */

export interface ReachableRegion {
  /** Translucent wash over everywhere unreachable. */
  mask: GeoJSON.Polygon | null;
  /** The region itself, for its boundary line. */
  outline: GeoJSON.MultiPolygon | null;
  /** How many separate pockets — genuinely useful information, not noise. */
  pockets: number;
  computing: boolean;
  progress: MergeProgress | null;
  error: string | null;
}

const EMPTY: ReachableRegion = {
  mask: null, outline: null, pockets: 0,
  computing: false, progress: null, error: null,
};

export function useReachableRegion(enabled = true): ReachableRegion {
  const profile = useProfileStore((s) => s.profile);
  const status = useMapDataStore((s) => s.status);
  const stations = useMapDataStore((s) => s.stations);
  const journeyTimes = useMapDataStore((s) => s.journeyTimes);
  const [state, setState] = useState<ReachableRegion>(EMPTY);
  // Guards against a slow run finishing after a newer one and overwriting it.
  const runId = useRef(0);

  const key = regionCacheKey(profile);

  useEffect(() => {
    if (!enabled || status !== 'ready' || stations.length === 0) return;
    const id = ++runId.current;
    let cancelled = false;

    setState((s) => ({ ...s, computing: true, error: null }));

    (async () => {
      try {
        const perMember = await catchmentsForProfile(stations, journeyTimes, profile);
        if (cancelled || id !== runId.current) return;

        const sets: Ring[][] = perMember.map((m) => m.rings);
        if (sets.every((s) => s.length === 0)) {
          setState({ ...EMPTY, pockets: 0 });
          return;
        }

        const { region } = await cachedSharedRegion(key, sets, (p) => {
          if (!cancelled && id === runId.current) {
            setState((s) => ({ ...s, progress: p }));
          }
        });
        if (cancelled || id !== runId.current) return;

        const rings = outerRings(region);
        setState({
          mask: invertRegion(rings),
          outline: regionFeature(rings),
          pockets: rings.length,
          computing: false,
          progress: null,
          error: null,
        });
      } catch (err) {
        if (cancelled || id !== runId.current) return;
        setState((s) => ({
          ...s,
          computing: false,
          progress: null,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, status, stations, journeyTimes, profile, key]);

  return state;
}
