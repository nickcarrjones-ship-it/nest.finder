import { create } from 'zustand';
import { GoogleSignin, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential, signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { AppleSignInCancelled, signInWithApple } from '../lib/appleSignIn';

/**
 * Native Google sign-in, bridged into the same Firebase project the web app
 * uses. The flow: native account picker (GoogleSignin.signIn) hands back a
 * Google ID token; GoogleAuthProvider turns that into a Firebase credential;
 * signInWithCredential exchanges it for a real Firebase session, persisted
 * via lib/firebase.ts's AsyncStorage config so it survives app restarts.
 *
 * Both IDs come from Nick's Firebase console — see lib/googleSignInConfig.ts
 * for where each one lives and why they're genuinely different values.
 * iosClientId is required on iOS specifically: without it, GoogleSignin
 * fails at runtime looking for a bundled GoogleService-Info.plist we
 * deliberately don't ship (the JS SDK doesn't need the rest of that file).
 */
export function configureGoogleSignIn(webClientId: string, iosClientId: string): void {
  GoogleSignin.configure({ webClientId, iosClientId, offlineAccess: false });
}

interface AuthState {
  user: User | null;
  status: 'idle' | 'checking' | 'signing-in' | 'signed-in' | 'signed-out' | 'error';
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  /** Required by Apple guideline 4.8, and the only option that lets
   *  somebody keep their real email address out of this. */
  signInWithApple: () => Promise<void>;
  /**
   * Email and password, sign-in only (Nick, 2026-10-05). For the App
   * Review account Apple needs to log in with, and nothing else: there is
   * deliberately no way to CREATE an account like this in the app, so the
   * only email logins that exist are ones added by hand in Firebase.
   */
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

/** What went wrong, in words, rather than Firebase's error codes. */
function emailSignInError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(code)) {
    return "that email and password don't match.";
  }
  if (code === 'auth/invalid-email') return "that doesn't look like an email address.";
  if (code === 'auth/too-many-requests') return 'too many tries. Wait a minute and try again.';
  if (code === 'auth/network-request-failed') return 'no connection. Check your signal and try again.';
  if (code === 'auth/operation-not-allowed') return "email sign-in isn't switched on for Maloca yet.";
  if (code === 'auth/user-disabled') return 'this account has been switched off.';
  return err instanceof Error ? err.message : String(err);
}

export const useAuthStore = create<AuthState>((set) => {
  // Fires once at startup with whatever session AsyncStorage already has,
  // then again on every future sign-in/out — this is the single source of
  // truth for auth state, not the result of signInWithGoogle itself.
  onAuthStateChanged(auth, (user) => {
    set({ user, status: user ? 'signed-in' : 'signed-out' });
  });

  return {
    user: null,
    status: 'checking',
    error: null,

    signInWithGoogle: async () => {
      set({ status: 'signing-in', error: null });
      try {
        await GoogleSignin.hasPlayServices();
        const response = await GoogleSignin.signIn();
        if (!isSuccessResponse(response)) {
          // User closed the account picker — not an error, just no-op back
          // to signed-out rather than showing a scary error state.
          set({ status: 'signed-out' });
          return;
        }
        const { idToken } = response.data;
        if (!idToken) throw new Error('Google sign-in returned no ID token');
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
        // onAuthStateChanged above sets status: 'signed-in' once Firebase
        // confirms the session — not set here, to avoid a state that's
        // "signed in" by this function's own optimism but not yet by Firebase.
      } catch (err: any) {
        if (err?.code === statusCodes.SIGN_IN_CANCELLED) {
          set({ status: 'signed-out' });
          return;
        }
        set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    },

    signInWithApple: async () => {
      set({ status: 'signing-in', error: null });
      try {
        await signInWithApple();
        // Status is set by onAuthStateChanged above, once Firebase
        // confirms the session — never by this function's own optimism.
      } catch (err) {
        if (err instanceof AppleSignInCancelled) {
          // Closed the sheet. Not an error, and must not look like one.
          set({ status: 'signed-out' });
          return;
        }
        set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    },

    signInWithEmail: async (email, password) => {
      set({ status: 'signing-in', error: null });
      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        // Status is set by onAuthStateChanged above, as with the others.
      } catch (err) {
        set({ status: 'error', error: emailSignInError(err) });
      }
    },

    signOut: async () => {
      try {
        await GoogleSignin.signOut();
      } catch {
        // Already signed out of Google, or never was — not fatal, Firebase
        // sign-out below is what actually matters for app state.
      }
      await firebaseSignOut(auth);
    },
  };
});
