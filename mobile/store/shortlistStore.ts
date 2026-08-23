import { create } from 'zustand';
import type { RankedArea } from '../lib/ranking/parse';
import type { RankingCacheEntry } from '../lib/ranking/cache';

/**
 * The AI shortlist, plus the one piece of state that turns "here's what an
 * AI thinks" into "here's what we found out" — whether each area has
 * actually been visited. Nick's framing: the shortlist is a starting
 * point, not a verdict; visiting and rating is what narrows it for real.
 *
 * Local-only for now, same reason as ratingsStore: no auth on mobile yet
 * (Week 3), so this resets on restart. Shares that store's rating scale
 * and dots rather than inventing a second one.
 */

export interface ShortlistEntry extends RankedArea {
  visited: boolean;
}

interface ShortlistState {
  entries: ShortlistEntry[];
  cache: RankingCacheEntry | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  setResult: (ranked: RankedArea[], cache: RankingCacheEntry | null) => void;
  setLoading: () => void;
  setError: (message: string) => void;
  toggleVisited: (neighbourhood: string) => void;
}

export const useShortlistStore = create<ShortlistState>((set) => ({
  entries: [],
  cache: null,
  status: 'idle',
  error: null,

  setLoading: () => set({ status: 'loading', error: null }),

  setError: (message) => set({ status: 'error', error: message }),

  setResult: (ranked, cache) =>
    set((state) => {
      // Preserve visited flags across a re-rank — the AI's opinion can
      // change when preferences change, but whether you've actually been
      // somewhere is a fact about the world, not the model's to reset.
      const previouslyVisited = new Set(
        state.entries.filter((e) => e.visited).map((e) => e.neighbourhood),
      );
      return {
        entries: ranked.map((r) => ({ ...r, visited: previouslyVisited.has(r.neighbourhood) })),
        cache,
        status: 'ready',
        error: null,
      };
    }),

  toggleVisited: (neighbourhood) =>
    set((state) => ({
      entries: state.entries.map((e) =>
        e.neighbourhood === neighbourhood ? { ...e, visited: !e.visited } : e,
      ),
    })),
}));
