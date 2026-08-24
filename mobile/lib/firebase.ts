import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
// @firebase/auth's own package.json exports map has a bare top-level
// "types" key ("./dist/auth-public.d.ts") that TypeScript uses for every
// platform regardless of the "react-native" customCondition set in Expo's
// base tsconfig — so tsc reports this as missing even though Metro
// resolves the real JS through that same condition correctly at runtime.
// Verified directly against node_modules rather than assumed:
// @firebase/auth/dist/rn/index.rn.d.ts genuinely exports this function;
// tsc's type resolution just never reaches that file. A real upstream
// exports-map gap, not a mistake in this project's config.
// @ts-expect-error — see comment above; will error loudly if a future SDK
// version fixes the exports map and this suppression becomes unnecessary.
import { getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Same Firebase project the web app uses (nestfinderv3, europe-west1) —
 * nothing on the server changes for this rewrite, per the original plan.
 * This apiKey is a public identifier, not a secret; Firebase's real access
 * control is the database rules and Auth, not hiding this value.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyBPuXJmo0VRWkIJuG53S0oCxOxVjqbJvRs',
  authDomain: 'nestfinderv3.firebaseapp.com',
  databaseURL: 'https://nestfinderv3-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'nestfinderv3',
  storageBucket: 'nestfinderv3.firebasestorage.app',
  appId: '1:462786335336:web:bd234a0480ef6d4dd421dd',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/**
 * Without explicit AsyncStorage persistence, Firebase Auth on React Native
 * falls back to in-memory only — signed out on every app restart. This is
 * the one line that makes "stay signed in" actually work.
 */
export const auth: Auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

/** Realtime Database — pure JS client, no native module, so unlike auth
 *  this needed nothing beyond adding the import. Used by lib/profileSync.ts
 *  to save/load the profile under the same users/{uid}/profile path the
 *  web app already uses (js/profile.js). */
export const db: Database = getDatabase(app);

export { app };
