import { create } from 'zustand';
import type { RankedArea } from '../lib/ranking/parse';
import type { RankingCacheEntry } from '../lib/ranking/cache';

/**
 * The AI shortlist, plus the one piece of state that turns "here's what an
 * AI thinks" into "here's what we found out" — whether each area has
 * actually been visited. Nick's framing: the shortlist is a starting
 * point, not a verdict; visiting and rating is what narrows it for real.
 *
 * Still local-only, so `visited` resets on restart. The SCORES that used
 * to live beside it here have moved to verdictsStore, which does persist
 * (users/{uid}/verdicts or households/{hid}/verdicts) — a verdict is
 * evidence that only accrues in real time and cannot be re-collected,
 * where a visited flag can simply be re-ticked. Worth persisting this
 * too, but it is not the thing that would be lost forever.
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
  /**
   * Why the AI ranking did not run, in words a person can act on.
   *
   * Separate from `error`/`status` on purpose: the walk-budget placeholder
   * is still on screen and still usable, so this must not flip the list into
   * an error state and blank it. It explains why the list is not what they
   * were promised.
   *
   * It exists because the failure used to be swallowed by a bare catch. A
   * ranking that silently never runs is indistinguishable from one that ran
   * and chose badly — which is exactly how Canary Wharf's neighbours looked
   * like a ranking decision rather than raw commute order (2026-08-31).
   */
  rankingError: string | null;
  setRankingError: (message: string | null) => void;
  setLoading: () => void;
  setError: (message: string) => void;
  toggleVisited: (neighbourhood: string) => void;
}

export const useShortlistStore = create<ShortlistState>((set) => ({
  entries: [],
  cache: null,
  status: 'idle',
  error: null,
  rankingError: null,

  setLoading: () => set({ status: 'loading', error: null }),

  setRankingError: (message) => set({ rankingError: message }),

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
