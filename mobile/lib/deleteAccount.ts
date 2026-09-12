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
 * The one thing worth knowing here is `reauth_required`. Deleting is
 * irreversible, so the server insists the sign-in is minutes old rather
 * than a session resumed on a phone left on a table. When it says no, the
 * answer is to sign in again — which is what confirms the person pressing
 * the button is the person who owns the account, and not whoever picked
 * the phone up.
 */

const DELETE_URL = 'https://europe-west1-nestfinderv3.cloudfunctions.net/deleteAccount';

export class ReauthRequiredError extends Error {
  constructor() {
    super('Please confirm it’s you before deleting your account.');
    this.name = 'ReauthRequiredError';
  }
}

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

  if (res.status === 401 && data?.error === 'reauth_required') {
    throw new ReauthRequiredError();
  }

  if (!res.ok) {
    if (data?.error === 'partial_deletion') {
      // Everything they own is gone; only the sign-in record survived.
      // Said accurately rather than as a flat failure, because "it didn't
      // work" would invite them to press it again on an empty account.
      throw new DeleteAccountError(
        'Your data has been deleted, but the sign-in record couldn’t be removed. Please contact us so we can finish it off.',
      );
    }
    throw new DeleteAccountError('Couldn’t delete your account. Please try again.');
  }
}
