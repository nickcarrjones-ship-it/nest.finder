import { create } from 'zustand';
import type { Profile } from '../lib/types';

/**
 * Holds the two candidate profiles while we wait for someone to say which
 * one they meant.
 *
 * Only ever populated when signing in finds a saved profile AND there is
 * real locally-entered data that disagrees with it — see
 * store/profileFirebaseSync.ts. Every other sign-in resolves silently, as
 * it should: a returning user opening the app has nothing to choose
 * between.
 *
 * The uid and householdId are captured WITH the choice rather than read
 * back when it is made. By then the answer could have changed — someone
 * joining a household mid-decision would otherwise write the chosen
 * profile to the wrong place.
 */
interface ProfileConflictState {
  /** What Firebase had against this account. */
  saved: Profile | null;
  /** What they had just entered before signing in. */
  local: Profile | null;
  uid: string | null;
  householdId: string | null;
  ask: (args: { saved: Profile; local: Profile; uid: string; householdId: string | null }) => void;
  /** Question answered (either way) or abandoned — clears the pending state. */
  clear: () => void;
}

export const useProfileConflictStore = create<ProfileConflictState>((set) => ({
  saved: null,
  local: null,
  uid: null,
  householdId: null,
  ask: ({ saved, local, uid, householdId }) => set({ saved, local, uid, householdId }),
  clear: () => set({ saved: null, local: null, uid: null, householdId: null }),
}));
