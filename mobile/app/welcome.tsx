import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '../theme';
import { MalocaLogo } from '../components/MalocaLogo';
import { useAppEntryStore } from '../store/appEntryStore';
import { useAuthStore } from '../store/authStore';

/**
 * The app's actual front door — gated in via app/_layout.tsx's
 * Stack.Protected, not something screens navigate to directly. Shown
 * whenever nobody's signed in AND nobody's chosen to explore yet; a
 * returning signed-in user skips straight past this to the map (that's
 * the "get back to it" Nick asked for — no extra tap once you're already
 * authenticated).
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const startExploring = useAppEntryStore((s) => s.startExploring);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const authStatus = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.hero}>
        <MalocaLogo scale={1.3} tagline />
      </View>

      <View style={styles.actions}>
        <Pressable onPress={startExploring} style={styles.primaryBtn} accessibilityRole="button">
          <Text style={styles.primaryBtnText}>Get started</Text>
        </Pressable>

        <Pressable
          onPress={() => signInWithGoogle()}
          disabled={authStatus === 'signing-in'}
          style={[styles.secondaryBtn, authStatus === 'signing-in' && styles.secondaryBtnBusy]}
          accessibilityRole="button"
        >
          {authStatus === 'signing-in' ? (
            <ActivityIndicator size="small" color={colors.ink} />
          ) : (
            <Text style={styles.secondaryBtnText}>I already have an account</Text>
          )}
        </Pressable>

        {authStatus === 'error' && authError && (
          <Text style={styles.errorText}>Couldn't sign in: {authError}</Text>
        )}

        {/* Goes straight to /household regardless of sign-in state — that
            screen already prompts to sign in itself if needed (2026-08-25:
            the earlier version here waited for sign-in to resolve first via
            a pending-ref + effect, which raced against Stack.Protected
            swapping welcome for (tabs) on the same state change and could
            lose the navigation entirely, landing someone on the map with
            no way back to this except hunting through Settings — this is
            simpler AND doesn't have that race, since household/join are
            reachable regardless of `ready`). */}
        <Pressable onPress={() => router.push('/household')} style={styles.tertiaryBtn} accessibilityRole="button">
          <Text style={styles.tertiaryBtnText}>Sync with existing account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
  },
  hero: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  actions: { gap: spacing.md },
  primaryBtn: {
    backgroundColor: colors.terracotta,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    shadowColor: colors.terracotta,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryBtnText: {
    ...type.bodyStrong, fontSize: 17, color: colors.white,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  secondaryBtn: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.rule,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  secondaryBtnBusy: { opacity: 0.7 },
  secondaryBtnText: {
    ...type.bodyStrong, fontSize: 15.5, color: colors.ink,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  errorText: { fontSize: 12.5, color: colors.red, textAlign: 'center' },
  tertiaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  tertiaryBtnText: { ...type.bodyStrong, fontSize: 14, color: colors.terracotta },
});
