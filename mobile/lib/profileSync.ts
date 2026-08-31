import { ref, get, set } from 'firebase/database';
import { db } from './firebase';
import type { Profile } from './types';
import { migrateProfile, PROFILE_SCHEMA_VERSION } from './profileMigration';

/**
 * Saves/loads the profile — at users/{uid}/profile for someone on their
 * own, or households/{householdId}/profile once they're in a household
 * (2026-08-24). The web app only ever wrote users/{uid}/profile (js/
 * profile.js), so a solo mobile account still means the same thing there;
 * households are a mobile-only concept for now.
 *
 * Every function here takes householdId explicitly rather than looking it
 * up itself — keeps this file a plain, stateless read/write layer; whoever
 * calls it (profileFirebaseSync.ts) is the one place that tracks which
 * mode a given account is currently in.
 */

function isValidProfile(data: unknown): data is Profile {
  if (!data || typeof data !== 'object') return false;
  const members = (data as Profile).members;
  return (
    Array.isArray(members) &&
    members.length >= 1 &&
    members.every((m) => m && typeof m.name === 'string' && typeof m.workId === 'string')
  );
}

function profilePath(uid: string, householdId: string | null): string {
  return householdId ? `households/${householdId}/profile` : `users/${uid}/profile`;
}

/** Fire-and-forget, matching the web app's own pattern — a failed write
 *  just means next launch falls back to whatever's already saved (or the
 *  demo profile), never a crash mid-session. */
export async function syncProfileToFirebase(
  uid: string,
  profile: Profile,
  householdId: string | null,
): Promise<void> {
  // Never sync a demo profile — it's seeded sample data, not the user's
  // own, and must never land in a real account (same guard as the web app).
  if (profile.isDemo) return;
  try {
    /**
     * Stamped HERE, at the boundary, so nothing can reach Firebase without
     * a version — whatever route built it.
     *
     * Only migrateProfile ever set this before, and only when READING. So a
     * profile created on mobile was born without one, written without one,
     * and then classified as web-era on the next load — which strips
     * lifestyle and areaCards wholesale. A closed loop that deleted every
     * answer someone gave, on their second session, forever. It cost Nick
     * his rule-outs and his anchor, which is why Canary Wharf's neighbours
     * kept coming back (found in his real profile, 2026-08-31).
     *
     * Safe to stamp unconditionally: what is in memory has already been
     * through migrateProfile on the way in, so it is current by
     * construction. A brand-new profile is current trivially.
     */
    await set(ref(db, profilePath(uid, householdId)), {
      ...profile,
      schemaVersion: PROFILE_SCHEMA_VERSION,
    });
  } catch {
    // Silent — see doc comment above.
  }
}

/** Returns the saved profile if one exists and looks real, else null —
 *  callers decide what "no saved profile" means (first-time sign-in). */
export async function loadProfileFromFirebase(
  uid: string,
  householdId: string | null,
): Promise<Profile | null> {
  try {
    const snap = await get(ref(db, profilePath(uid, householdId)));
    const data = snap.val();
    if (!isValidProfile(data)) return null;
    // Migrated HERE rather than at the call sites so both reads — the solo
    // path and the household one — are covered by construction. The write
    // -through subscription then persists the cleaned shape on the next
    // change, which is what makes it stick.
    return migrateProfile(data);
  } catch {
    return null;
  }
}

/** Which household (if any) this account belongs to — read once at
 *  sign-in time; profileFirebaseSync.ts is the one place that caches it
 *  afterwards (in householdStore) rather than re-reading on every call. */
export async function getHouseholdId(uid: string): Promise<string | null> {
  try {
    const snap = await get(ref(db, `users/${uid}/householdId`));
    const val = snap.val();
    return typeof val === 'string' && val ? val : null;
  } catch {
    return null;
  }
}
