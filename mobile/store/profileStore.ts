import { create } from 'zustand';
import type { AreaCards, Lifestyle, Member, Profile } from '../lib/types';

/**
 * Replaces the web app's window-global profile (js/profile.js) with
 * something a screen can actually subscribe to. Real sign-in/onboarding is
 * Week 3 — for now this seeds the same demo couple the website uses, so
 * there's real data to build the map against before auth exists.
 */

// Mirrors seedDemo() in js/profile.js: A & B, Canary Wharf & Holborn,
// 1km (12min) walk, 5min buffer at the far end. The commute limit is
// deliberately 50 rather than the web app's 60 — see COMMUTE_OPTIONS_MINS
// in lib/commuteSettings.ts for why 60 became too dense a first impression
// once the map went from 262 to 570 areas.
const DEMO_PROFILE: Profile = {
  isDemo: true,
  sharedCommuteLimit: true,
  sharedWalkLimit: true,
  maxCommuteMins: 50,
  walkHomeKm: 1,
  members: [
    { id: 'm0', name: 'A', workId: 'canary_wharf', workLabel: 'Canary Wharf', offWalk: 5 },
    { id: 'm1', name: 'B', workId: 'holborn', workLabel: 'Holborn', offWalk: 5 },
  ],
};

interface ProfileState {
  profile: Profile;
  setProfile: (profile: Profile) => void;
  updateCommuteSettings: (patch: { maxCommuteMins?: number; walkHomeKm?: number }) => void;
  /** Merged in, not replaced — the Agent chat sends whatever fields it read
   *  out of the latest turn, which is rarely all of them at once. */
  updateLifestyle: (patch: Partial<Lifestyle>) => void;
  updateAreaCards: (patch: AreaCards) => void;
  /**
   * Swap a vague area name for the real ones it turned out to mean.
   *
   * "Clapham" is not an area we hold; Clapham Common, High Street and
   * Junction are. A plain merge cannot do this because the vague entry has
   * to GO — left in place it stays unresolvable, and the ranking would
   * carry a name nothing can match for the rest of the search.
   */
  resolveAreaCard: (from: string, to: string[]) => void;
  /** Real workplace entry (WorkplaceEntrySheet) replacing the seeded demo
   *  members wholesale — up to 4 people, one household. Clears isDemo so
   *  the app stops treating this as a preview. */
  setMembers: (members: Member[]) => void;
  /** Wipes what the Agent learned, so the conversation can be run again.
   *  Syncs like any other profile change, so it clears on Firebase too —
   *  this genuinely forgets, it doesn't just hide. */
  clearPreferences: () => void;
  /** Back to the untouched demo profile — used when signing out, so the
   *  next person to sign in never sees the last one's data. */
  resetToDemo: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: DEMO_PROFILE,
  setProfile: (profile) => set({ profile }),
  updateCommuteSettings: (patch) =>
    set((state) => ({ profile: { ...state.profile, ...patch } })),
  updateLifestyle: (patch) =>
    set((state) => ({
      profile: { ...state.profile, lifestyle: { ...state.profile.lifestyle, ...patch } },
    })),
  updateAreaCards: (patch) =>
    set((state) => ({
      profile: { ...state.profile, areaCards: { ...state.profile.areaCards, ...patch } },
    })),
  resolveAreaCard: (from, to) =>
    set((state) => {
      const cards = { ...state.profile.areaCards };
      // Whatever they said about the vague name applies to the specific
      // ones — ruling out "Clapham" rules out whichever Claphams they meant.
      const verdict = cards[from] ?? 'love';
      delete cards[from];
      for (const name of to) cards[name] = verdict;
      return { profile: { ...state.profile, areaCards: cards } };
    }),
  setMembers: (members) =>
    set((state) => ({ profile: { ...state.profile, members, isDemo: false } })),
  resetToDemo: () => set({ profile: DEMO_PROFILE }),
  clearPreferences: () =>
    set((state) => {
      const { lifestyle, areaCards, ...rest } = state.profile;
      return { profile: rest };
    }),
}));
