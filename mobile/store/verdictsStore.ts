import { create } from 'zustand';
import {
  verdictKey,
  type Score,
  type Verdict,
  type VerdictBasis,
} from '../lib/verdicts';

/**
 * What the household has said about the areas it has been to.
 *
 * Held as a map keyed by area|member so the card can read one person's
 * verdict on one area in a lookup, and so a second person's score never
 * overwrites the first's — two people disagreeing is a fact worth
 * keeping, not a conflict to resolve (docs/learning-loop.md).
 *
 * Nothing in here learns. It records. The learning (Level 1, adjusting
 * one person's own weights from their own verdicts) comes later and reads
 * from exactly this.
 */

/** The in-progress state of a card someone is filling in. `score: null`
 *  is a real, meaningful state — nobody has said anything yet. */
export interface DraftVerdict {
  score: Score;
  basis: VerdictBasis;
  reasons: string[];
  note: string;
}

export const EMPTY_DRAFT: DraftVerdict = {
  score: null,
  // Conservative by default. If they have not told us they went, we assume
  // they did not: over-weighting a guess is a worse error than
  // under-weighting a real visit, because a guess is model-recall by
  // another name — the exact thing this project exists to escape. The
  // card upgrades this to 'been' when the area is already marked visited.
  basis: 'guess',
  reasons: [],
  note: '',
};

interface VerdictsState {
  verdicts: Record<string, Verdict>;
  /** Set once by a Firebase load, so the UI can tell "none yet" from "not loaded". */
  hydrated: boolean;

  hydrate: (verdicts: Verdict[]) => void;
  put: (verdict: Verdict) => void;
  clear: () => void;

  get: (area: string, memberId: string) => Verdict | undefined;
  forArea: (area: string) => Verdict[];
  count: () => number;
}

export const useVerdictsStore = create<VerdictsState>((set, get) => ({
  verdicts: {},
  hydrated: false,

  hydrate: (verdicts) =>
    set(() => ({
      verdicts: Object.fromEntries(verdicts.map((v) => [verdictKey(v.area, v.memberId), v])),
      hydrated: true,
    })),

  put: (verdict) =>
    set((state) => ({
      verdicts: { ...state.verdicts, [verdictKey(verdict.area, verdict.memberId)]: verdict },
    })),

  // Signing out clears these with everything else: a household's verdicts
  // are personal data about where they have been, and must never be shown
  // to whoever signs in next on the same phone.
  clear: () => set({ verdicts: {}, hydrated: false }),

  get: (area, memberId) => get().verdicts[verdictKey(area, memberId)],

  forArea: (area) =>
    Object.values(get().verdicts)
      .filter((v) => v.area === area)
      .sort((a, b) => a.at - b.at),

  count: () => Object.keys(get().verdicts).length,
}));
