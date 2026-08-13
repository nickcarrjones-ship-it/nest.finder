import { create } from 'zustand';

/**
 * 0-10 ratings per area, per household member — matches the web app's
 * rating concept (Shortlist tab, 1-10 dots per card) but this is a LOCAL
 * stand-in: no Firebase sync yet (mobile has no auth wired up — Week 3),
 * so ratings reset on app restart. Real persistence + the "each account
 * only edits their own row" rule (js/auth.js) is a later port, not tonight.
 */

type Ratings = Record<string, Record<string, number>>; // areaName -> memberId -> 0-10

interface RatingsState {
  ratings: Ratings;
  setRating: (areaName: string, memberId: string, value: number) => void;
  getRating: (areaName: string, memberId: string) => number | undefined;
}

export const useRatingsStore = create<RatingsState>((set, get) => ({
  ratings: {},
  setRating: (areaName, memberId, value) =>
    set((state) => ({
      ratings: {
        ...state.ratings,
        [areaName]: { ...state.ratings[areaName], [memberId]: value },
      },
    })),
  getRating: (areaName, memberId) => get().ratings[areaName]?.[memberId],
}));
