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
export const GOOGLE_WEB_CLIENT_ID = '462786335336-nc85g34g5b5umb3p5onkq38ju9vknftj.apps.googleusercontent.com';

/**
 * The iOS-specific OAuth client ID — genuinely different from the web one
 * above, and needed as a separate value: without it, GoogleSignin.configure()
 * fails at runtime on iOS with "failed to determine clientID... GoogleService-
 * Info.plist was not found and iosClientId was not provided." Found that from
 * the actual on-device error, not anticipated — an earlier claim that the web
 * client ID plus the URL scheme alone would be enough was wrong.
 *
 * Derived rather than re-requested: this is the same identifier already
 * given for app.json's iosUrlScheme (REVERSED_CLIENT_ID from
 * GoogleService-Info.plist), just un-reversed — Google's "reversed client ID"
 * is literally this value with its dot-segments flipped
 * ("com.googleusercontent.apps.{id}" <-> "{id}.apps.googleusercontent.com"),
 * not a separate secret to hunt down again.
 */
export const GOOGLE_IOS_CLIENT_ID = '462786335336-fpgto1g2cp2m1sa58v7oem7958uj0iv5.apps.googleusercontent.com';
