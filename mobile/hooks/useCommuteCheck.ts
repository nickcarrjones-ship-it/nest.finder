import { useCallback, useEffect, useState } from 'react';
import { useMapDataStore } from '../store/mapDataStore';
import { useProfileStore } from '../store/profileStore';
import { catchmentsForProfile, regionCacheKey } from '../lib/isochrones';
import { commuteVerdict, indexRings, type CommuteVerdict } from '../lib/commuteCheck';

/**
 * Checks a point against the household's teal zone (lib/commuteCheck.ts).
 * Returns null until the catchments have loaded, so callers show nothing
 * rather than a wrong verdict. Recomputes when the commute limit or
 * workplaces change, exactly when the map's zone would.
 */
export function useCommuteCheck(): ((at: { lat: number; lng: number }) => CommuteVerdict) | null {
  const profile = useProfileStore((s) => s.profile);
  const status = useMapDataStore((s) => s.status);
  const stations = useMapDataStore((s) => s.stations);
  const journeyTimes = useMapDataStore((s) => s.journeyTimes);
  const load = useMapDataStore((s) => s.load);
  const key = regionCacheKey(profile);
  const [perMember, setPerMember] = useState<ReturnType<typeof indexRings>[] | null>(null);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  useEffect(() => {
    if (status !== 'ready' || stations.length === 0 || !(profile.members ?? []).length) return;
    let cancelled = false;
    catchmentsForProfile(stations, journeyTimes, profile)
      .then((members) => {
        if (!cancelled) setPerMember(members.map((m) => indexRings(m.rings)));
      })
      .catch(() => {
        if (!cancelled) setPerMember(null);
      });
    return () => { cancelled = true; };
    // key captures every part of the profile the zone depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, stations, journeyTimes, key]);

  const check = useCallback(
    (at: { lat: number; lng: number }) =>
      commuteVerdict(at, perMember ?? [], stations, journeyTimes, profile),
    [perMember, stations, journeyTimes, profile],
  );

  return perMember ? check : null;
}
