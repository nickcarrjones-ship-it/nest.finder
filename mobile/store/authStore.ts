import { create } from 'zustand';
import { GoogleSignin, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential, signOut as firebaseSignOut, onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';

/**
 * Native Google sign-in, bridged into the same Firebase project the web app
 * uses. The flow: native account picker (GoogleSignin.signIn) hands back a
 * Google ID token; GoogleAuthProvider turns that into a Firebase credential;
 * signInWithCredential exchanges it for a real Firebase session, persisted
 * via lib/firebase.ts's AsyncStorage config so it survives app restarts.
 *
 * webClientId is Nick's one required console step — see comment below.
 */
export function configureGoogleSignIn(webClientId: string): void {
  GoogleSignin.configure({ webClientId, offlineAccess: false });
}

interface AuthState {
  user: User | null;
  status: 'idle' | 'checking' | 'signing-in' | 'signed-in' | 'signed-out' | 'error';
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
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
