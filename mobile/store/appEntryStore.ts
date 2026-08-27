import { create } from 'zustand';

/**
 * The one thing the welcome screen needs to hand back to app/_layout.tsx:
 * "let me in as a guest." Lives in its own tiny store rather than
 * authStore (this isn't an auth concept — a guest never signs in) or
 * profileStore (it's not profile data) — just a single flag two unrelated
 * files both need to see.
 *
 * Session-only, deliberately: closing and reopening the app should ask
 * again, not remember "you explored once" forever. Signing in bypasses the
 * welcome screen on its own merits (see _layout.tsx's `ready` check) and
 * doesn't need this flag at all.
 */
interface AppEntryState {
  exploring: boolean;
  startExploring: () => void;
  /** True once the VERY FIRST auth resolution at app boot has been fully
   *  handled — including the Firebase profile load, if that resolution was
   *  "signed in" (see store/profileFirebaseSync.ts). app/_layout.tsx keeps
   *  the loading splash up until this flips, so a returning signed-in
   *  user's map never mounts on the stale local demo profile even for one
   *  frame. Set exactly once, ever, for the app's lifetime — a LATER
   *  in-session sign-in (e.g. from the map's own CTA) must NOT re-block
   *  ready, or it would bounce someone already using the app back to the
   *  welcome screen mid-session. */
  bootChecked: boolean;
  markBootChecked: () => void;
  /** Signing out ends an exploring session — see store/profileFirebaseSync.ts. */
  stopExploring: () => void;
}

export const useAppEntryStore = create<AppEntryState>((set) => ({
  exploring: false,
  startExploring: () => set({ exploring: true }),
  bootChecked: false,
  markBootChecked: () => set({ bootChecked: true }),
  stopExploring: () => set({ exploring: false }),
}));
