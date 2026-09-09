import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AreaCards, Lifestyle, Member, Profile, PropertyCriteria } from '../lib/types';
import { effectiveLovedOrder, reorderToPosition } from '../lib/lovedAreas';

/**
 * Replaces the web app's window-global profile (js/profile.js) with
 * something a screen can actually subscribe to. Real sign-in/onboarding is
 * Week 3 — for now this seeds the same demo couple the website uses, so
 * there's real data to build the map against before auth exists.
 *
 * PERSISTED to the device (2026-09-09). It wasn't, and this was the one
 * store left without the treatment agentChatStore and shortlistStore
 * already got for exactly this reason: a plain in-memory Zustand store
 * resets to DEMO_PROFILE the moment its own module re-runs — a Metro
 * reload during development, same as always, but also any ordinary app
 * relaunch — and nothing automatically reloads it afterwards, because
 * profileFirebaseSync.ts only re-fetches from Firebase on an auth STATE
 * TRANSITION (signed out -> signed in), not on "the local profile just
 * went blank". Someone signed in from before saw their loved areas
 * silently vanish (Nick, 2026-09-09) with no sign-in event to trigger a
 * refetch. Firebase is still the durable source of truth across devices;
 * this just stops a reload on THIS device outrunning it.
 */

// Mirrors seedDemo() in js/profile.js: A & B, Canary Wharf & Holborn,
// 1km (12min) walk, 5min buffer at the far end. The commute limit is
// deliberately 50 rather than the web app's 60 — see COMMUTE_OPTIONS_MINS
// in lib/commuteSettings.ts for why 60 became too dense a first impression
// once the map went from 262 to 570 areas.
const DEMO_PROFILE: Profile = {
  isDemo: true,
  sharedCommuteLimit: true,
  maxCommuteMins: 50,
  members: [
    { id: 'm0', name: 'A', workId: 'canary_wharf', workLabel: 'Canary Wharf', offWalk: 5 },
    { id: 'm1', name: 'B', workId: 'holborn', workLabel: 'Holborn', offWalk: 5 },
  ],
};

interface ProfileState {
  profile: Profile;
  setProfile: (profile: Profile) => void;
  updateCommuteSettings: (patch: { maxCommuteMins?: number }) => void;
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
  /**
   * Turn a suggested area into one they love — the conversion the picks
   * carousel now offers on every card that isn't already loved (Nick,
   * 2026-09-09). A thin wrapper over updateAreaCards rather than a new
   * write path: love is still just areaCards[name] = 'love', so anything
   * already reading that (the map's rose pins, the ranking's own
   * exclusion of loved areas from its candidates) sees it immediately.
   */
  loveArea: (name: string) => void;
  /**
   * Move a loved area to position 1, 2 or 3 — "this will define the
   * user's preferred areas" (Nick, 2026-09-09). Reads the order actually on
   * screen (lib/lovedAreas.ts) rather than the raw lovedOrder field, so the
   * FIRST time anyone reorders, whatever was already showing (areas nobody
   * had touched, in the order they were loved) becomes the explicit order
   * from here on — nothing jumps around the moment someone makes their
   * first choice.
   */
  reorderLovedArea: (name: string, position: number) => void;
  /**
   * What the household wants in a property, for the Rightmove search.
   *
   * Replaced wholesale rather than merged: this comes off one form where
   * every field is on screen together, so a partial write would mean the
   * form disagreeing with what was saved. It also deliberately overwrites
   * anything the retired web app left on the profile (Nick, 2026-09-06) —
   * the app is the authority now, and those old fields were written by a
   * feature that never worked properly.
   */
  setPropertyCriteria: (criteria: PropertyCriteria) => void;
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

export const useProfileStore = create<ProfileState>()(
  persist<ProfileState>(
    (set) => ({
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
  loveArea: (name) =>
    set((state) => ({
      profile: { ...state.profile, areaCards: { ...state.profile.areaCards, [name]: 'love' } },
    })),
  reorderLovedArea: (name, position) =>
    set((state) => {
      const current = effectiveLovedOrder(state.profile.areaCards, state.profile.lovedOrder);
      return { profile: { ...state.profile, lovedOrder: reorderToPosition(current, name, position) } };
    }),
  setPropertyCriteria: (criteria) =>
    set((state) => ({ profile: { ...state.profile, propertyCriteria: criteria } })),
  setMembers: (members) =>
    set((state) => ({ profile: { ...state.profile, members, isDemo: false } })),
  resetToDemo: () => set({ profile: DEMO_PROFILE }),
  clearPreferences: () =>
    set((state) => {
      const { lifestyle, areaCards, ...rest } = state.profile;
      return { profile: rest };
    }),
    }),
    {
      name: 'maloca-profile',
      storage: createJSONStorage(() => AsyncStorage),
      // The whole profile is durable user data — unlike shortlistStore's
      // status/error/rankNow, there is no in-flight-request field here to
      // exclude. Named explicitly anyway, so a future transient field is a
      // deliberate exclusion rather than an accident.
      partialize: (state) => ({ profile: state.profile }) as ProfileState,
    },
  ),
);
