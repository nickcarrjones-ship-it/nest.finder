import * as Updates from 'expo-updates';
import Constants from 'expo-constants';

/**
 * What this phone is actually running, in one line.
 *
 * Over-the-air updates download on one launch and apply on the NEXT, so
 * there is always a window where the app looks unchanged because it
 * genuinely is - the JS from the previous update is still the JS in
 * memory. That window cost several rounds of "the fix did not work" when
 * the fix had simply not loaded yet (Nick, 2026-09-22 and 2026-09-23),
 * and nothing in the app could tell you which side of it you were on.
 *
 * Deliberately shows the UPDATE id, not just the app version. The app
 * version is baked into the build and never changes between OTA updates,
 * so it cannot answer the only question being asked: am I running the
 * code from ten minutes ago, or the code from yesterday?
 *
 * `Updates.updateId` is null when running the JS embedded in the build
 * itself - a fresh TestFlight install that has never taken an update -
 * which is a real and different state worth naming rather than blanking.
 */
export function versionLine(): string {
  const version = Constants.expoConfig?.version ?? '?';
  const build = Constants.expoConfig?.ios?.buildNumber
    ?? Constants.expoConfig?.android?.versionCode
    ?? '?';
  // Eight characters is plenty to match against an update id in the EAS
  // dashboard, and a full UUID on a phone screen is unreadable noise.
  const update = Updates.updateId ? Updates.updateId.slice(0, 8) : 'built-in';
  const channel = Updates.channel ?? 'none';
  return `${version} (${build}) · ${channel} · ${update}`;
}
