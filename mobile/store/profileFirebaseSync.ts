import { useAuthStore } from './authStore';
import { useProfileStore } from './profileStore';
import { useAppEntryStore } from './appEntryStore';
import { useHouseholdStore } from './householdStore';
import { useAgentChatStore } from './agentChatStore';
import { useShortlistStore } from './shortlistStore';
import { useVerdictsStore } from './verdictsStore';
import { syncProfileToFirebase, loadProfileFromFirebase, getHouseholdId } from '../lib/profileSync';
import { loadVerdicts } from '../lib/verdictSync';

/**
 * Closes the gap Nick flagged (2026-08-23): profile/lifestyle were local-
 * only Zustand state, so even a signed-in user was back on the demo
 * profile — and the whole first-run explainer sequence — every time the
 * app restarted. Sign-in itself already persisted (lib/firebase.ts's
 * AsyncStorage config); the profile just never followed it anywhere.
 *
 * Household-aware (2026-08-24): a signed-in account may belong to a
 * shared household (households/{id}/profile) instead of having its own
 * solo profile (users/{uid}/profile) — see lib/household.ts for how one
 * gets created/joined. householdStore holds whichever applies for the
 * CURRENT session, refreshed on sign-in and updated immediately by
 * createHousehold/joinHousehold on success, so a mid-session switch (just
 * started or joined a household) redirects the very next write without
 * needing a re-login to notice.
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
 * Zustand; a file that subscribes to three Zustand stores can't honestly
 * live there. lib/profileSync.ts (the actual Firebase read/write) stays in
 * lib/ correctly — it only touches lib/firebase.ts and lib/types.ts.
 *
 * Imported once, for its side effect, from app/_layout.tsx — importing it
 * anywhere else would just re-register the same subscriptions, since all
 * three stores are singletons.
 */

// Sign-in -> find out which household (if any) this account belongs to,
// then load ITS profile — the household's shared one if there is one,
// otherwise the account's own solo profile. Skips onboarding entirely in
// either case (isDemo false, lifestyle likely already set). No saved
// profile at all, but they already built a real one locally pre-sign-in
// (workplace entry works without an account, by design) -> that becomes
// their first saved copy instead of being silently lost — always as a
// solo profile in that case, since a brand-new sign-in can't already be
// in a household nobody's created yet.
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
    const loadPromise = getHouseholdId(uid).then(async (householdId) => {
      useHouseholdStore.getState().setHouseholdId(householdId);

      // Verdicts load with the profile rather than lazily on first card
      // open: a card that appears unrated for a second and then fills in
      // invites someone to re-score an area they already scored, which
      // silently overwrites the original with a worse-informed one.
      //
      // Started here but awaited at the end, so it runs ALONGSIDE the
      // profile fetch rather than after it — the boot splash covers both
      // and waits no longer than the slower of the two.
      const verdictsPromise = loadVerdicts(uid, householdId).then((verdicts) => {
        useVerdictsStore.getState().hydrate(verdicts);
      });

      const loaded = await loadProfileFromFirebase(uid, householdId);
      if (loaded) {
        useProfileStore.getState().setProfile(loaded);
      } else if (!householdId) {
        // Only meaningful for a solo account — a brand-new household
        // member with nothing loaded yet should NOT overwrite the shared
        // profile with whatever local demo state they happened to have.
        const current = useProfileStore.getState().profile;
        if (!current.isDemo) syncProfileToFirebase(uid, current, null);
      }
      await verdictsPromise;
    });
    if (isBootResolution) loadPromise.finally(() => useAppEntryStore.getState().markBootChecked());
  } else if (!isSignedIn && wasSignedIn) {
    // Signed OUT mid-session. Ending `exploring` is what actually returns
    // someone to the landing page: `ready` in app/_layout.tsx is
    // `user || exploring`, so without this they stayed in the tabs on a
    // signed-out map with no account and nothing that works — a demo they
    // never asked for (Nick, 2026-08-27).
    //
    // Everything loaded for that account is cleared with it. A profile,
    // conversation and shortlist left lying around would be shown to
    // whoever signs in next, which is worse than merely untidy — and the
    // profile write-through below is a no-op while signed out, so none of
    // this can reach Firebase.
    useAppEntryStore.getState().stopExploring();
    useHouseholdStore.getState().setHouseholdId(null);
    useProfileStore.getState().resetToDemo();
    useAgentChatStore.getState().restart();
    useShortlistStore.getState().setResult([], null);
    // Verdicts are personal data about where a household has physically
    // been. Leaving them on the phone for whoever signs in next is the
    // worst of the leftovers, not merely untidy.
    useVerdictsStore.getState().clear();
  } else if (isBootResolution) {
    // Booted signed-out — nothing to load, nothing to wait for.
    useAppEntryStore.getState().markBootChecked();
  }
  wasSignedIn = isSignedIn;
});

// Any later profile change (workplace entry, a slider drag, a chat turn
// updating lifestyle/areaCards) -> keep the saved copy current, so the
// NEXT sign-in-and-load actually reflects it. Reads householdId fresh
// from the store on every change, not just at sign-in — so a household
// created or joined mid-session redirects the very next write.
let lastProfile = useProfileStore.getState().profile;
useProfileStore.subscribe((state) => {
  if (state.profile === lastProfile) return;
  lastProfile = state.profile;
  const user = useAuthStore.getState().user;
  if (user) {
    const householdId = useHouseholdStore.getState().householdId;
    syncProfileToFirebase(user.uid, state.profile, householdId);
  }
});
