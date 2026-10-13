import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The phone's side of anonymous usage counts (lib/usage.ts): the random
 * install id and whether the person has switched counting off in
 * Settings. Kept on the phone only. Signing out does not reset it, because
 * it identifies an install, not a person.
 */
interface UsageState {
  installId: string | null;
  optedOut: boolean;
  setInstallId: (id: string) => void;
  setOptedOut: (optedOut: boolean) => void;
}

export const useUsageStore = create<UsageState>()(
  persist(
    (set) => ({
      installId: null,
      optedOut: false,
      setInstallId: (installId) => set({ installId }),
      setOptedOut: (optedOut) => set({ optedOut }),
    }),
    {
      name: 'maloca-usage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ installId: state.installId, optedOut: state.optedOut }) as UsageState,
    },
  ),
);
