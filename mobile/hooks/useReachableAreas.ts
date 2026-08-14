import { useMemo } from 'react';
import { computeReachableAreas } from '../lib/commute';
import type { ReachableArea } from '../lib/types';
import { useMapDataStore } from '../store/mapDataStore';
import { useProfileStore } from '../store/profileStore';

/**
 * The one question the whole app exists to answer: which areas work for
 * everyone's commute, right now, given whatever's currently in the profile
 * and map-data stores. Recomputed (cheaply — a few hundred areas) whenever
 * either store changes, rather than cached and risking it going stale.
 */
export function useReachableAreas(): { areas: ReachableArea[]; ready: boolean } {
  const profile = useProfileStore((s) => s.profile);
  const status = useMapDataStore((s) => s.status);
  const stations = useMapDataStore((s) => s.stations);
  const journeyTimes = useMapDataStore((s) => s.journeyTimes);

  const areas = useMemo(() => {
    if (status !== 'ready') return [];
    return computeReachableAreas(stations, journeyTimes, profile);
  }, [status, stations, journeyTimes, profile]);

  return { areas, ready: status === 'ready' };
}
