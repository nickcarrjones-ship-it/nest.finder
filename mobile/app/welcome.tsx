import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing, type } from '../theme';
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
  // The hero is sized to the same width as the buttons below it, so the
  // wordmark, the tagline and the Get started button all share both edges
  // (Nick, 2026-08-26). spacing.xl is the screen's horizontal padding, so
  // this is exactly what a full-width button spans.
  const { width } = useWindowDimensions();
  const heroWidth = width - spacing.xl * 2;
  const startExploring = useAppEntryStore((s) => s.startExploring);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const authStatus = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);

  /**
   * Both lines sized to whichever needs to be smallest, so they match and
   * neither wraps.
   *
   * Measured from the font's own advance widths rather than guessed: the
   * longer line is 21.2 em wide with the ampersand, so at 17px it needs
   * 360dp. That fits a 412dp phone and not a 375dp one — hence sizing to
   * the space actually available rather than picking a number that happens
   * to work on the device in my hand.
   *
   * `and` became `&` for the same reason: it buys about 17dp, which is the
   * difference between fitting and wrapping on a normal phone.
   */
  const [pitchWidth, setPitchWidth] = useState(0);
  // Measured from the TTFs with each run in the face it actually renders
  // in — regular for the running text, bold-italic for the emphasised
  // words. Line one is the longer at 21.24em; line two is 20.71em.
  const LONGEST_LINE_EM = 21.3;
  // Headroom for letter-spacing and platform rounding, neither of which
  // the raw advance widths account for.
  const SAFETY = 0.98;
  const pitchSize = pitchWidth
    ? Math.min(17, (pitchWidth / LONGEST_LINE_EM) * SAFETY)
    : 15;

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

          The emphasised words use a real bold-italic FACE, not fontWeight
          plus fontStyle. React Native will not combine those on a custom
          family: it renders one and silently drops the other, so "vibe"
          would have come out italic but not bold.
        */}
        <View style={styles.pitch} onLayout={(e) => setPitchWidth(e.nativeEvent.layout.width)}>
          <Text style={[styles.pitchLine, { fontSize: pitchSize, lineHeight: pitchSize * 1.4 }]} numberOfLines={1}>
            Find neighbourhoods that fit your <Text style={styles.em}>vibe</Text> &{' '}
            <Text style={styles.em}>commute</Text>.
          </Text>
          <Text style={[styles.pitchLine, { fontSize: pitchSize, lineHeight: pitchSize * 1.4 }]} numberOfLines={1}>
            <Text style={styles.em}>Rank your viewings</Text> on what matters most to{' '}
            <Text style={styles.em}>you</Text>.
          </Text>
        </View>
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
  hero: { alignItems: 'flex-start', flex: 1, justifyContent: 'center' },
  /**
   * Centred under the wordmark.
   *
   * Left-aligned, the two lines end 9dp apart — only 2.7% different, but
   * enough to read as a ragged right edge against a hard left one (Nick,
   * 2026-08-29). Centred, that difference splits either side and the block
   * reads as deliberate.
   */
  pitch: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  pitchLine: {
    fontFamily: fonts.regular,
    letterSpacing: -0.2,
    color: colors.inkMid,
    textAlign: 'center',
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
