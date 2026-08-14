import { create } from 'zustand';
import type { Profile } from '../lib/types';

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
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: DEMO_PROFILE,
  setProfile: (profile) => set({ profile }),
  updateCommuteSettings: (patch) =>
    set((state) => ({ profile: { ...state.profile, ...patch } })),
}));
