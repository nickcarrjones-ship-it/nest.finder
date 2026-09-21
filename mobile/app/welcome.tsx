import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing, type } from '../theme';
import { MalocaLogo } from '../components/MalocaLogo';
import { useAppEntryStore } from '../store/appEntryStore';
import { useAuthStore } from '../store/authStore';
import { SignInSheet } from '../components/SignInSheet';

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
  // The hero is sized to the same width as the buttons below it, so the
  // wordmark, the tagline and the Get started button all share both edges
  // (Nick, 2026-08-26). spacing.xl is the screen's horizontal padding, so
  // this is exactly what a full-width button spans.
  const { width } = useWindowDimensions();
  const heroWidth = width - spacing.xl * 2;
  const startExploring = useAppEntryStore((s) => s.startExploring);
  const [signInOpen, setSignInOpen] = useState(false);
  const authStatus = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);


  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.hero}>
        <MalocaLogo fitWidth={heroWidth} />

        {/*
          Two sentences instead of "a new way to find your perfect home"
          (Nick, 2026-08-29). That line was pleasant and said nothing — it
          could have been any property app. These name the two things that
          are actually ours, so nobody has to press Get started on faith to
          find out what this is.

          ONE Text that wraps, not a line per sentence (Nick, 2026-09-21:
          "needs to read as one set of text, don't start Discover on a
          second line"). It used to be three hard-broken lines, each
          numberOfLines={1}, sized by measuring the font's advance widths
          against the available space — and when the wording changed on
          2026-09-21 the longest line got longer than the constant that
          maths was built on, so "neighbourhoods" was silently truncated to
          "neighbourhoo…". A paragraph that wraps cannot fail that way: the
          text decides where the breaks go, and nothing is ever cut off.

          The emphasised words use a real bold-italic FACE, not fontWeight
          plus fontStyle. React Native will not combine those on a custom
          family: it renders one and silently drops the other, so "vibe"
          would have come out italic but not bold.
        */}
        <View style={styles.pitch}>
          <Text style={styles.pitchText}>
            A new way to <Text style={styles.em}>house hunt</Text>. Discover the home of your
            dreams in neighbourhoods that fit your <Text style={styles.em}>vibe</Text> and{' '}
            <Text style={styles.em}>commute</Text>.
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={startExploring} style={styles.primaryBtn} accessibilityRole="button">
          <Text style={styles.primaryBtnText}>Get started</Text>
        </Pressable>

        <Pressable
          onPress={() => setSignInOpen(true)}
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

      </View>
      <SignInSheet
        visible={signInOpen}
        onClose={() => setSignInOpen(false)}
        reason="Welcome back. Sign in and your household, your areas and your viewings come with you."
      />
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
  hero: { alignItems: 'flex-start', flex: 1, justifyContent: 'center' },
  /**
   * Centred under the wordmark (Nick, 2026-08-29): left-aligned, the
   * ragged right edge read as an accident against the hard left one.
   */
  pitch: { alignSelf: 'stretch', alignItems: 'center', marginTop: spacing.xl },
  pitchText: {
    fontFamily: fonts.regular,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: colors.inkMid,
    textAlign: 'center',
    // Keeps the wrap from leaving one short word stranded on its own line.
    maxWidth: 330,
  },
  /**
   * Teal on the emphasised words only.
   *
   * Teal is 4.29:1 against cream — under the 4.5:1 needed for regular body
   * text, but comfortably over the 3:1 that bold text needs. So it works on
   * exactly the words that are already bold, and the running text stays
   * inkMid at 7.06:1. It also puts the brand colour on the four words worth
   * remembering rather than the whole paragraph.
   */
  em: { fontFamily: fonts.boldItalic, color: colors.teal },
  actions: { gap: spacing.md },
  primaryBtn: {
    backgroundColor: colors.teal,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    shadowColor: colors.teal,
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
  errorText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.red, textAlign: 'center' },
});
