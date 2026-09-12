import { create } from 'zustand';
import { isValidViewing, sortViewings, type Viewing } from '../lib/viewings';

/**
 * The properties a household is going to see, or has seen.
 *
 * Held in memory and hydrated from Firebase on sign-in, exactly like
 * verdictsStore — NOT persisted to the device with AsyncStorage. The two
 * are different kinds of data: a verdict or a viewing is written by one
 * person and has to reach the other, so Firebase is the source of truth
 * and a local copy would only be something to reconcile. (The profile is
 * persisted precisely because it is edited before anyone signs in.)
 *
 * Writes go to the store first and to Firebase second, so the sheet closes
 * immediately whatever the connection is doing.
 */
interface ViewingsState {
  viewings: Record<string, Viewing>;
  /** Set once by the Firebase load, so the screen can tell "none yet"
   *  from "not loaded yet" — an empty list and an unfinished fetch look
   *  identical otherwise, and the empty state is a whole screen of copy. */
  hydrated: boolean;

  hydrate: (viewings: Viewing[]) => void;
  put: (viewing: Viewing) => void;
  drop: (id: string) => void;
  clear: () => void;

  get: (id: string) => Viewing | undefined;
  all: () => Viewing[];
}

export const useViewingsStore = create<ViewingsState>((set, get) => ({
  viewings: {},
  hydrated: false,

  hydrate: (viewings) =>
    set({
      viewings: Object.fromEntries(viewings.filter(isValidViewing).map((v) => [v.id, v])),
      hydrated: true,
    }),

  put: (viewing) =>
    set((state) => ({ viewings: { ...state.viewings, [viewing.id]: viewing } })),

  drop: (id) =>
    set((state) => {
      const next = { ...state.viewings };
      delete next[id];
      return { viewings: next };
    }),

  // Signing out clears these with everything else. Viewings are the most
  // sensitive thing the app holds — the addresses of real homes and when a
  // household will be standing outside them — so leaving them on a phone
  // for whoever signs in next is not merely untidy.
  clear: () => set({ viewings: {}, hydrated: false }),

  get: (id) => get().viewings[id],

  all: () => sortViewings(Object.values(get().viewings)),
}));
