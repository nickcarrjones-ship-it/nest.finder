import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AreaCards, Lifestyle, Member, Profile, PropertyCriteria } from '../lib/types';
import { effectiveLovedOrder, reorderToPosition } from '../lib/lovedAreas';
import { safeAreaName } from '../lib/profileMigration';
import { useTutorialStore } from './tutorialStore';

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
// 1km (12min) walk, 5min buffer at the far end.
//
// The commute limit is the number EVERY new account starts on, because
// setMembers only replaces the members — it leaves this alone — so this is
// what the slider reads on first load. 40 rather than the web app's 60 or
// the 50 it sat on until 2026-09-21 (Nick): see COMMUTE_OPTIONS_MINS in
// lib/commuteSettings.ts for why 60 became too dense a first impression
// once the map went from 262 to 570 areas, and 40 leaves somewhere to go
// in both directions on a slider that runs 20 to 60.
const DEMO_PROFILE: Profile = {
  isDemo: true,
  sharedCommuteLimit: true,
  maxCommuteMins: 40,
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
   * Move a loved area to any position 1..N — "this will define the
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
  /**
   * Names are made safe HERE, at the one door every area card comes
   * through — the Agent's extraction, the rule-out screen, the area
   * cards on the map. An area name is a Realtime Database KEY, and one
   * illegal character in it stops the whole profile syncing, silently and
   * permanently (see safeAreaName in lib/profileMigration.ts).
   */
  updateAreaCards: (patch) =>
    set((state) => {
      const safe: AreaCards = {};
      for (const [name, verdict] of Object.entries(patch)) {
        const key = safeAreaName(name);
        if (key) safe[key] = verdict;
      }
      return { profile: { ...state.profile, areaCards: { ...state.profile.areaCards, ...safe } } };
    }),
  resolveAreaCard: (from, to) =>
    set((state) => {
      const cards = { ...state.profile.areaCards };
      // Whatever they said about the vague name applies to the specific
      // ones — ruling out "Clapham" rules out whichever Claphams they meant.
      const verdict = cards[from] ?? 'love';
      delete cards[from];
      for (const name of to) {
        const key = safeAreaName(name);
        if (key) cards[key] = verdict;
      }
      return { profile: { ...state.profile, areaCards: cards } };
    }),
  loveArea: (name) =>
    set((state) => {
      const key = safeAreaName(name);
      if (!key) return state;
      return { profile: { ...state.profile, areaCards: { ...state.profile.areaCards, [key]: 'love' } } };
    }),
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
  clearPreferences: () => {
    // Re-arms the first-load walkthrough too (Nick, 2026-09-11): redoing
    // the whole conversation without seeing it again made testing "start
    // the Agent over" look broken — the tutorial's own seen flag lives in
    // a separate store precisely because it's a one-time-ever thing, but
    // a from-scratch conversation is the one case that should override
    // that and re-show it.
    useTutorialStore.getState().resetSeen();
    set((state) => {
      /**
       * setupDoneAt and lovedOrder go too (Nick, 2026-09-09).
       *
       * Dropping only lifestyle and areaCards left setupDoneAt sitting on
       * the profile, and that one flag is what the ENTIRE scripted
       * conversation is gated on — three separate places read it
       * (agentChatStore's `scripted` and `inSetup`, AgentChatView's tap
       * questions). So "start the Agent over" wiped the answers but left
       * the app certain the conversation had already finished: no scripted
       * question was ever put on screen again, and every message the person
       * typed was instead routed to the LLM as a question about an area and
       * answered with a real model call. Nick's read of that was exactly
       * right — "why have we gone back to calling the LLM with each
       * question?" — the script had not been re-enabled, so there was
       * nothing else left for a message to be.
       *
       * lovedOrder is the same class of leftover: a deliberate ranking of
       * areas that no longer exist, which would silently re-apply itself to
       * any area that happened to be loved by the same name next time.
       */
      const { lifestyle, areaCards, setupDoneAt, lovedOrder, ...rest } = state.profile;
      return { profile: rest };
    });
  },
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
