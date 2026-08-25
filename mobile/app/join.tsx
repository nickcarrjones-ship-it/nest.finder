import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '../theme';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { useHouseholdStore } from '../store/householdStore';
import { joinHousehold } from '../lib/household';

/**
 * Reachable two ways: someone taps "Have a code?" inside the app (empty
 * input, type it in), or scans a household QR code with their phone's OWN
 * camera app — which opens maloca://join?code=XXXX directly, since that's
 * a real Expo Router route under the app's existing "maloca" scheme, not
 * an in-app scanner (that would need a native camera module and its own
 * rebuild cycle — this needs none).
 *
 * Deliberately NOT wrapped in Stack.Protected: a shared code might arrive
 * before someone's ever opened the app, so this has to be reachable
 * regardless of the welcome/(tabs) gate in app/_layout.tsx.
 */
export default function JoinScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const user = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.status);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const setProfile = useProfileStore((s) => s.setProfile);
  const setHouseholdId = useHouseholdStore((s) => s.setHouseholdId);

  const [code, setCode] = useState(typeof params.code === 'string' ? params.code.toUpperCase() : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set the moment someone taps Join while signed out — carries the intent
  // across the sign-in round trip so it can auto-continue once it resolves,
  // rather than making them tap Join a second time.
  const pendingRef = useRef(false);

  async function submit() {
    if (code.trim().length < 6) return;
    if (!user) {
      pendingRef.current = true;
      signInWithGoogle();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await joinHousehold(code);
      setHouseholdId(result.householdId);
      if (result.profile) setProfile(result.profile);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (user && pendingRef.current) {
      pendingRef.current = false;
      submit();
    }
    // submit() closes over `code`/`user` freshly each render — re-running
    // this only on `user` changing (the sign-in resolving) is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom }]}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>
      <Text style={styles.title}>Join a household</Text>
      <Text style={styles.hint}>Enter the code someone in the household sent you.</Text>

      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        placeholder="XK4P9R2Q"
        placeholderTextColor={colors.inkGhost}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        style={styles.input}
      />

      <Pressable
        onPress={submit}
        disabled={busy || code.trim().length < 6}
        style={[styles.primaryBtn, (busy || code.trim().length < 6) && styles.primaryBtnDisabled]}
        accessibilityRole="button"
      >
        {busy || (authStatus === 'signing-in' && pendingRef.current) ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={styles.primaryBtnText}>{user ? 'Join household' : 'Sign in and join'}</Text>
        )}
      </Pressable>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: spacing.lg },
  back: { ...type.body, fontSize: 15, color: colors.teal, marginBottom: spacing.md },
  title: { ...type.title, color: colors.ink, marginBottom: 4 },
  hint: { ...type.body, fontSize: 13.5, lineHeight: 19, color: colors.inkLt, marginBottom: spacing.lg },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: 20,
    letterSpacing: 3,
    textAlign: 'center',
    color: colors.ink,
    marginBottom: spacing.md,
  },
  primaryBtn: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { ...type.bodyStrong, fontSize: 15, color: colors.white },
  errorText: { fontSize: 12.5, color: colors.red, textAlign: 'center', marginTop: spacing.sm },
});
