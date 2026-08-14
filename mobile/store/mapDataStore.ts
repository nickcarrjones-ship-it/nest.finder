import { create } from 'zustand';
import type { Area, JourneyTimes } from '../lib/types';
import { fetchJourneyTimes, fetchStations } from '../lib/mapData';

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
      const [stations, journeyTimes] = await Promise.all([fetchStations(), fetchJourneyTimes()]);
      set({ status: 'ready', stations, journeyTimes });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
