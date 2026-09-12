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

/** Apple's button must not appear on Android, on an iOS old enough not to
 *  have it, or on a build that predates the native module. Asked rather
 *  than assumed, and never allowed to throw. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  const appleAuth = getAppleAuth();
  if (!appleAuth || !getCrypto()) return false;
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
    if ((err as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
      throw new AppleSignInCancelled();
    }
    throw err;
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
