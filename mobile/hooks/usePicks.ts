import { useMemo } from 'react';
import { useMapDataStore } from '../store/mapDataStore';
import { useProfileStore } from '../store/profileStore';
import { useShortlistStore, type ShortlistEntry } from '../store/shortlistStore';
import { computeAreaBudgets } from '../lib/walkBudget';
import { computeAreaCandidates } from '../lib/ranking/candidates';
import type { AreaCandidate } from '../lib/ranking/prompt';
import type { PickWithLocation } from '../components/PicksCarousel';
import identities from '../assets/data/area-identities.json';

/**
 * Shared by the map carousel and the Top Picks tab, so both read the same
 * candidate set rather than two screens computing it slightly differently.
 * See picks.tsx for the honest status of what's real (visiting, rating)
 * vs. placeholder (the ordering, until AI ranking has auth to run on).
 */
export function usePicks(): { picks: PickWithLocation[]; ready: boolean } {
  const status = useMapDataStore((s) => s.status);
  const stations = useMapDataStore((s) => s.stations);
  const journeyTimes = useMapDataStore((s) => s.journeyTimes);
  const profile = useProfileStore((s) => s.profile);
  const entries = useShortlistStore((s) => s.entries);
  const setResult = useShortlistStore((s) => s.setResult);

  const candidates = useMemo<AreaCandidate[]>(() => {
    if (status !== 'ready') return [];
    const budgets = computeAreaBudgets(stations, journeyTimes, profile);
    return computeAreaCandidates(budgets, identities);
  }, [status, stations, journeyTimes, profile]);

  const top10 = useMemo(
    () => [...candidates].sort((a, b) => b.walkBudgetMins - a.walkBudgetMins).slice(0, 10),
    [candidates],
  );

  if (entries.length === 0 && top10.length > 0) {
    setResult(
      top10.map((c) => ({
        neighbourhood: c.neighbourhood,
        score: c.walkBudgetMins,
        reason: `${c.commuteMins} min commute, ${c.walkBudgetMins} min walking budget once you're there.`,
        confidence: 'low' as const,
      })),
      null,
    );
  }

  const byName = useMemo(() => new Map(top10.map((c) => [c.neighbourhood, c])), [top10]);

  const picks: PickWithLocation[] = useMemo(
    () =>
      entries
        .map((e: ShortlistEntry) => {
          const c = byName.get(e.neighbourhood);
          return c ? { ...e, lat: c.lat, lng: c.lng } : null;
        })
        .filter((p): p is PickWithLocation => p !== null),
    [entries, byName],
  );

  return { picks, ready: status === 'ready' };
}
