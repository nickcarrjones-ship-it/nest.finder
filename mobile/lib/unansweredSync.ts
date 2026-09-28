import { push, ref, serverTimestamp } from 'firebase/database';
import { auth, db } from './firebase';
import { unansweredRow, type UnansweredRow } from './unanswered';

/**
 * Saves one scrubbed, unanswerable question to `unanswered/`, which no
 * client can read back (database.rules.json) and a scheduled function
 * clears after 90 days (functions/index.js). No uid is stored.
 *
 * Silent on failure, like recordDataGap: a lost row costs Nick one example,
 * and must never disturb the conversation somebody actually came for.
 */
export async function recordUnanswered(
  question: string,
  kind: UnansweredRow['kind'],
  areas: string[] = [],
): Promise<void> {
  const row = unansweredRow(question, kind, areas);
  if (!row || !auth.currentUser) return;
  try {
    await push(ref(db, 'unanswered'), { ...row, ts: serverTimestamp() });
  } catch {
    // See above.
  }
}
