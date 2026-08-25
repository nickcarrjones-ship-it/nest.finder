import { create } from 'zustand';

/**
 * Which household (if any) this signed-in account belongs to — read from
 * users/{uid}/householdId on sign-in (see profileFirebaseSync.ts) and set
 * again the moment createHousehold/joinHousehold succeeds, so the very
 * next profile change is written to the shared household instead of the
 * old solo location without needing a re-login to notice.
 *
 * Just the id, not the household's member list or profile — those live
 * where they're actually used (profileStore already holds the shared
 * profile once loaded; the household screen reads member count directly
 * from Firebase when it needs it).
 */
interface HouseholdState {
  householdId: string | null;
  setHouseholdId: (id: string | null) => void;
}

export const useHouseholdStore = create<HouseholdState>((set) => ({
  householdId: null,
  setHouseholdId: (householdId) => set({ householdId }),
}));
