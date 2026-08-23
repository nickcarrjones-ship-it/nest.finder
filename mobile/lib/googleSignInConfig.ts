/**
 * The one value that has to come from Nick's own Firebase console, not
 * from anything in this codebase: the OAuth "Web client" ID that Firebase
 * auto-creates once Google is enabled as a sign-in provider.
 *
 * Where to find it: console.firebase.google.com -> nestfinderv3 ->
 * Authentication -> Sign-in method -> Google -> "Web SDK configuration" ->
 * "Web client ID". It looks like {digits}-{hash}.apps.googleusercontent.com.
 *
 * This is genuinely different from the apiKey/appId already in
 * lib/firebase.ts — those identify the Firebase project itself, this one
 * identifies the OAuth client that lets a Google sign-in be exchanged for a
 * Firebase credential, and it isn't something a previous session (or this
 * one) can look up or invent.
 */
export const GOOGLE_WEB_CLIENT_ID = 'REPLACE_ME_FROM_FIREBASE_CONSOLE';
