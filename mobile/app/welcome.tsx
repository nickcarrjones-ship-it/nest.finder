import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const startExploring = useAppEntryStore((s) => s.startExploring);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const authStatus = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);

  function handleHousemateSync() {
    Alert.alert(
      'Coming soon',
      'Linking housemates to one shared profile is on the way. For now, each person can explore or sign in on their own phone.',
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.hero}>
        <MalocaLogo scale={1.3} tagline />
      </View>

      <View style={styles.actions}>
        <Pressable onPress={startExploring} style={styles.primaryBtn} accessibilityRole="button">
          <Text style={styles.primaryBtnText}>Explore Maloca</Text>
          <Text style={styles.primaryBtnSub}>See where you could live — no account needed</Text>
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
            <>
              <Text style={styles.secondaryBtnText}>Sign in with Google</Text>
              <Text style={styles.secondaryBtnSub}>Already exploring? Pick up where you left off</Text>
            </>
          )}
        </Pressable>

        {authStatus === 'error' && authError && (
          <Text style={styles.errorText}>Couldn't sign in: {authError}</Text>
        )}

        <Pressable onPress={handleHousemateSync} style={styles.tertiaryBtn} accessibilityRole="button">
          <Text style={styles.tertiaryBtnText}>Sync with housemates</Text>
          <View style={styles.soonBadge}>
            <Text style={styles.soonBadgeText}>Coming soon</Text>
          </View>
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
    backgroundColor: colors.copper,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    shadowColor: colors.copper,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryBtnText: { ...type.bodyStrong, fontSize: 17, color: colors.white },
  primaryBtnSub: { ...type.body, fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
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
  secondaryBtnText: { ...type.bodyStrong, fontSize: 15.5, color: colors.ink },
  secondaryBtnSub: { ...type.body, fontSize: 12, color: colors.inkLt, marginTop: 2 },
  errorText: { fontSize: 12.5, color: colors.red, textAlign: 'center' },
  tertiaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  tertiaryBtnText: { ...type.body, fontSize: 13.5, color: colors.inkGhost },
  soonBadge: {
    backgroundColor: colors.creamMid,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  soonBadgeText: { fontSize: 9.5, fontWeight: '700', color: colors.inkLt },
});
