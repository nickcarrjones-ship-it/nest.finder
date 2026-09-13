import { OAuthProvider, signInWithCredential, updateProfile } from 'firebase/auth';
import { auth } from './firebase';
import type * as AppleAuthenticationTypes from 'expo-apple-authentication';

/**
 * Sign in with Apple.
 *
 * Required, not optional: Apple's guideline 4.8 says an app whose only
 * sign-in is a third-party service must also offer one that lets people
 * withhold their real email address. Google Sign-In does not do that, so
 * without this the app is rejected on submission rather than on merit.
 *
 * It is also genuinely the better option for this app. Maloca knows where
 * a household is going to be standing and when; someone who would rather
 * not attach their real inbox to that can now use Apple's relay address
 * and still share a household with their partner.
 *
 * ── Why both native modules are loaded LAZILY ──────────────────────────
 *
 * Importing them at the top of this file took the WHOLE APP DOWN on every
 * build that predated them. The chain is not obvious: authStore imports
 * this file, the tab layout imports authStore, so expo-crypto's native
 * module was resolved before the first screen rendered — and a dev client
 * built before these packages were added does not have it. The result was
 * not "Apple sign-in is unavailable", it was a red screen at launch
 * (Nick, 2026-09-12).
 *
 * Requiring them inside the functions that use them means a missing native
 * module can only ever disable the button that needs it. That is worth
 * keeping permanently rather than reverting after the next rebuild: it is
 * exactly the failure a TestFlight tester hits when a JS update reaches a
 * binary that is one build behind.
 */

type AppleAuth = typeof AppleAuthenticationTypes;
type ExpoCrypto = typeof import('expo-crypto');

let appleAuthModule: AppleAuth | null | undefined;
let cryptoModule: ExpoCrypto | null | undefined;

/** The module, or null where the running binary has no such native code.
 *  Cached, including the failure — a missing module will not appear
 *  halfway through a session, and retrying costs a throw every render. */
export function getAppleAuth(): AppleAuth | null {
  if (appleAuthModule === undefined) {
    try {
      appleAuthModule = require('expo-apple-authentication') as AppleAuth;
    } catch {
      appleAuthModule = null;
    }
  }
  return appleAuthModule;
}

function getCrypto(): ExpoCrypto | null {
  if (cryptoModule === undefined) {
    try {
      cryptoModule = require('expo-crypto') as ExpoCrypto;
    } catch {
      cryptoModule = null;
    }
  }
  return cryptoModule;
}

/**
 * The nonce is the part that is easy to get subtly wrong, so it is worth
 * spelling out. Apple is handed the SHA-256 HASH of a random string, and
 * Firebase is handed the ORIGINAL. Firebase hashes its copy and checks the
 * two match, which is what proves the token came back from the request we
 * actually made rather than being replayed from somewhere else.
 *
 * Send the same value to both and the check is worthless; send them the
 * wrong way round and Firebase rejects every sign-in.
 */
async function makeNonce(crypto: ExpoCrypto): Promise<{ raw: string; hashed: string }> {
  const raw = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
  const hashed = await crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

/**
 * Apple's button must not appear on Android, on an iOS old enough not to
 * have it, or on a build that predates the native module.
 *
 * Checks ONLY expo-apple-authentication, deliberately. It used to test
 * expo-crypto here too — belt and braces, since a sign-in that cannot
 * hash its nonce cannot finish — and that reintroduced the launch crash
 * the lazy loading was meant to end: requiring expo-crypto pulls in its
 * AES submodule, which resolves its native module at the top level, and
 * in dev that reaches the error overlay as an uncaught error whatever
 * this file catches (Nick, 2026-09-12).
 *
 * Nothing is really given up. The two packages are installed together and
 * ship in the same binary, so "Apple auth present, crypto missing" is not
 * a state that occurs — and signInWithApple still checks for it and says
 * so plainly rather than failing obscurely.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  const appleAuth = getAppleAuth();
  if (!appleAuth) return false;
  try {
    return await appleAuth.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Thrown when someone closes Apple's sheet. Not an error state — it is a
 *  person changing their mind, and it must not show a red message. */
export class AppleSignInCancelled extends Error {
  constructor() {
    super('Sign-in cancelled');
    this.name = 'AppleSignInCancelled';
  }
}

/**
 * Apple's failures in words somebody can act on.
 *
 * Left alone, the raw error reaches the screen as
 * "RequestUnknownException: The authorization attempt failed for an
 * unknown reason (at ExpoAppleAuthentication/...swift:61)" — a Swift file
 * and line number, shown to a person trying to sign in (Nick, 2026-09-13).
 *
 * ERR_REQUEST_UNKNOWN is the one worth wording carefully, because it is
 * what Apple returns for two completely different situations: no Apple ID
 * signed in on the device, and an app not entitled to use Sign in with
 * Apple. The first is the user's to fix and the second is ours, so the
 * message names the one they can do something about and stays quiet about
 * the other rather than guessing.
 */
function appleErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'ERR_REQUEST_UNKNOWN':
      return 'Apple couldn’t complete that. Check you’re signed in to an Apple Account on this device, then try again.';
    case 'ERR_REQUEST_NOT_HANDLED':
      return 'Apple couldn’t handle that request. Try again in a moment.';
    case 'ERR_REQUEST_NOT_INTERACTIVE':
      return 'Apple needs the app open and in front of you to sign in.';
    case 'ERR_REQUEST_FAILED':
    case 'ERR_REQUEST_INVALID_RESPONSE':
      return 'Apple couldn’t sign you in just now. Try again, or use Google instead.';
    default:
      return 'Apple couldn’t sign you in. Try again, or use Google instead.';
  }
}

export async function signInWithApple(): Promise<void> {
  const appleAuth = getAppleAuth();
  const crypto = getCrypto();
  if (!appleAuth || !crypto) {
    throw new Error('Sign in with Apple needs a newer version of the app.');
  }

  const { raw, hashed } = await makeNonce(crypto);

  let appleCredential: AppleAuthenticationTypes.AppleAuthenticationCredential;
  try {
    appleCredential = await appleAuth.signInAsync({
      requestedScopes: [
        appleAuth.AppleAuthenticationScope.FULL_NAME,
        appleAuth.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'ERR_REQUEST_CANCELED') throw new AppleSignInCancelled();
    // The real one stays in the console, where it is the part worth
    // diagnosing; the screen gets a sentence instead of a Swift file path.
    console.warn('[apple] sign-in failed:', code, err);
    throw new Error(appleErrorMessage(code));
  }

  const { identityToken, fullName } = appleCredential;
  if (!identityToken) throw new Error('Apple sign-in returned no identity token');

  const credential = new OAuthProvider('apple.com').credential({
    idToken: identityToken,
    rawNonce: raw,
  });
  const result = await signInWithCredential(auth, credential);

  /**
   * Apple hands over the name ONCE — on the very first sign-in for this
   * app, and never again. Miss it here and every screen that greets
   * somebody by name shows an email address forever, and there is no
   * second chance to ask Apple for it.
   */
  const name = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ').trim();
  if (name && !result.user.displayName) {
    try {
      await updateProfile(result.user, { displayName: name });
    } catch {
      // A name is a nicety; failing to store it must not fail the sign-in
      // somebody has just completed.
    }
  }
}
