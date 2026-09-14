import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOUR_STEPS } from '../components/OnboardingTour';

/**
 * The first-load walkthrough (Nick, 2026-09-11): setup used to hand
 * someone straight to a loading screen with nothing explaining what they
 * were about to land on. Started the instant setup finishes — see
 * app/setup.tsx and AgentChatView.tsx — so it runs CONCURRENTLY with the
 * ranking call rather than after it. See components/OnboardingTour.tsx.
 *
 * PERSISTED so it genuinely only happens once per device, the same reason
 * every other one-off flag in this app is persisted rather than kept in
 * memory.
 */
interface TutorialState {
  seen: boolean;
  active: boolean;
  step: number;
  start: () => void;
  next: () => void;
  skip: () => void;
  resetSeen: () => void;
}

/**
 * Re-exported from the tour itself so the count cannot drift from the
 * steps — it did, and a walkthrough that ends two taps after its last
 * slide is the kind of bug nobody reports, they just assume it is broken.
 */
export { TOUR_STEPS as TUTORIAL_STEPS } from '../components/OnboardingTour';

export const useTutorialStore = create<TutorialState>()(
  persist<TutorialState>(
    (set, get) => ({
      seen: false,
      active: false,
      step: 0,
      start: () => {
        if (get().seen || get().active) return;
        set({ active: true, step: 0 });
      },
      next: () => {
        const step = get().step + 1;
        if (step >= TOUR_STEPS) set({ active: false, seen: true });
        else set({ step });
      },
      skip: () => set({ active: false, seen: true }),
      /** Re-arms it (Nick, 2026-09-11): "start the Agent over" resets the
       *  whole conversation, and testing that repeatedly is the only reason
       *  this exists — a real user resetting their search prefs seeing the
       *  walkthrough again is an acceptable cost of not needing two
       *  separate reset flows. Called from profileStore's
       *  clearPreferences(), not exposed in any UI of its own. */
      resetSeen: () => set({ seen: false, active: false, step: 0 }),
    }),
    {
      name: 'maloca-tutorial',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ seen: state.seen }) as TutorialState,
    },
  ),
);
