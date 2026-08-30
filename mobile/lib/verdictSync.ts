import { ref, get, set, remove } from 'firebase/database';
import { db } from './firebase';
import { isValidVerdict, sanitiseAreaKey, type Verdict } from './verdicts';

/**
 * Saves and loads verdicts, at households/{hid}/verdicts for a household
 * or users/{uid}/verdicts for someone on their own — the same split, and
 * the same stateless shape, as lib/profileSync.ts. Whoever calls this
 * (store/profileFirebaseSync.ts) is the one place that tracks which mode
 * an account is currently in.
 *
 * Stored as verdicts/{area}/{memberId} rather than as a flat list so one
 * person changing their mind about one area writes one node. It also
 * means a household's two verdicts on the same area sit side by side,
 * which is how the card wants to read them.
 *
 * Why these are worth persisting from day one, before anything learns
 * from them: verdicts only accumulate in real time (docs/learning-loop.md).
 * A rating lost to an app restart is a rating that can never be recovered,
 * because nobody re-visits Nunhead to score it again.
 */

function verdictsPath(uid: string, householdId: string | null): string {
  return householdId ? `households/${householdId}/verdicts` : `users/${uid}/verdicts`;
}

/** Fire-and-forget, like the profile writes — a failed save must never
 *  take down the card someone is in the middle of using. */
export async function saveVerdict(
  uid: string,
  householdId: string | null,
  verdict: Verdict,
): Promise<void> {
  if (!isValidVerdict(verdict)) return;
  try {
    const path = `${verdictsPath(uid, householdId)}/${sanitiseAreaKey(verdict.area)}/${verdict.memberId}`;
    await set(ref(db, path), verdict);
  } catch {
    // Silent — see doc comment above.
  }
}

export async function deleteVerdict(
  uid: string,
  householdId: string | null,
  area: string,
  memberId: string,
): Promise<void> {
  try {
    const path = `${verdictsPath(uid, householdId)}/${sanitiseAreaKey(area)}/${memberId}`;
    await remove(ref(db, path));
  } catch {
    // Silent — see doc comment above.
  }
}

/**
 * Everything this account (or household) has ever said, flattened.
 *
 * Anything that fails validation is DROPPED rather than repaired. A
 * half-formed verdict that later trains a ranking is worse than a missing
 * one — and the area key is re-read from the record's own `area` field,
 * not from the sanitised path key, so "St_ Johns Wood" can never leak
 * back out as a display name.
 */
export async function loadVerdicts(
  uid: string,
  householdId: string | null,
): Promise<Verdict[]> {
  try {
    const snap = await get(ref(db, verdictsPath(uid, householdId)));
    const data = snap.val();
    if (!data || typeof data !== 'object') return [];

    const out: Verdict[] = [];
    for (const byMember of Object.values(data as Record<string, unknown>)) {
      if (!byMember || typeof byMember !== 'object') continue;
      for (const candidate of Object.values(byMember as Record<string, unknown>)) {
        if (isValidVerdict(candidate)) out.push(candidate);
      }
    }
    return out;
  } catch {
    return [];
  }
}
