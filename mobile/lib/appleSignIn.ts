import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { OAuthProvider, signInWithCredential, updateProfile } from 'firebase/auth';
import { auth } from './firebase';

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
 */

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
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replace(/-/g, '');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

/** Apple's button must not appear on Android, or on an iOS old enough not
 *  to have it. Asked rather than assumed from Platform.OS. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
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
  const { raw, hashed } = await makeNonce();

  let appleCredential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
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
