import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { MalocaMark } from './MalocaLogo';

interface Props {
  areaCount: number;
  maxCommuteMins: number;
  onPress: () => void;
}

/**
 * The way in, and deliberately the smallest one that works.
 *
 * It replaces a full pitch panel that used to appear on a twelve-second
 * timer after someone touched the slider (Nick, 2026-08-29: "the final CTA
 * displays after X number of timeline play arounds, or after a certain
 * amount of time"). A stopwatch interrupts the person still exploring and
 * arrives far too late for the person who understood it immediately.
 *
 * So this is triggered by the moment instead — see the interaction count in
 * app/(tabs)/index.tsx. By the time someone has moved the slider a few
 * times they have their answer to "where COULD we live", and it is several
 * hundred areas long. That is exactly the point at which the free map stops
 * being enough, and it is the question the Agent exists to answer.
 *
 * Both numbers are read out of their own map rather than written as copy —
 * "212 areas" and "45 minutes" are their result, "lots of areas" is
 * marketing.
 *
 * Restyled 2026-08-29 (Nick: "make this box more visually drawing"). The
 * card is navy — colors.ink, the same fill as the M in the wordmark —
 * rather than a plain white card, so it reads as a deliberate moment
 * rather than another row in the stack. The button is the Maloca mark
 * itself in a cream circle, the exact lockup the splash screen uses,
 * instead of a bare arrow: since the tap leads to the Agent, the button
 * can just say so visually rather than with a generic chevron. A "TAP
 * HERE" label and a continuous scale pulse (Nick, same session) sit above
 * and on that circle so it reads as pressable rather than decorative —
 * the whole point of a card that otherwise looks like a card, not a
 * button, is that nothing about its shape says "tap me" without help.
 */
export function UnlockBar({ areaCount, maxCommuteMins, onPress }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.12,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${areaCount} areas will get you to work within ${maxCommuteMins} minutes. Let's narrow that down to ones that suit your vibe.`}
    >
      <View style={styles.copy}>
        <Text style={styles.count}>
          <Text style={styles.number}>{areaCount}</Text> areas will get you to work within{' '}
          <Text style={styles.number}>{maxCommuteMins}</Text> minutes
        </Text>
        <Text style={styles.ask}>Let's narrow that down to ones that suit your vibe.</Text>
      </View>
      <View style={styles.btnCol}>
        <Text style={styles.tapLabel}>Tap here</Text>
        <Animated.View style={[styles.markBtn, { transform: [{ scale: pulse }] }]}>
          <MalocaMark height={20} markColor={colors.ink} counterColor={colors.teal} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  pressed: { opacity: 0.92 },
  copy: { flex: 1, gap: 4 },
  // No token for "dimmed text on a dark fill" exists in theme yet — this is
  // the one place in the app that needed it, so it's inline rather than
  // adding a token for a single caller.
  count: { ...type.body, fontSize: 12.5, color: 'rgba(242,241,238,0.68)' },
  number: { fontFamily: fonts.bold, color: colors.teal },
  ask: { fontFamily: fonts.semibold, fontSize: 15.5, lineHeight: 20, color: colors.cream },
  btnCol: { alignItems: 'center', gap: 3 },
  tapLabel: {
    fontFamily: fonts.bold,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.cream,
  },
  markBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
