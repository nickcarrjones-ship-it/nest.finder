import {
  GoogleAuthProvider,
  reauthenticateWithCredential,
  type AuthCredential,
} from 'firebase/auth';
import { auth } from './firebase';
import { NotSignedInError } from './ranking/anthropicClient';
import { AppleSignInCancelled, getAppleCredential } from './appleSignIn';

/**
 * Proving it is still you, before something irreversible.
 *
 * Deleting an account is refused by the server unless the sign-in is
 * minutes old — otherwise an unlocked phone left on a table is enough to
 * wipe somebody's account. That check was right; what was missing was any
 * way to satisfy it.
 *
 * The first attempt reused the sign-in sheet and looped forever: the
 * sheet dismisses itself the moment a session exists, and re-authenticating
 * happens while already signed in, so it closed before anyone could touch
 * it, the token stayed stale, and the app asked again (Nick, 2026-09-14).
 *
 * Re-authentication is NOT signing in, and the difference is the whole
 * point. reauthenticateWithCredential refreshes the sign-in TIME on the
 * session that already exists; signInWithCredential would make a new one.
 * The provider is read off the account rather than offered as a choice —
 * asking someone which provider they used, at the moment they are being
 * asked to prove who they are, is a question they can get wrong.
 */

export class ReauthUnavailableError extends Error {
  constructor(providerId: string | undefined) {
    super(
      providerId
        ? `Can't confirm it's you with ${providerId}. Sign out and back in, then try again.`
        : "Can't confirm it's you. Sign out and back in, then try again.",
    );
    this.name = 'ReauthUnavailableError';
  }
}

/** Thrown when they back out of the provider's prompt. Not an error —
 *  a person changing their mind about deleting their account. */
export class ReauthCancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'ReauthCancelled';
  }
}

/**
 * Loaded lazily, like the Apple modules in appleSignIn.ts, and for a
 * second reason on top of that one: everything under lib/ is compiled and
 * run under plain Node by the test suite, so a native package imported at
 * the top of this file breaks `npm test` for the whole project — not just
 * for anything that touches sign-in.
 */
/**
 * Only the two pieces used here, described rather than imported.
 *
 * `typeof import(...)` of that package pulls its ESM types into this
 * CommonJS compile and fails, which is a build error rather than anything
 * real — so the shape is written out instead. Small, and it keeps the
 * whole package out of the test compile.
 */
interface GoogleSigninLike {
  GoogleSignin: {
    hasPlayServices: () => Promise<boolean>;
    signIn: () => Promise<unknown>;
  };
  isSuccessResponse: (r: unknown) => r is { data: { idToken: string | null } };
}

async function googleCredential(): Promise<AuthCredential> {
  const google = require('@react-native-google-signin/google-signin') as GoogleSigninLike;
  await google.GoogleSignin.hasPlayServices();
  const response = await google.GoogleSignin.signIn();
  // Closing the account picker, rather than a failure.
  if (!google.isSuccessResponse(response)) throw new ReauthCancelled();
  const { idToken } = response.data;
  if (!idToken) throw new Error('Google returned no ID token');
  return GoogleAuthProvider.credential(idToken);
}

export async function reauthenticate(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new NotSignedInError();

  // Whichever provider this account was actually created with. Firebase
  // rejects a credential from any other one, so guessing is not an option.
  const providerId = user.providerData[0]?.providerId;

  let credential: AuthCredential;
  try {
    if (providerId === 'apple.com') {
      credential = (await getAppleCredential()).credential;
    } else if (providerId === 'google.com') {
      credential = await googleCredential();
    } else {
      throw new ReauthUnavailableError(providerId);
    }
  } catch (err) {
    if (err instanceof AppleSignInCancelled) throw new ReauthCancelled();
    throw err;
  }

  await reauthenticateWithCredential(user, credential);
}
