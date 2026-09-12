import { ref, get, set, remove } from 'firebase/database';
import { db } from './firebase';
import { isValidViewing, type Viewing } from './viewings';

/**
 * Saves and loads viewings, at households/{hid}/viewings for a household or
 * users/{uid}/viewings for someone on their own — the same split and the
 * same stateless shape as lib/verdictSync.ts and lib/profileSync.ts.
 * store/profileFirebaseSync.ts remains the one place that knows which mode
 * an account is in.
 *
 * Stored by id, so one person editing one viewing writes one node and never
 * stamps on the other person's edit to a different property. That matters
 * more here than anywhere else in the app: both people add viewings, often
 * at the same time, usually while one of them is on the phone to an agent.
 */

function viewingsPath(uid: string, householdId: string | null): string {
  return householdId ? `households/${householdId}/viewings` : `users/${uid}/viewings`;
}

export async function saveViewing(
  uid: string,
  householdId: string | null,
  viewing: Viewing,
): Promise<void> {
  if (!isValidViewing(viewing)) return;
  try {
    await set(ref(db, `${viewingsPath(uid, householdId)}/${viewing.id}`), viewing);
  } catch {
    // Silent, like every other write in the app: a failed sync must never
    // take down the sheet someone is in the middle of filling in. The local
    // store is already updated, and the next save re-sends the whole record.
  }
}

export async function deleteViewing(
  uid: string,
  householdId: string | null,
  id: string,
): Promise<void> {
  try {
    await remove(ref(db, `${viewingsPath(uid, householdId)}/${id}`));
  } catch {
    // Silent — see above.
  }
}

/**
 * Everything this account (or household) has saved.
 *
 * Anything failing validation is DROPPED rather than repaired — a viewing
 * without a usable coordinate would otherwise become a pin someone drives
 * to. See isValidViewing for what that means in practice.
 */
export async function loadViewings(
  uid: string,
  householdId: string | null,
): Promise<Viewing[]> {
  try {
    const snap = await get(ref(db, viewingsPath(uid, householdId)));
    const data = snap.val();
    if (!data || typeof data !== 'object') return [];
    return Object.values(data as Record<string, unknown>).filter(isValidViewing);
  } catch {
    return [];
  }
}
