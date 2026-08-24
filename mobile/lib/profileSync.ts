import { ref, get, set } from 'firebase/database';
import { db } from './firebase';
import type { Profile } from './types';

/**
 * Saves/loads the profile at users/{uid}/profile — the exact path and
 * shape the web app already uses (js/profile.js's syncToFirebase /
 * loadFromFirebase), so a Maloca account means the same thing on both.
 * database.rules.json already scopes all of users/$uid to its owner (plus
 * a mutual-consent partner exception), so this path needed no rule change.
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

/** Fire-and-forget, matching the web app's own pattern — a failed write
 *  just means next launch falls back to whatever's already saved (or the
 *  demo profile), never a crash mid-session. */
export async function syncProfileToFirebase(uid: string, profile: Profile): Promise<void> {
  // Never sync a demo profile — it's seeded sample data, not the user's
  // own, and must never land in a real account (same guard as the web app).
  if (profile.isDemo) return;
  try {
    await set(ref(db, `users/${uid}/profile`), profile);
  } catch {
    // Silent — see doc comment above.
  }
}

/** Returns the saved profile if one exists and looks real, else null —
 *  callers decide what "no saved profile" means (first-time sign-in). */
export async function loadProfileFromFirebase(uid: string): Promise<Profile | null> {
  try {
    const snap = await get(ref(db, `users/${uid}/profile`));
    const data = snap.val();
    return isValidProfile(data) ? data : null;
  } catch {
    return null;
  }
}
