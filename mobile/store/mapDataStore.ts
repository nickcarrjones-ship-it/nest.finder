import { create } from 'zustand';
import type { Area, JourneyTimes } from '../lib/types';
import { loadData, syncData } from '../lib/dataSource';

interface MapDataState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  stations: Area[];
  journeyTimes: JourneyTimes;
  error: string | null;
  load: () => Promise<void>;
}

/**
 * Holds the raw station/journey-time data fetched from maloca.homes.
 * Deliberately does NOT store the computed reachable-areas list — that's
 * derived from this plus the profile, so it's recomputed on demand
 * (see hooks/useReachableAreas.ts) rather than risking it going stale.
 */
export const useMapDataStore = create<MapDataState>((set, get) => ({
  status: 'idle',
  stations: [],
  journeyTimes: {},
  error: null,
  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading', error: null });
    try {
      // Bundled or previously-cached copy — always present, so the map draws
      // immediately and works with no connection at all.
      const [stations, journeyTimes] = await Promise.all([
        loadData<Area[]>('stations.json'),
        loadData<JourneyTimes>('journey-times.json'),
      ]);
      set({ status: 'ready', stations, journeyTimes });

      // Then look for newer data in the background. Deliberately after the map
      // is already usable, and deliberately not awaited — a slow or absent
      // connection must never delay someone seeing their areas. Anything
      // downloaded takes effect from the next launch.
      void syncData().then(({ updated, version }) => {
        if (updated.length) {
          console.log(`[mapdata] updated ${updated.length} file(s) to ${version}`);
        }
      });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
