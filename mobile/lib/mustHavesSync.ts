import { ref, get, set } from 'firebase/database';
import { db } from './firebase';
import { isValidMustHave, MAX_MUST_HAVES, type MustHave } from './mustHaves';

/**
 * Saves and loads the household's must-haves, at
 * households/{hid}/mustHaves or users/{uid}/mustHaves — the same split and
 * the same stateless shape as viewingSync.ts and verdictSync.ts.
 *
 * Written as ONE list rather than node-by-node, which is the opposite of
 * how viewings are stored, and deliberately: the order IS the data here.
 * Writing each must-have to its own key would mean two people reordering
 * at once could interleave into a list neither of them chose. A whole-list
 * write means the last reorder wins outright, which is both understandable
 * and what a couple sorting a list together actually expects. Must-haves
 * are also edited rarely and deliberately, unlike viewings, which are added
 * by whoever is on the phone to the agent.
 */

function mustHavesPath(uid: string, householdId: string | null): string {
  return householdId ? `households/${householdId}/mustHaves` : `users/${uid}/mustHaves`;
}

export async function saveMustHaves(
  uid: string,
  householdId: string | null,
  mustHaves: MustHave[],
): Promise<void> {
  try {
    await set(ref(db, mustHavesPath(uid, householdId)), mustHaves.slice(0, MAX_MUST_HAVES));
  } catch {
    // Silent, like every other write in the app: a failed sync must never
    // interrupt someone mid-edit. The local store already has it, and the
    // next change re-sends the whole list.
  }
}

/**
 * The list, in order.
 *
 * Firebase stores an array as an object keyed "0", "1", "2" and hands back
 * whichever shape it feels like — a real array when the keys are complete
 * and contiguous, an object when a write ever left a gap. Both are handled
 * here rather than trusted, because getting this wrong silently reorders a
 * household's priorities, which is the one thing this list must not do.
 */
export async function loadMustHaves(
  uid: string,
  householdId: string | null,
): Promise<MustHave[]> {
  try {
    const snap = await get(ref(db, mustHavesPath(uid, householdId)));
    const data = snap.val();
    if (!data || typeof data !== 'object') return [];

    const rows = Array.isArray(data)
      ? data
      : Object.keys(data)
          .sort((a, b) => Number(a) - Number(b))
          .map((key) => (data as Record<string, unknown>)[key]);

    return rows.filter(isValidMustHave).slice(0, MAX_MUST_HAVES);
  } catch {
    return [];
  }
}
