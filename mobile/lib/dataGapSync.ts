import { push, ref, serverTimestamp } from 'firebase/database';
import { auth, db } from './firebase';
import { gapRow } from './dataGaps';

/**
 * Sends one "we could not answer this" row to Firebase — the write half of
 * lib/dataGaps.ts, split out for the same reason verdictSync.ts is split
 * from verdicts.ts: the shape is worth testing under plain Node, and this
 * file cannot be.
 *
 * Owner tooling, not a user feature (Nick, 2026-09-07). It goes to a node
 * no client can read — see the dataGaps rules in database.rules.json — and
 * is read in the Firebase console.
 */
export async function recordDataGap(
  area: string,
  missing: string[],
  fellBack: boolean,
): Promise<void> {
  const row = gapRow(area, missing, fellBack);
  if (!row) return;
  // The rules require a signed-in caller; writing without one would fail
  // anyway, and failing quietly here saves a pointless round trip.
  if (!auth.currentUser) return;
  try {
    await push(ref(db, 'dataGaps'), { ...row, ts: serverTimestamp() });
  } catch {
    /**
     * Silent by design. A failure to log must never disturb the
     * conversation, which is the thing the person actually came for — and
     * unlike a verdict, a lost row here costs a tally, not somebody's
     * opinion of a place they went to see.
     */
  }
}
