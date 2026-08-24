import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { configureGoogleSignIn, useAuthStore } from '../store/authStore';
import { useAppEntryStore } from '../store/appEntryStore';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../lib/googleSignInConfig';
// Side-effect only — registers the auth<->profile Firebase sync once at
// startup (see the file for why this lives on its own rather than inside
// either store). Nothing here is called directly.
import '../store/profileFirebaseSync';

/**
 * Which top-level screen is reachable at all, gated with Stack.Protected
 * (expo-router's own mechanism for this, not a hand-rolled conditional —
 * see node_modules/expo-router/build/views/Protected.d.ts, confirmed
 * present in this installed version before using it):
 *
 *   Still resolving ("checking" auth, or auth resolved signed-in but the
 *     boot-time Firebase profile load hasn't finished — see bootChecked in
 *     store/appEntryStore.ts) -> a brief spinner, neither screen mounted.
 *   signed in, OR chose "Explore" on the welcome screen -> (tabs).
 *   otherwise -> welcome.
 *
 * This is what makes "old users sign in and get back to it" actually true
 * (Nick, 2026-08-24), not just usually true: a returning signed-in user's
 * auth restores from AsyncStorage fast, but loading THEIR SAVED PROFILE
 * from Firebase is a separate async step — without waiting for it too,
 * (tabs) could mount for a frame on the still-local demo profile and pop
 * the workplace-entry sheet open before their real data arrived behind
 * it. Holding the splash for bootChecked as well closes that gap.
 */
export default function RootLayout() {
  const authStatus = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const exploring = useAppEntryStore((s) => s.exploring);
  const bootChecked = useAppEntryStore((s) => s.bootChecked);

  useEffect(() => {
    configureGoogleSignIn(GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID);
  }, []);

  if (authStatus === 'checking' || !bootChecked) {
    return <CheckingSplash />;
  }

  const ready = Boolean(user) || exploring;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.cream },
        }}
      >
        <Stack.Protected guard={!ready}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Protected guard={ready}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** Firebase's persisted-session check is a local AsyncStorage read, not a
 *  network call, so this is normally on screen for a beat at most — long
 *  enough that rendering nothing at all would read as a hang, short enough
 *  that it doesn't need its own illustration or copy. */
function CheckingSplash() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.cream,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <ActivityIndicator size="small" color={colors.copper} />
    </View>
  );
}
