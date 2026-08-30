import { create } from 'zustand';

/**
 * Whether this account still has to go through setup — decided ONCE, when
 * they sign in, and never re-derived.
 *
 * That "once" is the whole point of this store. The gate started life as a
 * plain expression in app/_layout.tsx:
 *
 *     needsSetup = user && !hasLifestyleSignal(profile.lifestyle)
 *
 * which re-evaluated on every profile write. The Agent writes lifestyle
 * fields as it parses each answer, so the first recognised preference
 * flipped the gate and expo-router swapped the setup screen out for the map
 * MID-CONVERSATION. Worse, sanitiseLifestyle can take a field back out
 * again, so the flag could oscillate and the map could mount and unmount
 * repeatedly — which is what MapLibre was complaining about on Nick's
 * phone: "`reactTag` 3472 resolved to `view` null" (2026-08-30).
 *
 * A gate that depends on the thing being collected behind it cannot be
 * stable. This one is latched instead: decided at sign-in, cleared only by
 * finishing setup or signing out.
 */
interface SetupState {
  /**
   * null = not decided yet (nobody signed in, or the profile has not
   * arrived). Guests exploring the demo stay null forever and never see
   * setup, which is the point of the showcase before sign-in.
   */
  required: boolean | null;
  decide: (required: boolean) => void;
  /** Setup finished. Also persisted onto the profile — see setup.tsx. */
  finish: () => void;
  /** Signing out — the next account decides for itself. */
  reset: () => void;
}

export const useSetupStore = create<SetupState>((set) => ({
  required: null,
  decide: (required) => set({ required }),
  finish: () => set({ required: false }),
  reset: () => set({ required: null }),
}));
