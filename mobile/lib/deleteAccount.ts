import { auth } from './firebase';
import { NotSignedInError } from './ranking/anthropicClient';

/**
 * Erasing an account, from inside the app.
 *
 * Required by both stores — Apple 5.1.1(v) and Play's equivalent — and the
 * server does the actual work (functions/index.js, deleteAccount), because
 * the household rules a deletion has to respect are only enforceable with
 * admin rights.
 *
 * There is no re-authentication step: the two-tap confirmation in the app
 * is what guards this. See the note in functions/index.js for why the
 * freshness check that used to be here was dropped.
 */

const DELETE_URL = 'https://europe-west1-nestfinderv3.cloudfunctions.net/deleteAccount';

export class DeleteAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeleteAccountError';
  }
}

export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new NotSignedInError();

  // forceRefresh, so the server sees the sign-in time as it stands now
  // rather than whatever was cached when the app last started.
  const idToken = await user.getIdToken(true);

  let res: Response;
  try {
    res = await fetch(DELETE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    });
  } catch {
    throw new DeleteAccountError('No connection. Try again when you’re back online.');
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // Logged with the status and the server's own code, because "couldn't
    // delete" on its own is unactionable — it reads the same whether the
    // server refused, the deploy is mid-flight, or something genuinely
    // broke. This is exactly what made a stale deploy look like a bug in
    // the app (Nick, 2026-09-14).
    console.warn('[delete] refused:', res.status, data?.error ?? '(no code)');
    if (data?.error === 'partial_deletion') {
      // Everything they own is gone; only the sign-in record survived.
      // Said accurately rather than as a flat failure, because "it didn't
      // work" would invite them to press it again on an empty account.
      throw new DeleteAccountError(
        'Your data has been deleted, but the sign-in record couldn’t be removed. Please contact us so we can finish it off.',
      );
    }
    throw new DeleteAccountError(
      typeof data?.error === 'string'
        ? `Couldn’t delete your account (${data.error}). Please try again.`
        : 'Couldn’t delete your account. Please try again.',
    );
  }
}
