import {
  GoogleAuthProvider,
  getIdTokenResult,
  reauthenticateWithCredential,
  type AuthCredential,
  type User,
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

const SUPPORTED = ['apple.com', 'google.com'];

/**
 * Which provider THIS SESSION signed in with.
 *
 * Taken from the token's own sign-in claim, not from providerData[0].
 * That array is the providers LINKED to the account, in the order they
 * were linked — so an account created with Google and later signed into
 * with Apple still reports Google first, and the app asks for the wrong
 * one. Which is exactly what happened (Nick, 2026-09-14).
 *
 * Falls back to the linked list only when the claim is missing or names
 * something this app cannot prompt for, since a re-auth it can actually
 * perform beats a correct answer it cannot act on.
 */
async function currentProvider(user: User): Promise<string | undefined> {
  try {
    const token = await getIdTokenResult(user);
    if (token.signInProvider && SUPPORTED.includes(token.signInProvider)) {
      return token.signInProvider;
    }
  } catch {
    // Offline, or the token would not refresh. The linked list below is
    // a worse answer than the claim, but a better one than none.
  }
  return user.providerData.map((p) => p?.providerId).find((id) => id && SUPPORTED.includes(id));
}

export async function reauthenticate(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new NotSignedInError();

  // Firebase rejects a credential from a provider this account is not
  // linked to, so this cannot be guessed at.
  const providerId = await currentProvider(user);

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
