import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RankedArea } from '../lib/ranking/parse';
import type { RankingCacheEntry } from '../lib/ranking/cache';
import type { AnchorEvidence } from '../lib/ranking/anchor';

/**
 * The AI shortlist, plus the one piece of state that turns "here's what an
 * AI thinks" into "here's what we found out" — whether each area has
 * actually been visited. Nick's framing: the shortlist is a starting
 * point, not a verdict; visiting and rating is what narrows it for real.
 *
 * PERSISTED to the device since 2026-09-01, and the reason is money as
 * much as speed. The cache lived in memory only, so every cold launch
 * re-ran the whole ranking — several proxy requests against a 200-a-month
 * allowance, to arrive at the list the app had already computed. It also
 * meant every launch began with a wait, which is most of what "there's a
 * big lag" was describing (Nick, 2026-09-01).
 *
 * A stale entry is harmless: rankingFingerprint covers the profile, the
 * reachable set and RANKING_LOGIC_VERSION, so anything that would change
 * the answer already invalidates it and a fresh run happens anyway.
 *
 * `visited` comes along with the entries, which fixes a second thing — the
 * detail card gates scoring on it, and a session-only flag meant that gate
 * closed again every launch.
 *
 * Scores themselves still live in verdictsStore and sync to Firebase
 * (users/{uid}/verdicts or households/{hid}/verdicts): a verdict is
 * evidence that cannot be re-collected, where a ranking can always be
 * recomputed.
 */

export interface ShortlistEntry extends RankedArea {
  visited: boolean;
}

interface ShortlistState {
  entries: ShortlistEntry[];
  cache: RankingCacheEntry | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  /**
   * Why each suggestion is on the list, keyed by neighbourhood — which
   * loved area it resembles, how closely, and on what.
   *
   * Kept beside the entries rather than merged into them because it has a
   * different lifetime: the walk-budget placeholder writes entries with no
   * evidence at all, and the model-led path (nobody named an area) has
   * none either. Empty is a normal state, not a missing one.
   */
  evidence: Record<string, AnchorEvidence>;
  /** The areas they named, for the "10 areas like X and Y" line. */
  anchors: string[];
  setResult: (
    ranked: RankedArea[],
    cache: RankingCacheEntry | null,
    evidence?: Record<string, AnchorEvidence>,
    anchors?: string[],
  ) => void;
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
  /**
   * Set when someone says they have finished talking — "See my areas", or
   * the last tap of setup.
   *
   * Ranking is normally debounced by 20 seconds (hooks/usePicks.ts) because
   * the Agent rewrites the whole profile on every conversational turn, and
   * one ranking run is several billed requests. That is right mid-
   * conversation and wrong the moment someone presses the button that means
   * "I'm done" — they then sat looking at the PREVIOUS ranking for twenty
   * seconds before the new one even started (Nick, 2026-09-01).
   *
   * Consumed once and cleared, so it cannot make later edits skip the
   * debounce too.
   */
  rankNow: boolean;
  requestRankNow: () => void;
  clearRankNow: () => void;
  setLoading: () => void;
  setError: (message: string) => void;
  toggleVisited: (neighbourhood: string) => void;
}

export const useShortlistStore = create<ShortlistState>()(
  persist<ShortlistState>(
    (set) => ({
      entries: [],
      cache: null,
      evidence: {},
      anchors: [],
      status: 'idle',
      error: null,
      rankingError: null,
      rankNow: false,

      requestRankNow: () => set({ rankNow: true }),
      clearRankNow: () => set({ rankNow: false }),

      setLoading: () => set({ status: 'loading', error: null }),

      setRankingError: (message) => set({ rankingError: message }),

      setError: (message) => set({ status: 'error', error: message }),

      setResult: (ranked, cache, evidence = {}, anchors = []) =>
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
            // Replaced wholesale, never merged: evidence belongs to the ranking
            // it came with, and keeping an old area's reasoning next to a new
            // ranking would explain a suggestion that is no longer being made.
            evidence,
            anchors,
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
    }),
    {
      name: 'maloca-shortlist',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the ANSWER, never the machinery. status/error/rankingError
      // describe one attempt and would rehydrate as a stale verdict on a
      // request that is no longer running; rankNow is a one-shot signal
      // that must not survive the session that set it.
      partialize: (state) =>
        ({
          entries: state.entries,
          cache: state.cache,
          evidence: state.evidence,
          anchors: state.anchors,
        }) as unknown as ShortlistState,
      onRehydrateStorage: () => (state) => {
        // Rehydrated entries are a finished result, so the screen must not
        // sit in 'idle' waiting for something that already happened.
        if (state && state.entries.length > 0) state.status = 'ready';
      },
    },
  ),
);
