import { useAuthStore } from './authStore';
import { useProfileStore } from './profileStore';
import { useAppEntryStore } from './appEntryStore';
import { syncProfileToFirebase, loadProfileFromFirebase } from '../lib/profileSync';

/**
 * Closes the gap Nick flagged (2026-08-24): profile/lifestyle were local-
 * only Zustand state, so even a signed-in user was back on the demo
 * profile — and the whole first-run explainer sequence — every time the
 * app restarted. Sign-in itself already persisted (lib/firebase.ts's
 * AsyncStorage config); the profile just never followed it anywhere.
 *
 * This is a standalone module, not logic living inside either store, on
 * purpose: profileStore importing authStore (to know who to sync as) and
 * authStore importing profileStore (to know what to load) would be a
 * circular import between the two. Subscribing to both from a third file
 * that depends on both, but that neither store depends on, avoids that
 * while keeping each store's own file free of Firebase concerns.
 *
 * Lives in store/, not lib/, despite being about persistence — lib/ is
 * compiled and run standalone in plain Node for tests (tsconfig.test.json,
 * rootDir: "./lib"), specifically so it never depends on React Native or
 * Zustand; a file that subscribes to two Zustand stores can't honestly
 * live there. lib/profileSync.ts (the actual Firebase read/write) stays in
 * lib/ correctly — it only touches lib/firebase.ts and lib/types.ts.
 *
 * Imported once, for its side effect, from app/_layout.tsx — importing it
 * anywhere else would just re-register the same two subscriptions, since
 * both stores are singletons.
 */

// Sign-in -> load their saved profile if one exists (skips onboarding
// entirely: isDemo false, lifestyle likely already set). No saved profile
// but they already built a real one locally before signing in (workplace
// entry works without an account, by design) -> that becomes their first
// saved copy instead of being silently lost.
//
// The FIRST time this fires — which is also the app's very first word
// from Firebase about auth state, cold-start included — it additionally
// reports back to appEntryStore once fully settled, so _layout.tsx can
// hold its loading splash through the load rather than mounting the map
// on stale local state. Every later transition (an in-session sign-in
// from the map's own CTA, a sign-out) skips that reporting entirely —
// only the boot resolution should ever gate `ready`.
let wasSignedIn = false;
let bootResolved = false;
useAuthStore.subscribe((state) => {
  const isSignedIn = Boolean(state.user);
  const isBootResolution = !bootResolved;
  bootResolved = true;

  if (isSignedIn && !wasSignedIn) {
    const uid = state.user!.uid;
    const loadPromise = loadProfileFromFirebase(uid).then((loaded) => {
      if (loaded) {
        useProfileStore.getState().setProfile(loaded);
      } else {
        const current = useProfileStore.getState().profile;
        if (!current.isDemo) syncProfileToFirebase(uid, current);
      }
    });
    if (isBootResolution) loadPromise.finally(() => useAppEntryStore.getState().markBootChecked());
  } else if (isBootResolution) {
    // Booted signed-out — nothing to load, nothing to wait for.
    useAppEntryStore.getState().markBootChecked();
  }
  wasSignedIn = isSignedIn;
});

// Any later profile change (workplace entry, a slider drag, a chat turn
// updating lifestyle/areaCards) -> keep the saved copy current, so the
// NEXT sign-in-and-load actually reflects it.
let lastProfile = useProfileStore.getState().profile;
useProfileStore.subscribe((state) => {
  if (state.profile === lastProfile) return;
  lastProfile = state.profile;
  const user = useAuthStore.getState().user;
  if (user) syncProfileToFirebase(user.uid, state.profile);
});
